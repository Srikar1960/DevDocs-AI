"""Central configuration, read from environment variables / backend/.env."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:  # python-dotenv is optional
    pass

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
REPOS_DIR = DATA_DIR / "repos"        # temporary clones
UPLOADS_DIR = DATA_DIR / "uploads"    # temporary zips
CHROMA_DIR = DATA_DIR / "chroma"
NUMPY_DIR = DATA_DIR / "vectors"      # fallback vector store
DB_PATH = DATA_DIR / "devdocs.db"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

for _d in (REPOS_DIR, UPLOADS_DIR, CHROMA_DIR, NUMPY_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# LLM
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").lower()

# Embeddings / vector store
EMBEDDING_BACKEND = os.getenv("EMBEDDING_BACKEND", "auto").lower()
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
STORE_BACKEND = os.getenv("STORE_BACKEND", "auto").lower()

# Retrieval
TOP_K = int(os.getenv("TOP_K", "8"))
HISTORY_TURNS = 6

# Chunking (line-based so every chunk maps to exact line numbers)
CHUNK_MAX_CHARS = 1600
CHUNK_MAX_LINES = 70
CHUNK_MIN_LINES = 6
CHUNK_OVERLAP_LINES = 4

# Ingestion limits
MAX_FILE_BYTES = 250_000
MAX_FILES = 4000
MAX_ZIP_BYTES = 100 * 1024 * 1024
MAX_UNZIPPED_BYTES = 600 * 1024 * 1024
CLONE_TIMEOUT = int(os.getenv("CLONE_TIMEOUT", "240"))
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
