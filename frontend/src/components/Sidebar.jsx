import { Icon, Logo } from "./Icons.jsx";
import { BUSY } from "../utils.js";

export function StatusDot({ repo }) {
  const busy = BUSY.includes(repo.status);
  return <span className={`dot ${busy ? "busy" : repo.status}`} title={repo.status} />;
}

export default function Sidebar({ repos, activeId, onOpen, onHome, onAdd, theme, onTheme, health, open, onClose }) {
  const llm = health ? (health.llm_provider === "offline" ? "Retrieval-only" : health.llm_model) : "Connecting…";
  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Repositories">
        <button className="brand" onClick={onHome} aria-label="DevDocs AI home">
          <Logo /> <span>DevDocs<b>AI</b></span>
        </button>

        <button className="primary block" onClick={onAdd}><Icon name="plus" size={16} /> Add repository</button>

        <nav className="repo-list">
          <button className={`nav-item ${!activeId ? "active" : ""}`} onClick={onHome}>
            <Icon name="home" size={16} /> <span>Dashboard</span>
          </button>
          <h3>Repositories</h3>
          {repos === null && <div className="skeleton" />}
          {repos?.length === 0 && <p className="muted pad">Nothing indexed yet.</p>}
          {repos?.map((r) => (
            <button key={r.id} className={`nav-item ${r.id === activeId ? "active" : ""}`} onClick={() => onOpen(r.id)}>
              <StatusDot repo={r} />
              <span className="ellipsis">{r.name}</span>
              {BUSY.includes(r.status) && <small>{Math.round((r.progress || 0) * 100)}%</small>}
            </button>
          ))}
        </nav>

        <footer className="side-foot">
          <div className="engine" title={health ? `Embeddings: ${health.embedder} · Vector store: ${health.vector_store}` : ""}>
            <span className={`dot ${health ? (health.llm_provider === "offline" ? "warn" : "ready") : "busy"}`} />
            <span className="ellipsis">{llm}</span>
          </div>
          <button className="icon" onClick={onTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
          </button>
        </footer>
      </aside>
    </>
  );
}
