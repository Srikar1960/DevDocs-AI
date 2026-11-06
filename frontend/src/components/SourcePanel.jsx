import { useEffect, useRef, useState } from "react";
import { Code, CopyButton } from "./Code.jsx";
import { Icon } from "./Icons.jsx";
import { baseName } from "../utils.js";

/** Retrieved code behind an answer. Parent re-mounts it (via key) per answer. */
export default function SourcePanel({ sources, focus, open, onClose }) {
  const [expanded, setExpanded] = useState(() => new Set(sources.slice(0, 1).map((s) => s.n)));
  const refs = useRef({});
  const touched = useRef(false);

  useEffect(() => {   // sources can arrive after mount (streaming): open the best match by default
    if (sources.length && !touched.current) setExpanded(new Set([sources[0].n]));
  }, [sources.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus) return;
    touched.current = true;
    setExpanded((s) => new Set(s).add(focus.n));
    requestAnimationFrame(() => refs.current[focus.n]?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [focus]);

  const toggle = (n) => { touched.current = true; setExpanded((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; }); };
  const top = Math.max(...sources.map((s) => s.score), 0.001);

  return (
    <aside className={`source-panel ${open ? "open" : ""}`} aria-label="Sources">
      <header>
        <h2><Icon name="layers" size={17} /> Sources</h2>
        <span className="muted">{sources.length} snippets, best match first</span>
        <button className="icon sheet-close" onClick={onClose} aria-label="Close sources"><Icon name="close" /></button>
      </header>
      <div className="source-list">
        {sources.length === 0 && <p className="muted pad">Ask a question and the code behind the answer will appear here.</p>}
        {sources.map((s) => {
          const isOpen = expanded.has(s.n);
          const dir = s.path.includes("/") ? s.path.slice(0, s.path.lastIndexOf("/") + 1) : "";
          return (
            <article key={s.id} className={`source ${isOpen ? "open" : ""} ${focus?.n === s.n ? "focused" : ""}`} ref={(el) => (refs.current[s.n] = el)}>
              <button className="source-head" onClick={() => toggle(s.n)} aria-expanded={isOpen}>
                <Icon name="chevron" size={15} style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
                <span className="src-path ellipsis"><span className="muted">{dir}</span>{baseName(s.path)}</span>
                <span className="lines">L{s.start}–{s.end}</span>
              </button>
              <div className="src-meta">
                {s.symbol && <code className="inline">{s.symbol}</code>}
                <span className="relevance" title={`Similarity ${s.score}`}><i style={{ width: `${Math.max(8, (s.score / top) * 100)}%` }} /></span>
              </div>
              {isOpen && (
                <div className="src-body">
                  <Code text={s.text} lang={s.language} start={s.start} />
                  <div className="src-actions"><CopyButton text={s.text} label="Copy code" /><CopyButton text={`${s.path}:${s.start}-${s.end}`} label="Copy path" /></div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
