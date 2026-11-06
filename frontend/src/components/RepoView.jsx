import { useState } from "react";
import { BUSY } from "../utils.js";
import Chat from "./Chat.jsx";
import Files from "./Files.jsx";
import { Icon } from "./Icons.jsx";
import { ConfirmDialog } from "./Modal.jsx";
import Overview from "./Overview.jsx";
import { labelFor } from "./Home.jsx";
import { StatusDot } from "./Sidebar.jsx";

const TABS = [["ask", "Ask", "chat"], ["overview", "Overview", "grid"], ["files", "Files", "list"]];

export default function RepoView({ repo, tab, onTab, health, draft, setDraft, onReindex, onDelete, toast }) {
  const [confirm, setConfirm] = useState(false);
  const ready = repo.status === "ready";
  const current = ready ? tab : "overview";
  const ask = (text, send = true) => { setDraft({ text, send }); onTab("ask"); };

  return (
    <div className="repo-view">
      <header className="repo-head">
        <div className="repo-title">
          <h1 className="ellipsis">{repo.name}</h1>
          <span className={`badge ${BUSY.includes(repo.status) ? "busy" : repo.status}`}><StatusDot repo={repo} /> {labelFor(repo)}</span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Repository sections">
          {TABS.map(([id, label, icon]) => (
            <button key={id} role="tab" aria-selected={current === id} className={current === id ? "on" : ""}
                    disabled={!ready && id !== "overview"} onClick={() => onTab(id)}>
              <Icon name={icon} size={16} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="icon danger-hover" onClick={() => setConfirm(true)} aria-label="Remove repository" title="Remove repository"><Icon name="trash" /></button>
      </header>

      <div className="repo-body">
        {current === "ask" && <Chat repo={repo} draft={draft} clearDraft={() => setDraft(null)} toast={toast} />}
        {current === "overview" && <Overview repo={repo} health={health} onReindex={onReindex} onAsk={(q) => ask(q, true)} />}
        {current === "files" && <Files repo={repo} onAsk={(q) => ask(q, false)} />}
      </div>

      {confirm && (
        <ConfirmDialog title={`Remove ${repo.name}?`} body="Its search index and conversation are deleted. You can add the repository again at any time."
                       confirmLabel="Remove repository" onConfirm={() => { setConfirm(false); onDelete(repo); }} onClose={() => setConfirm(false)} />
      )}
    </div>
  );
}
