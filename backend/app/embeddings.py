"""Step 4: turn text into vectors.

Default: sentence-transformers (through LangChain). If it is not installed, a deterministic
hashing embedder keeps the app fully functional (keyword-aware, no model download).
"""
from __future__ import annotations

import math
import re
import threading
import zlib
from collections import Counter

import numpy as np

from . import config

_STOP = set("""a an the and or of to in on for with from by is are was be it this that as at if
else then return import from def class self cls none true false null new var let const function
public private static void int str string do does how what where which who when why can i me my
we you your our their there here has have not no yes use used using file files code""".split())
_SPLIT = re.compile(r"[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+")


def tokenize(text: str) -> list[str]:
    """Split identifiers: loginUser / login_user -> login, user."""
    words = []
    for ident in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text):
        words.extend(w.lower() for w in _SPLIT.findall(ident))
    return [w for w in words if len(w) > 1 and w not in _STOP]


class HashingEmbedder:
    name = "hash-1024"
    dim = 1024

    def _vec(self, text: str) -> np.ndarray:
        v = np.zeros(self.dim, dtype=np.float32)
        toks = tokenize(text)
        feats: Counter[str] = Counter()
        for t in toks:
            feats[t] += 1.0
            if len(t) > 4:
                feats["~" + t[:4]] += 0.5        # crude stem: authentication ~ authenticate ~ auth
        for a, b in zip(toks, toks[1:]):
            feats[f"{a}_{b}"] += 0.5
        for f, c in feats.items():
            h = zlib.crc32(f.encode())
            v[h % self.dim] += (1 if (h >> 20) & 1 else -1) * (1 + math.log(c))
        norm = np.linalg.norm(v)
        return v / norm if norm else v

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t).tolist() for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text).tolist()


class _STEmbedder:
    def __init__(self):
        from langchain_huggingface import HuggingFaceEmbeddings

        self._model = HuggingFaceEmbeddings(
            model_name=config.EMBEDDING_MODEL, encode_kwargs={"normalize_embeddings": True})
        self.name = config.EMBEDDING_MODEL.split("/")[-1]

    def embed_documents(self, texts):
        return self._model.embed_documents(texts)

    def embed_query(self, text):
        return self._model.embed_query(text)


_lock = threading.Lock()
_embedder = None


def get_embedder():
    global _embedder
    with _lock:
        if _embedder is None:
            if config.EMBEDDING_BACKEND in ("auto", "sentence-transformers"):
                try:
                    _embedder = _STEmbedder()
                except Exception as e:
                    if config.EMBEDDING_BACKEND == "sentence-transformers":
                        raise
                    print(f"[devdocs] sentence-transformers unavailable ({type(e).__name__}); using hashing embedder")
            if _embedder is None:
                _embedder = HashingEmbedder()
        return _embedder
