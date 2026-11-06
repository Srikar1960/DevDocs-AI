"""DevDocs AI — FastAPI application."""
from __future__ import annotations

import json
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, llm, rag, registry
from .embeddings import get_embedder
from .ingest import (chunk_document, clone_repo, extract_zip, load_documents, parse_github_url)
from .vectorstore import delete_index, get_store, index_chunks

registry.init()
threading.Thread(target=get_embedder, daemon=True).start()  # warm up the embedding model
app = FastAPI(title="DevDocs AI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


class RepoIn(BaseModel):
    url: str = Field(min_length=8, max_length=300)


class ChatIn(BaseModel):
    repo_id: str
    question: str = Field(min_length=1, max_length=2000)


# --------------------------------------------------------------------------- indexing job
def run_indexing(repo_id: str, url: str | None = None, zip_path: Path | None = None) -> None:
    workdir = config.REPOS_DIR / repo_id
    try:
        registry.update_repo(repo_id, status="fetching", progress=0.05, error=None)
        shutil.rmtree(workdir, ignore_errors=True)
        if url:
            name = clone_repo(url, workdir)
            registry.update_repo(repo_id, name=name)
            root = workdir
        else:
            root = extract_zip(zip_path, workdir)

        registry.update_repo(repo_id, status="reading", progress=0.2)
        docs = load_documents(root)
        if not docs:
            raise ValueError("No readable source files were found in this repository.")
        chunks, rows, langs = [], [], {}
        for d in docs:
            cs = chunk_document(d)
            chunks.extend(cs)
            rows.append((d["path"], d["language"], d["lines"], len(cs)))
            langs[d["language"]] = langs.get(d["language"], 0) + d["lines"]
        if not chunks:
            raise ValueError("The repository has no indexable content.")

        embedder = get_embedder()
        registry.update_repo(repo_id, status="embedding", progress=0.3)
        index_chunks(repo_id, chunks, lambda f: registry.update_repo(repo_id, progress=0.3 + 0.7 * f))

        registry.save_files(repo_id, rows)
        registry.update_repo(repo_id, status="ready", progress=1.0, files=len(docs), chunks=len(chunks),
                             lines=sum(r[2] for r in rows), languages=langs, embedder=embedder.name)
    except Exception as e:  # surface every failure in the UI instead of dying silently
        delete_index(repo_id)
        registry.update_repo(repo_id, status="error", error=str(e) or type(e).__name__)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        if zip_path:
            zip_path.unlink(missing_ok=True)


# --------------------------------------------------------------------------- routes
@app.get("/api/health")
def health():
    emb = get_embedder()
    return {"status": "ok", "llm_provider": llm.provider(), "llm_model": llm.model_name(),
            "embedder": emb.name, "vector_store": get_store().kind}


@app.get("/api/repos")
def list_repos():
    return registry.list_repos()


@app.post("/api/repos", status_code=202)
def add_repo(body: RepoIn, tasks: BackgroundTasks):
    try:
        owner, repo, branch = parse_github_url(body.url)
    except ValueError as e:
        raise HTTPException(422, str(e))
    full = f"https://github.com/{owner}/{repo}" + (f"/tree/{branch}" if branch else "")
    for r in registry.list_repos():
        if r["source"] == full and r["status"] in ("queued", "fetching", "reading", "embedding"):
            raise HTTPException(409, "That repository is already being indexed.")
    repo_id = uuid.uuid4().hex[:12]
    rec = registry.create_repo(repo_id, f"{owner}/{repo}", full, "github")
    tasks.add_task(run_indexing, repo_id, url=full)
    return rec


@app.post("/api/repos/upload", status_code=202)
async def upload_repo(tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(422, "Upload a .zip file of your project.")
    data = await file.read()
    if len(data) > config.MAX_ZIP_BYTES:
        raise HTTPException(413, "The zip is larger than 100 MB.")
    repo_id = uuid.uuid4().hex[:12]
    zip_path = config.UPLOADS_DIR / f"{repo_id}.zip"
    zip_path.write_bytes(data)
    rec = registry.create_repo(repo_id, file.filename[:-4], "upload", "zip")
    tasks.add_task(run_indexing, repo_id, zip_path=zip_path)
    return rec


def _repo_or_404(repo_id: str) -> dict:
    repo = registry.get_repo(repo_id)
    if not repo:
        raise HTTPException(404, "Repository not found.")
    return repo


@app.get("/api/repos/{repo_id}")
def get_repo(repo_id: str):
    return _repo_or_404(repo_id)


@app.post("/api/repos/{repo_id}/reindex", status_code=202)
def reindex(repo_id: str, tasks: BackgroundTasks):
    repo = _repo_or_404(repo_id)
    if repo["kind"] != "github":
        raise HTTPException(422, "Only GitHub repositories can be re-indexed. Upload the zip again instead.")
    if repo["status"] in ("queued", "fetching", "reading", "embedding"):
        raise HTTPException(409, "This repository is already being indexed.")
    registry.update_repo(repo_id, status="queued", progress=0, error=None)
    tasks.add_task(run_indexing, repo_id, url=repo["source"])
    return registry.get_repo(repo_id)


@app.delete("/api/repos/{repo_id}")
def delete_repo(repo_id: str):
    _repo_or_404(repo_id)
    delete_index(repo_id)
    registry.delete_repo(repo_id)
    return {"ok": True}


@app.get("/api/repos/{repo_id}/files")
def files(repo_id: str):
    _repo_or_404(repo_id)
    return registry.list_files(repo_id)


@app.get("/api/repos/{repo_id}/messages")
def messages(repo_id: str):
    _repo_or_404(repo_id)
    return registry.list_messages(repo_id)


@app.delete("/api/repos/{repo_id}/messages")
def clear_messages(repo_id: str):
    _repo_or_404(repo_id)
    registry.clear_messages(repo_id)
    return {"ok": True}


@app.post("/api/chat")
def chat(body: ChatIn):
    """Streams newline-delimited JSON events: sources, token..., done | error."""
    repo = _repo_or_404(body.repo_id)
    if repo["status"] != "ready":
        raise HTTPException(409, "This repository isn't ready yet.")
    if repo["embedder"] and repo["embedder"] != get_embedder().name:
        raise HTTPException(409, "The embedding model changed since this repo was indexed. Re-index it.")
    history = registry.list_messages(body.repo_id, limit=config.HISTORY_TURNS)
    registry.add_message(body.repo_id, "user", body.question)

    def events():
        text, sources, failed = [], [], False
        try:
            for ev in rag.answer(repo, body.question, history):
                if ev["type"] == "sources":
                    sources = ev["sources"]
                elif ev["type"] == "token":
                    text.append(ev["text"])
                elif ev["type"] == "error":
                    failed = True
                yield json.dumps(ev) + "\n"
        finally:  # also runs when the client presses Stop, so partial answers are kept
            if text and not failed:
                registry.add_message(body.repo_id, "assistant", "".join(text), sources)

    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# Serve the built React app (npm run build) from the same server, if present.
if config.FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="web")
