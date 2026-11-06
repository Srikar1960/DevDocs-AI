"""SQLite persistence: repositories, their file index, and chat history."""
from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL, progress REAL DEFAULT 0, files INTEGER DEFAULT 0, chunks INTEGER DEFAULT 0,
  lines INTEGER DEFAULT 0, languages TEXT DEFAULT '{}', embedder TEXT, error TEXT,
  created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  repo_id TEXT NOT NULL, path TEXT NOT NULL, language TEXT, lines INTEGER, chunks INTEGER,
  PRIMARY KEY (repo_id, path)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, repo_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, sources TEXT DEFAULT '[]', created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_repo ON messages(repo_id, id);
"""
IN_PROGRESS = ("queued", "fetching", "reading", "embedding")


@contextmanager
def _db():
    con = sqlite3.connect(config.DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init() -> None:
    with _db() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(SCHEMA)
        con.execute("UPDATE repos SET status='error', error='Indexing was interrupted. Re-index to try again.' "
                    f"WHERE status IN ({','.join('?' * len(IN_PROGRESS))})", IN_PROGRESS)


def _repo(row) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    d["languages"] = json.loads(d["languages"] or "{}")
    return d


def create_repo(repo_id: str, name: str, source: str, kind: str) -> dict:
    now = time.time()
    with _db() as con:
        con.execute("INSERT INTO repos (id,name,source,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                    (repo_id, name, source, kind, "queued", now, now))
    return get_repo(repo_id)


def update_repo(repo_id: str, **fields) -> None:
    if "languages" in fields:
        fields["languages"] = json.dumps(fields["languages"])
    fields["updated_at"] = time.time()
    cols = ", ".join(f"{k}=?" for k in fields)
    with _db() as con:
        con.execute(f"UPDATE repos SET {cols} WHERE id=?", (*fields.values(), repo_id))


def get_repo(repo_id: str) -> dict | None:
    with _db() as con:
        return _repo(con.execute("SELECT * FROM repos WHERE id=?", (repo_id,)).fetchone())


def list_repos() -> list[dict]:
    with _db() as con:
        return [_repo(r) for r in con.execute("SELECT * FROM repos ORDER BY created_at DESC")]


def delete_repo(repo_id: str) -> None:
    with _db() as con:
        for table in ("repos", "files", "messages"):
            col = "id" if table == "repos" else "repo_id"
            con.execute(f"DELETE FROM {table} WHERE {col}=?", (repo_id,))


def save_files(repo_id: str, rows: list[tuple]) -> None:
    with _db() as con:
        con.execute("DELETE FROM files WHERE repo_id=?", (repo_id,))
        con.executemany("INSERT INTO files VALUES (?,?,?,?,?)", [(repo_id, *r) for r in rows])


def list_files(repo_id: str) -> list[dict]:
    with _db() as con:
        return [dict(r) for r in con.execute(
            "SELECT path, language, lines, chunks FROM files WHERE repo_id=? ORDER BY path", (repo_id,))]


def add_message(repo_id: str, role: str, content: str, sources: list | None = None) -> None:
    with _db() as con:
        con.execute("INSERT INTO messages (repo_id,role,content,sources,created_at) VALUES (?,?,?,?,?)",
                    (repo_id, role, content, json.dumps(sources or []), time.time()))


def list_messages(repo_id: str, limit: int = 200) -> list[dict]:
    with _db() as con:
        rows = con.execute("SELECT * FROM messages WHERE repo_id=? ORDER BY id DESC LIMIT ?",
                           (repo_id, limit)).fetchall()
    return [{"id": r["id"], "role": r["role"], "content": r["content"],
             "sources": json.loads(r["sources"]), "created_at": r["created_at"]} for r in reversed(rows)]


def clear_messages(repo_id: str) -> None:
    with _db() as con:
        con.execute("DELETE FROM messages WHERE repo_id=?", (repo_id,))
