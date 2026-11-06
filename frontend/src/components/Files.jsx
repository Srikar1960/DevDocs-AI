import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Icon } from "./Icons.jsx";
import { baseName, langColor } from "../utils.js";

export default function Files({ repo, onAsk }) {
  const [files, setFiles] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setFiles(null); setQ("");
    api.files(repo.id).then((f) => {
      if (!alive) return;
      setFiles(f);
      if (f.length <= 40) setOpen(new Set(f.map((x) => dirOf(x.path))));
      else setOpen(new Set());
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [repo.id, repo.updated_at]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map();
    for (const f of files || []) {
      if (needle && !f.path.toLowerCase().includes(needle)) continue;
      const d = dirOf(f.path);
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [files, q]);

  const toggle = (d) => setOpen((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const searching = q.trim().length > 0;
  const count = groups.reduce((n, [, fs]) => n + fs.length, 0);

  return (
    <div className="page files">
      <div className="files-bar">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter files, e.g. auth or .tsx" aria-label="Filter files" />
        </label>
        <span className="muted">{files ? `${count} of ${files.length} files` : ""}</span>
        <div className="grow" />
        <button className="ghost sm" onClick={() => setOpen(new Set(groups.map((g) => g[0])))}>Expand all</button>
        <button className="ghost sm" onClick={() => setOpen(new Set())}>Collapse all</button>
      </div>

      {error && <p className="error"><Icon name="alert" size={15} /> {error}</p>}
      {!files && !error && <div className="skeleton tall" />}
      {files && groups.length === 0 && <div className="empty"><p className="muted">No files match “{q}”.</p></div>}

      <div className="tree">
        {groups.map(([dir, fs]) => {
          const isOpen = searching || open.has(dir);
          return (
            <div className="dir" key={dir}>
              <button className="dir-head" onClick={() => toggle(dir)} aria-expanded={isOpen}>
                <Icon name="chevron" size={15} style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
                <Icon name="folder" size={15} /> <span className="ellipsis">{dir === "." ? "(project root)" : dir}</span>
                <small>{fs.length}</small>
              </button>
              {isOpen && fs.map((f) => (
                <div className="file-row" key={f.path}>
                  <i className="lang-dot" style={{ background: langColor(f.language) }} title={f.language} />
                  <span className="ellipsis" title={f.path}>{baseName(f.path)}</span>
                  <small className="muted">{f.lines} lines · {f.chunks} chunk{f.chunks === 1 ? "" : "s"}</small>
                  <button className="ghost sm" onClick={() => onAsk(`Explain what \`${f.path}\` does and how it fits into the rest of the project.`)}>Ask about this</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ".");
