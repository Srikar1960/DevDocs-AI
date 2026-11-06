"""Step 7: the LLM. Gemini or OpenAI through LangChain, with an offline fallback."""
from __future__ import annotations

from typing import Iterator

from . import config

SYSTEM_PROMPT = """You are DevDocs AI, a senior engineer helping a new teammate understand a codebase.
You are given numbered code excerpts retrieved from the repository. Rules:
- Answer ONLY from the excerpts. If they do not contain the answer, say what is missing and suggest where to look. Never invent files, functions or behaviour.
- Cite every claim with the file and line range in inline code, exactly like `src/auth/login.py:12-48`, copied from the excerpt headers.
- Be concise and concrete. For "how does X work" questions, walk through the flow step by step, naming the functions involved.
- Use Markdown. Put short code in fenced blocks only when it helps."""


def provider() -> str:
    p = config.LLM_PROVIDER
    if p == "gemini" and config.GOOGLE_API_KEY:
        return "gemini"
    if p == "openai" and config.OPENAI_API_KEY:
        return "openai"
    if p == "auto":
        if config.GOOGLE_API_KEY:
            return "gemini"
        if config.OPENAI_API_KEY:
            return "openai"
    return "offline"


def model_name() -> str:
    return {"gemini": config.GEMINI_MODEL, "openai": config.OPENAI_MODEL}.get(provider(), "retrieval-only")


def _build_model():
    if provider() == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(model=config.GEMINI_MODEL, google_api_key=config.GOOGLE_API_KEY,
                                      temperature=0.1)
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=config.OPENAI_MODEL, api_key=config.OPENAI_API_KEY, temperature=0.1)


def format_context(chunks: list[dict]) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        sym = f" · {c['symbol']}" if c.get("symbol") else ""
        parts.append(f"[{i}] {c['path']}:{c['start']}-{c['end']}{sym}\n```{c['language']}\n{c['text']}\n```")
    return "\n\n".join(parts)


def _text(content) -> str:
    if isinstance(content, str):
        return content
    return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)


def stream_llm(question: str, chunks: list[dict], history: list[dict], repo_name: str) -> Iterator[str]:
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    msgs = [SystemMessage(content=f"{SYSTEM_PROMPT}\n\nRepository: {repo_name}")]
    for m in history[-config.HISTORY_TURNS:]:
        cls = HumanMessage if m["role"] == "user" else AIMessage
        msgs.append(cls(content=m["content"][:2000]))
    msgs.append(HumanMessage(content=f"Code excerpts:\n\n{format_context(chunks)}\n\nQuestion: {question}"))
    for piece in _build_model().stream(msgs):
        text = _text(piece.content)
        if text:
            yield text


def offline_answer(question: str, chunks: list[dict]) -> Iterator[str]:
    """No API key: show where the answer most likely lives, straight from retrieval."""
    yield ("**Retrieval-only mode** — no LLM key is configured, so here are the most relevant places "
           "in the code. Add `GOOGLE_API_KEY` or `OPENAI_API_KEY` to `backend/.env` for written explanations.\n\n")
    for c in chunks[:4]:
        sym = f" — `{c['symbol']}`" if c.get("symbol") else ""
        excerpt = "\n".join(c["text"].split("\n")[:14])
        yield f"`{c['path']}:{c['start']}-{c['end']}`{sym}\n\n```{c['language']}\n{excerpt}\n```\n\n"


def stream_answer(question, chunks, history, repo_name) -> Iterator[str]:
    if provider() == "offline":
        yield from offline_answer(question, chunks)
    else:
        yield from stream_llm(question, chunks, history, repo_name)
