"""Step 1-3 of the RAG pipeline: fetch source, read files, split into chunks."""
from __future__ import annotations

import os
import re
import subprocess
import zipfile
from pathlib import Path

from . import config

LANGUAGES = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".cjs": "javascript", ".ts": "typescript", ".tsx": "typescript", ".java": "java",
    ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php", ".c": "c", ".h": "c",
    ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp", ".cs": "csharp", ".kt": "kotlin",
    ".swift": "swift", ".scala": "scala", ".sh": "shell", ".sql": "sql", ".html": "html",
    ".css": "css", ".scss": "scss", ".vue": "vue", ".svelte": "svelte", ".md": "markdown",
    ".mdx": "markdown", ".json": "json", ".yml": "yaml", ".yaml": "yaml", ".toml": "toml",
    ".ini": "ini", ".xml": "xml", ".gradle": "gradle", ".proto": "protobuf",
    ".graphql": "graphql", ".tf": "terraform", ".dart": "dart", ".lua": "lua", ".r": "r",
}
NAMED_FILES = {"dockerfile": "dockerfile", "makefile": "makefile", ".env.example": "env"}
DATA_LANGS = {"json", "yaml", "toml", "xml", "ini"}  # config/data files: keep only small ones

SKIP_DIRS = {
    ".git", "node_modules", "venv", ".venv", "env", "__pycache__", "dist", "build", "target",
    ".next", ".nuxt", ".idea", ".vscode", "vendor", "coverage", ".gradle", "bin", "obj",
    ".tox", ".mypy_cache", ".pytest_cache", "site-packages", ".cache", "out", "__snapshots__",
}
SKIP_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "cargo.lock",
    "composer.lock", "gemfile.lock", "go.sum", "pipfile.lock", "bun.lockb",
}
SKIP_SUFFIXES = (".min.js", ".min.css", ".map", ".svg", ".lock")

GITHUB_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?"
    r"(?:/tree/([^/\s]+))?(?:/.*)?/?$")

DEF_RE = re.compile(
    r"^\s{0,4}(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:(?:public|private|protected|static|pub)\s+)*"
    r"(?:def|class|function|func|fn|interface|struct|enum|impl|trait|type|const|module)\s+\*?"
    r"([A-Za-z_$][\w$]*)")
HEADING_RE = re.compile(r"^#{1,3}\s+(.+)")


# --------------------------------------------------------------------------- fetching
def parse_github_url(url: str) -> tuple[str, str, str | None]:
    m = GITHUB_RE.match(url.strip())
    if not m:
        raise ValueError("Enter a GitHub repository URL, like https://github.com/owner/repo")
    return m.group(1), m.group(2), m.group(3)


def clone_repo(url: str, dest: Path) -> str:
    """Shallow-clone a GitHub repo. Returns 'owner/repo'."""
    owner, repo, branch = parse_github_url(url)
    auth = f"{config.GITHUB_TOKEN}@" if config.GITHUB_TOKEN else ""
    remote = f"https://{auth}github.com/{owner}/{repo}.git"
    cmd = ["git", "clone", "--depth", "1", "--single-branch"]
    if branch:
        cmd += ["--branch", branch]
    cmd += [remote, str(dest)]
    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=config.CLONE_TIMEOUT,
                       env={**os.environ, "GIT_TERMINAL_PROMPT": "0"}, check=True)
    except FileNotFoundError:
        raise RuntimeError("git is not installed on the server.")
    except subprocess.TimeoutExpired:
        raise RuntimeError("Cloning timed out. Try a smaller repository or a specific branch.")
    except subprocess.CalledProcessError as e:
        err = (e.stderr or "").replace(config.GITHUB_TOKEN, "***") if config.GITHUB_TOKEN else (e.stderr or "")
        if any(s in err.lower() for s in ("not found", "authentication", "could not read")):
            raise ValueError("Repository not found, or it is private. For private repos set GITHUB_TOKEN in backend/.env.")
        raise RuntimeError(f"git clone failed: {err.strip().splitlines()[-1] if err.strip() else 'unknown error'}")
    return f"{owner}/{repo}"


