# DevDocs AI

Ask questions about any codebase and get answers that cite the exact file and lines.
Built on **RAG (Retrieval-Augmented Generation)**: instead of sending a whole repository to an LLM, it retrieves the most relevant code by vector similarity and gives only that as context.

**Stack:** Python · FastAPI · LangChain · ChromaDB · sentence-transformers · Gemini / OpenAI · React (Vite) · SQLite

## How it works

```
GitHub URL / .zip
  1  fetch       git clone --depth 1, or safe zip extraction         ingest.py
  2  read        skip node_modules, binaries, lockfiles, minified     ingest.py
  3  chunk       line-based, cut at def/class boundaries, exact       ingest.py
                 line numbers kept for every chunk
  4  embed       sentence-transformers (all-MiniLM-L6-v2)             embeddings.py
  5  store       ChromaDB, one collection per repo (cosine)           vectorstore.py
question
  6  retrieve    top-k by similarity, re-ranked by path/symbol match  rag.py
  7  generate    Gemini/OpenAI via LangChain, streamed, cites         llm.py
                 `path:start-end`; the UI turns citations into links
```
Repos, file index and chat history live in SQLite (`backend/data/devdocs.db`).

**Interview summary:** "The project uses RAG. Instead of asking an LLM about an entire codebase, I chunk the code, embed it, retrieve the relevant snippets with vector similarity, and give only those to the LLM as context, so answers are grounded and cite their sources."

## Features
- Add a repo by GitHub URL (supports `/tree/<branch>` and private repos via `GITHUB_TOKEN`) or by uploading a zip
- Live indexing progress, re-index, delete, interrupted-job recovery
- Streaming answers, Stop button, retry on failure, persistent per-repo history
- Clickable citations open the exact code in a Sources panel (line numbers, highlighting, copy)
- Dashboard, language breakdown, searchable file explorer with "Ask about this file"
- Light/dark theme, responsive layout (drawer + bottom sheet on mobile)
- Works without any API key in **retrieval-only mode**, and without sentence-transformers via a built-in hashing embedder (lower quality, zero downloads)

## Run it
Requirements: Python 3.10+, Node 18+, git.

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # add GOOGLE_API_KEY or OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000
```
The first start downloads the embedding model (~90 MB) in the background.

**Frontend**
```bash
cd frontend
npm install
npm run dev                                         # http://localhost:5173
```

**Single-server mode:** run `npm run build` in `frontend/`, then start only the backend. It serves the app at http://localhost:8000.

## Configuration (`backend/.env`)
| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` / `OPENAI_API_KEY` | – | Enables written answers. No key = retrieval-only mode |
| `LLM_PROVIDER` | auto | `gemini`, `openai` or `offline` |
| `GEMINI_MODEL` / `OPENAI_MODEL` | `gemini-2.5-flash` / `gpt-4o-mini` | Change if your account uses other models |
| `EMBEDDING_BACKEND` | auto | `sentence-transformers` or `hash` |
| `GITHUB_TOKEN` | – | Index private repositories |
| `TOP_K` | 8 | Snippets sent to the LLM |

If you change the embedding backend, re-index existing repos (the API asks you to).

## API
`GET /api/health` · `GET/POST /api/repos` · `POST /api/repos/upload` · `GET/DELETE /api/repos/{id}` · `POST /api/repos/{id}/reindex` · `GET /api/repos/{id}/files` · `GET/DELETE /api/repos/{id}/messages` · `POST /api/chat` (NDJSON stream: `sources`, `token`…, `done`/`error`). Interactive docs at `/docs`.

## Tests
```bash
cd backend && python -m unittest discover -s tests -v
```
Covers ingestion filters, chunk line-number accuracy, GitHub URL parsing, zip-traversal protection, retrieval ranking for the four example questions, the SQLite layer and the offline answer path.

## Project layout
```
backend/app/   config · ingest · embeddings · vectorstore · registry (SQLite) · llm · rag · main (FastAPI)
backend/tests/ test_core.py
frontend/src/  App.jsx · api.js · utils.js · styles.css · components/ (Chat, SourcePanel, Overview, Files, Home, …)
```

## Known limits
- Answer quality depends on the LLM and embedding model; the hashing fallback is keyword-like, not semantic.
- Very large monorepos (>4,000 indexable files) are truncated; see `MAX_FILES` in `config.py`.
- Syntax highlighting is a lightweight single-line highlighter, not a full parser.
