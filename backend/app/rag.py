"""Step 6-7: retrieve the most relevant chunks, then generate a cited answer."""
from __future__ import annotations

from typing import Iterator

from . import config, llm, vectorstore
from .embeddings import tokenize


def retrieve(repo_id: str, question: str, k: int | None = None) -> list[dict]:
    """Vector similarity, lightly re-ranked by file-path / symbol matches, de-duplicated."""
    k = k or config.TOP_K
    candidates = vectorstore.search(repo_id, question, k * 3)
    terms = set(tokenize(question))
    for c in candidates:
        path_terms = set(tokenize(c["path"]))
        sym_terms = set(tokenize(c.get("symbol", "")))
        c["score"] += 0.06 * min(len(terms & path_terms), 3) + 0.05 * min(len(terms & sym_terms), 2)
    candidates.sort(key=lambda c: -c["score"])
    picked: list[dict] = []
    for c in candidates:
        overlaps = any(p["path"] == c["path"] and c["start"] <= p["end"] and p["start"] <= c["end"] for p in picked)
        if not overlaps:
            picked.append(c)
        if len(picked) == k:
            break
    return picked


def answer(repo: dict, question: str, history: list[dict]) -> Iterator[dict]:
    """Yields events: sources -> token* -> done (or error)."""
    chunks = retrieve(repo["id"], question)
    sources = [{**c, "n": i + 1, "score": round(max(c["score"], 0), 3)} for i, c in enumerate(chunks)]
    yield {"type": "sources", "sources": sources}
    if not chunks:
        yield {"type": "token", "text": "I couldn't find any indexed code for this repository."}
        yield {"type": "done"}
        return
    try:
        for piece in llm.stream_answer(question, chunks, history, repo["name"]):
            yield {"type": "token", "text": piece}
        yield {"type": "done"}
    except Exception as e:  # provider/network/quota errors reach the UI as readable messages
        yield {"type": "error", "message": f"{llm.provider().title()} request failed: {str(e)[:300]}"}