def extract_zip(zip_path: Path, dest: Path) -> Path:
    """Safely extract a zip (blocks path traversal and zip bombs). Returns the project root."""
    dest.mkdir(parents=True, exist_ok=True)
    root = dest.resolve()
    try:
        with zipfile.ZipFile(zip_path) as zf:
            if sum(i.file_size for i in zf.infolist()) > config.MAX_UNZIPPED_BYTES:
                raise ValueError("The archive is too large once unzipped.")
            for info in zf.infolist():
                target = (root / info.filename).resolve()
                if root not in target.parents and target != root:
                    raise ValueError("The archive contains unsafe file paths.")
            zf.extractall(root)
    except zipfile.BadZipFile:
        raise ValueError("That file is not a valid zip archive.")
    entries = [p for p in root.iterdir() if p.name != "__MACOSX"]
    return entries[0] if len(entries) == 1 and entries[0].is_dir() else root


# --------------------------------------------------------------------------- reading
def language_of(path: Path) -> str | None:
    name = path.name.lower()
    if name in NAMED_FILES:
        return NAMED_FILES[name]
    return LANGUAGES.get(path.suffix.lower())


def load_documents(root: Path) -> list[dict]:
    docs: list[dict] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".git"))
        for fname in sorted(filenames):
            path = Path(dirpath) / fname
            low = fname.lower()
            if low in SKIP_FILES or low.endswith(SKIP_SUFFIXES):
                continue
            lang = language_of(path)
            if not lang:
                continue
            try:
                size = path.stat().st_size
                limit = 60_000 if lang in DATA_LANGS else config.MAX_FILE_BYTES
                if size == 0 or size > limit or path.is_symlink():
                    continue
                raw = path.read_bytes()
            except OSError:
                continue
            if b"\x00" in raw[:2048]:
                continue
            text = raw.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\t", "    ")
            lines = text.split("\n")
            if sum(len(l) for l in lines) / max(len(lines), 1) > 300:  # minified / generated
                continue
            text = "\n".join(l[:600] for l in lines)
            docs.append({"path": path.relative_to(root).as_posix(), "language": lang,
                         "text": text, "lines": len(lines)})
            if len(docs) >= config.MAX_FILES:
                return docs
    return docs


# --------------------------------------------------------------------------- chunking
def _is_boundary(line: str, language: str) -> bool:
    if language == "markdown":
        return bool(HEADING_RE.match(line))
    return bool(DEF_RE.match(line))


def chunk_document(doc: dict) -> list[dict]:
    """Split a file into overlapping, line-numbered chunks, preferring to cut at definitions."""
    lines = doc["text"].split("\n")
    n, i, chunks = len(lines), 0, []
    while i < n:
        j, size, cut = i, 0, None
        while j < n:
            width = len(lines[j]) + 1
            if j > i and (size + width > config.CHUNK_MAX_CHARS or j - i >= config.CHUNK_MAX_LINES):
                break
            if j - i >= config.CHUNK_MIN_LINES and (
                    _is_boundary(lines[j], doc["language"]) or lines[j - 1].strip() == ""):
                cut = j
            size += width
            j += 1
        end = j
        if end < n and cut is not None and cut - i > (end - i) // 2:
            end = cut
        body = lines[i:end]
        while body and not body[-1].strip():
            body.pop()
        text = "\n".join(body)
        if text.strip():
            symbol = next((m.group(1) for l in body if (m := DEF_RE.match(l))), None)
            chunks.append({
                "id": f"{doc['path']}:{i + 1}-{i + len(body)}",
                "path": doc["path"], "language": doc["language"],
                "start": i + 1, "end": i + len(body), "symbol": symbol or "", "text": text,
            })
        if end >= n:
            break
        i = max(end - config.CHUNK_OVERLAP_LINES, i + 1)
    return chunks


def split_documents(docs: list[dict]) -> list[dict]:
    out: list[dict] = []
    for d in docs:
        out.extend(chunk_document(d))
    return out
