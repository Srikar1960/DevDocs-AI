import { useCallback, useEffect, useRef, useState } from "react";
import { api, streamChat } from "../api.js";
import { findSource } from "../utils.js";
import { CopyButton } from "./Code.jsx";
import { Icon } from "./Icons.jsx";
import Markdown from "./Markdown.jsx";
import { ConfirmDialog } from "./Modal.jsx";
import SourcePanel from "./SourcePanel.jsx";

const STARTERS = [
  "Where is user authentication implemented?",
  "Which file handles database connections?",
  "Explain how the payment module works.",
  "What happens when a user logs in?",
];
const uid = () => Math.random().toString(36).slice(2, 10);

export default function Chat({ repo, draft, clearDraft, toast }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [active, setActive] = useState(null);
  const [focus, setFocus] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const stick = useRef(true);
  const taRef = useRef(null);

  // Load persisted history whenever the repository changes.
  useEffect(() => {
    let alive = true;
    abortRef.current?.abort();
    setLoading(true); setMsgs([]); setActive(null); setFocus(null); setSheet(false); setBusy(false);
    api.messages(repo.id)
      .then((rows) => alive && setMsgs(rows.map((r) => ({ id: `db${r.id}`, role: r.role, content: r.content, sources: r.sources }))))
      .catch((e) => toast(e.message, "error"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [repo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = useCallback(async (raw) => {
    const text = raw.trim();
    if (!text || busy) return;
    const id = uid();
    stick.current = true;
    setInput(""); setBusy(true); setActive(id); setFocus(null);
    if (taRef.current) taRef.current.style.height = "auto";
    setMsgs((p) => [...p, { id: uid(), role: "user", content: text },
      { id, role: "assistant", content: "", sources: [], streaming: true, status: "Searching the codebase…", question: text }]);
    const patch = (fn) => setMsgs((p) => p.map((m) => (m.id === id ? fn(m) : m)));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(repo.id, text, {
        signal: ctrl.signal,
        onEvent: (ev) => {
          if (ev.type === "sources") patch((m) => ({ ...m, sources: ev.sources, status: `Reading ${new Set(ev.sources.map((s) => s.path)).size} files…` }));
          else if (ev.type === "token") patch((m) => ({ ...m, content: m.content + ev.text }));
          else if (ev.type === "error") patch((m) => ({ ...m, error: ev.message }));
        },
      });
    } catch (e) {
      if (e.name !== "AbortError") patch((m) => ({ ...m, error: e.message }));
    } finally {
      patch((m) => ({ ...m, streaming: false, status: null }));
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, repo.id]);

  // A question handed over from the Overview / Files tabs.
  useEffect(() => {
    if (!draft || loading) return;
    if (draft.send) send(draft.text); else { setInput(draft.text); taRef.current?.focus(); }
    clearDraft();
  }, [draft, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = (m) => {
    setMsgs((p) => { const i = p.findIndex((x) => x.id === m.id); return p.filter((_, k) => k !== i && k !== i - 1); });
    setTimeout(() => send(m.question), 0);
  };

  const clear = async () => {
    try { await api.clearMessages(repo.id); setMsgs([]); setActive(null); toast("Conversation cleared"); }
    catch (e) { toast(e.message, "error"); }
    setConfirmClear(false);
  };

  const onCite = (msg, cite) => {
    const s = findSource(msg.sources, cite);
    setActive(msg.id);
    if (s) setFocus({ n: s.n, t: Date.now() });
    setSheet(true);
  };

  const lastWithSources = [...msgs].reverse().find((m) => m.role === "assistant" && m.sources?.length);
  const activeMsg = msgs.find((m) => m.id === active) || lastWithSources;
  const sources = activeMsg?.sources || [];

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); }
  };
  const grow = (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px"; };

  return (
    <div className="chat-layout">
      <section className="chat-main" aria-label="Conversation">
        <div className="chat-scroll" ref={scrollRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
          <div className="chat-col">
            {loading && <div className="skeleton tall" />}
            {!loading && msgs.length === 0 && (
              <div className="chat-empty">
                <h2>Ask about {repo.name.split("/").pop()}</h2>
                <p className="muted">Answers come from the code itself, with the file and lines cited so you can check.</p>
                <div className="starters">
                  {STARTERS.map((q) => <button key={q} className="starter" onClick={() => send(q)}>{q}</button>)}
                </div>
              </div>
            )}

            {msgs.map((m) => m.role === "user" ? (
              <article className="msg user" key={m.id}><p>{m.content}</p></article>
            ) : (
              <article className={`msg assistant ${active === m.id ? "is-active" : ""}`} key={m.id}>
                {m.status && !m.content && <p className="thinking">{m.status}</p>}
                {m.content && <div className="prose"><Markdown text={m.content} onCite={(c) => onCite(m, c)} />{m.streaming && <span className="caret" />}</div>}
                {m.error && (
                  <div className="banner danger" role="alert"><Icon name="alert" />
                    <div>{m.error}{m.question && <div className="row"><button className="secondary sm" onClick={() => retry(m)}><Icon name="refresh" size={14} /> Try again</button></div>}</div>
                  </div>
                )}
                {!m.streaming && m.sources?.length > 0 && (
                  <div className="msg-foot">
                    <button className="ghost sm" onClick={() => { setActive(m.id); setFocus(null); setSheet(true); }}>
                      <Icon name="layers" size={14} /> {m.sources.length} sources in {new Set(m.sources.map((s) => s.path)).size} files
                    </button>
                    {m.content && <CopyButton text={m.content} label="Copy answer" />}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="composer-wrap">
          <div className="composer">
            <textarea ref={taRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onInput={grow} onKeyDown={onKey}
                      placeholder="Ask how something works…" aria-label="Your question" disabled={loading} />
            {busy
              ? <button className="send stop" onClick={() => abortRef.current?.abort()} aria-label="Stop generating"><Icon name="stop" size={16} /></button>
              : <button className="send" onClick={() => send(input)} disabled={!input.trim() || loading} aria-label="Send question"><Icon name="send" size={18} /></button>}
          </div>
          <div className="composer-meta">
            <span className="muted">Enter to send · Shift+Enter for a new line</span>
            <span className="grow" />
            {sources.length > 0 && <button className="ghost sm sheet-open" onClick={() => setSheet(true)}><Icon name="layers" size={14} /> Sources ({sources.length})</button>}
            {msgs.length > 0 && <button className="ghost sm" onClick={() => setConfirmClear(true)} disabled={busy}><Icon name="trash" size={14} /> Clear chat</button>}
          </div>
        </div>
      </section>

      {sheet && <div className="sheet-scrim" onClick={() => setSheet(false)} />}
      <SourcePanel key={activeMsg?.id || "none"} sources={sources} focus={focus} open={sheet} onClose={() => setSheet(false)} />

      {confirmClear && (
        <ConfirmDialog title="Clear this conversation?" body="The questions and answers for this repository will be deleted. The index is not affected."
                       confirmLabel="Clear conversation" onConfirm={clear} onClose={() => setConfirmClear(false)} />
      )}
    </div>
  );
}
