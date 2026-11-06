"""Step 5: store vectors. ChromaDB when installed, otherwise a persistent NumPy store."""
from __future__ import annotations

import json
import shutil
from typing import Callable

import numpy as np

from . import config
from .embeddings import get_embedder

BATCH = 64


def _embed_text(c: dict) -> str:
    return f"{c['path']}\n{c['text']}"  # file path in the embedding makes "where is auth?" work


class NumpyStore:
    kind = "numpy"

    def _paths(self, repo_id):
        return config.NUMPY_DIR / f"{repo_id}.npy", config.NUMPY_DIR / f"{repo_id}.json"

    def add(self, repo_id, chunks, vectors):
        npy, meta = self._paths(repo_id)
        np.save(npy, np.asarray(vectors, dtype=np.float32))
        meta.write_text(json.dumps(chunks))

    def query(self, repo_id, vector, k):
        npy, meta = self._paths(repo_id)
        if not npy.exists():
            return []
        mat = np.load(npy)
        chunks = json.loads(meta.read_text())
        if mat.ndim != 2 or mat.shape[0] == 0 or mat.shape[1] != len(vector):
            return []
        scores = mat @ np.asarray(vector, dtype=np.float32)
        top = np.argsort(-scores)[:k]
        return [{**chunks[i], "score": float(scores[i])} for i in top]

    def delete(self, repo_id):
        for p in self._paths(repo_id):
            p.unlink(missing_ok=True)


class ChromaStore:
    kind = "chroma"

    def __init__(self):
        import chromadb

        self.client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))

    def _col(self, repo_id):
        return self.client.get_or_create_collection(f"repo_{repo_id}", metadata={"hnsw:space": "cosine"})

    def add(self, repo_id, chunks, vectors):
        col = self._col(repo_id)
        for i in range(0, len(chunks), 128):
            part = chunks[i:i + 128]
            col.add(
                ids=[c["id"] for c in part],
                embeddings=vectors[i:i + 128],
                documents=[c["text"] for c in part],
                metadatas=[{k: c[k] for k in ("path", "language", "start", "end", "symbol")} for c in part],
            )

    def query(self, repo_id, vector, k):
        col = self._col(repo_id)
        if col.count() == 0:
            return []
        res = col.query(query_embeddings=[vector], n_results=min(k, col.count()))
        out = []
        for id_, doc, meta, dist in zip(res["ids"][0], res["documents"][0],
                                        res["metadatas"][0], res["distances"][0]):
            out.append({"id": id_, "text": doc, **meta, "score": 1.0 - float(dist)})
        return out

    def delete(self, repo_id):
        try:
            self.client.delete_collection(f"repo_{repo_id}")
        except Exception:
            pass


_store = None


def get_store():
    global _store
    if _store is None:
        if config.STORE_BACKEND in ("auto", "chroma"):
            try:
                _store = ChromaStore()
            except Exception as e:
                if config.STORE_BACKEND == "chroma":
                    raise
                print(f"[devdocs] ChromaDB unavailable ({type(e).__name__}); using NumPy vector store")
        if _store is None:
            _store = NumpyStore()
    return _store


def index_chunks(repo_id: str, chunks: list[dict], on_progress: Callable[[float], None] | None = None):
    emb, store = get_embedder(), get_store()
    store.delete(repo_id)
    vectors: list[list[float]] = []
    for i in range(0, len(chunks), BATCH):
        vectors.extend(emb.embed_documents([_embed_text(c) for c in chunks[i:i + BATCH]]))
        if on_progress:
            on_progress(min(1.0, (i + BATCH) / len(chunks)))
    if chunks:
        store.add(repo_id, chunks, vectors)


def search(repo_id: str, query: str, k: int) -> list[dict]:
    return get_store().query(repo_id, get_embedder().embed_query(query), k)


def delete_index(repo_id: str):
    get_store().delete(repo_id)
    shutil.rmtree(config.NUMPY_DIR / repo_id, ignore_errors=True)
