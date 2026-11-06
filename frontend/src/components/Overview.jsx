import { Icon } from "./Icons.jsx";
import { BUSY, STAGES, fmt, langColor, timeAgo } from "../utils.js";

export default function Overview({ repo, health, onReindex, onAsk }) {
  const busy = BUSY.includes(repo.status);
  const stageIdx = Math.max(0, STAGES.findIndex(([k]) => k === (repo.status === "queued" ? "fetching" : repo.status)));
  const langs = Object.entries(repo.languages || {}).sort((a, b) => b[1] - a[1]);
  const total = langs.reduce((a, [, n]) => a + n, 0) || 1;

  return (
    <div className="page overview">
      {(busy || repo.status === "error") && (
        <section className="job" aria-live="polite">
          <ol className="stepper">
            {STAGES.map(([k, label], i) => (
              <li key={k} className={repo.status === "error" ? (i === stageIdx ? "fail" : i < stageIdx ? "done" : "") : i < stageIdx ? "done" : i === stageIdx ? "now" : ""}>
                <span className="step-n">{i < stageIdx ? <Icon name="check" size={13} /> : i + 1}</span>{label}
              </li>
            ))}
          </ol>
          {busy ? (
            <>
              <div className="bar big"><i style={{ width: `${Math.max(3, repo.progress * 100)}%` }} /></div>
              <p className="muted">Indexing {repo.name}… this page updates on its own. You can add more repositories while you wait.</p>
            </>
          ) : (
            <div className="banner danger">
              <Icon name="alert" /><div><strong>Indexing failed.</strong> {repo.error}
                <div className="row">{repo.kind === "github" && <button className="secondary sm" onClick={onReindex}><Icon name="refresh" size={14} /> Try again</button>}</div>
              </div>
            </div>
          )}
        </section>
      )}

      {repo.status === "ready" && (
        <>
          <dl className="stat-strip">
            <div><dt>Files</dt><dd>{fmt(repo.files)}</dd></div>
            <div><dt>Lines of code</dt><dd>{fmt(repo.lines)}</dd></div>
            <div><dt>Searchable chunks</dt><dd>{fmt(repo.chunks)}</dd></div>
            <div><dt>Languages</dt><dd>{langs.length}</dd></div>
          </dl>

          <section>
            <div className="section-head"><h2>Languages</h2></div>
            <div className="langbar">{langs.map(([l, n]) => <i key={l} style={{ flex: n, background: langColor(l) }} title={`${l} ${Math.round((n / total) * 100)}%`} />)}</div>
            <ul className="legend">
              {langs.slice(0, 8).map(([l, n]) => (
                <li key={l}><i style={{ background: langColor(l) }} />{l}<span className="muted">{Math.round((n / total) * 100)}%</span></li>
              ))}
            </ul>
          </section>

          <section>
            <div className="section-head"><h2>Start with a question</h2></div>
            <div className="starters">
              {["Give me a high-level tour of this codebase", "Where is user authentication implemented?", "Which file handles database connections?", "What happens when a user logs in?"].map((q) => (
                <button key={q} className="starter" onClick={() => onAsk(q)}>{q}</button>
              ))}
            </div>
          </section>
        </>
      )}

      <section>
        <div className="section-head"><h2>Index details</h2>
          {repo.kind === "github" && !busy && <button className="secondary sm" onClick={onReindex}><Icon name="refresh" size={14} /> Re-index</button>}
        </div>
        <dl className="details">
          <div><dt>Source</dt><dd>{repo.kind === "github" ? <a href={repo.source} target="_blank" rel="noreferrer noopener">{repo.source.replace("https://", "")}</a> : "Uploaded zip"}</dd></div>
          <div><dt>Embedding model</dt><dd>{repo.embedder || health?.embedder || "—"}</dd></div>
          <div><dt>Vector store</dt><dd>{health ? (health.vector_store === "chroma" ? "ChromaDB (cosine)" : "NumPy (fallback)") : "—"}</dd></div>
          <div><dt>Last indexed</dt><dd>{repo.status === "ready" ? timeAgo(repo.updated_at) : "—"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
