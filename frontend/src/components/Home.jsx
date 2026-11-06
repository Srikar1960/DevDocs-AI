import { Icon } from "./Icons.jsx";
import { StatusDot } from "./Sidebar.jsx";
import { BUSY, fmt, langColor, timeAgo } from "../utils.js";

const STEPS = [
  ["Fetch", "Clone the repo or unpack your zip, skipping vendored and binary files."],
  ["Chunk", "Split every file at function and class boundaries, keeping exact line numbers."],
  ["Embed", "Turn each chunk into a vector that captures what the code means."],
  ["Retrieve", "Find the chunks closest to your question by vector similarity."],
  ["Answer", "Give only those chunks to the LLM, which cites file and line for every claim."],
];

function topLangs(languages) {
  const total = Object.values(languages || {}).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(languages || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l, n]) => [l, n / total]);
}

export default function Home({ repos, health, offline, onOpen, onAdd }) {
  return (
    <div className="page home">
      <header className="hero">
        <h1>Find your way around any codebase.</h1>
        <p>Add a repository, then ask where things live and how they work. Every answer points to the exact file and lines.</p>
        <div className="hero-actions">
          <button className="primary" onClick={onAdd}><Icon name="plus" size={16} /> Add repository</button>
        </div>
      </header>

      {offline && (
        <div className="banner" role="alert">
          <Icon name="alert" /> <div><strong>Can't reach the DevDocs API.</strong> Start the backend with{" "}
          <code className="inline">uvicorn app.main:app --port 8000</code> from the <code className="inline">backend</code> folder.</div>
        </div>
      )}

      <section aria-labelledby="repos-h">
        <div className="section-head"><h2 id="repos-h">Your repositories</h2>{repos?.length > 0 && <span className="muted">{repos.length} indexed</span>}</div>
        {repos === null && !offline && <div className="skeleton tall" />}
        {repos?.length === 0 && (
          <div className="empty">
            <Icon name="folder" size={28} />
            <h3>No repositories yet</h3>
            <p className="muted">Paste a GitHub URL or upload a zip. Indexing a typical repo takes under a minute.</p>
            <button className="secondary" onClick={onAdd}>Add your first repository</button>
          </div>
        )}
        <div className="repo-grid">
          {repos?.map((r) => (
            <button key={r.id} className="repo-card" onClick={() => onOpen(r.id)}>
              <div className="rc-top">
                <strong className="ellipsis">{r.name}</strong>
                <span className={`badge ${BUSY.includes(r.status) ? "busy" : r.status}`}><StatusDot repo={r} /> {labelFor(r)}</span>
              </div>
              {r.status === "ready" ? (
                <>
                  <div className="langbar sm">{topLangs(r.languages).map(([l, f]) => <i key={l} style={{ flex: f, background: langColor(l) }} title={l} />)}</div>
                  <div className="rc-stats"><span><b>{fmt(r.files)}</b> files</span><span><b>{fmt(r.lines)}</b> lines</span><span className="muted">{timeAgo(r.updated_at)}</span></div>
                </>
              ) : r.status === "error" ? (
                <p className="rc-err ellipsis-2">{r.error}</p>
              ) : (
                <div className="bar"><i style={{ width: `${Math.max(4, (r.progress || 0) * 100)}%` }} /></div>
              )}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-h">
        <div className="section-head"><h2 id="how-h">How answers are made</h2><span className="muted">Retrieval-augmented generation</span></div>
        <ol className="pipeline">
          {STEPS.map(([t, d], i) => (<li key={t}><span className="step-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>))}
        </ol>
      </section>

      {health && (
        <section className="engine-grid" aria-label="Engine status">
          <div><span className="muted">Language model</span><strong>{health.llm_provider === "offline" ? "Not configured (retrieval-only)" : `${health.llm_provider} · ${health.llm_model}`}</strong></div>
          <div><span className="muted">Embeddings</span><strong>{health.embedder}</strong></div>
          <div><span className="muted">Vector store</span><strong>{health.vector_store === "chroma" ? "ChromaDB" : "NumPy (fallback)"}</strong></div>
        </section>
      )}
    </div>
  );
}

export function labelFor(r) {
  return { queued: "Queued", fetching: "Fetching", reading: "Reading", embedding: "Indexing", ready: "Ready", error: "Failed" }[r.status];
}
