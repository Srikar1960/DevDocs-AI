import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import AddRepoModal from "./components/AddRepoModal.jsx";
import Home from "./components/Home.jsx";
import { Icon, Logo } from "./components/Icons.jsx";
import RepoView from "./components/RepoView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { BUSY } from "./utils.js";

function readHash() {
  const m = /^#\/r\/([\w-]+)(?:\/(ask|overview|files))?/.exec(window.location.hash);
  return { repoId: m?.[1] || null, tab: m?.[2] || "ask" };
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem("devdocs-theme"); if (t) return t; } catch { /* private mode */ }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [route, setRoute] = useState(readHash);
  const [repos, setRepos] = useState(null);
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("devdocs-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const toast = useCallback((text, kind = "info") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await api.repos();
      setRepos(list); setOffline(false);
      api.health().then(setHealth).catch(() => {});
    } catch {
      setOffline(true);
      setRepos((r) => r ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const busy = repos?.some((r) => BUSY.includes(r.status));
  useEffect(() => {
    if (!busy && !offline) return;
    const t = setInterval(load, offline ? 4000 : 1500);
    return () => clearInterval(t);
  }, [busy, offline, load]);

  const go = (repoId, tab = "ask") => {
    window.location.hash = repoId ? `#/r/${repoId}/${tab}` : "#/";
    setDrawer(false);
  };

  const repo = repos?.find((r) => r.id === route.repoId);
  useEffect(() => {   // a repo that was deleted elsewhere
    if (route.repoId && repos && !offline && !repo) go(null);
  }, [repos, route.repoId, offline]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAdded = (r) => {
    setAdding(false);
    setRepos((p) => [r, ...(p || [])]);
    go(r.id, "overview");
    toast("Indexing started. It usually takes under a minute.");
  };

  const reindex = async (r) => {
    try { const u = await api.reindex(r.id); setRepos((p) => p.map((x) => (x.id === u.id ? u : x))); toast("Re-indexing started"); }
    catch (e) { toast(e.message, "error"); }
  };

  const remove = async (r) => {
    try { await api.remove(r.id); go(null); setRepos((p) => p.filter((x) => x.id !== r.id)); toast(`Removed ${r.name}`); }
    catch (e) { toast(e.message, "error"); }
  };

  return (
    <div className="app">
      <Sidebar repos={repos} activeId={repo?.id} health={health} theme={theme} open={drawer}
               onTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
               onOpen={(id) => go(id, "ask")} onHome={() => go(null)} onAdd={() => { setAdding(true); setDrawer(false); }}
               onClose={() => setDrawer(false)} />
      <main className="main">
        <div className="mobilebar">
          <button className="icon" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <Logo size={24} /> <strong>DevDocs AI</strong>
        </div>
        {repo
          ? <RepoView key={repo.id} repo={repo} tab={route.tab} onTab={(t) => go(repo.id, t)} health={health}
                      draft={draft} setDraft={setDraft} onReindex={() => reindex(repo)} onDelete={remove} toast={toast} />
          : <Home repos={repos} health={health} offline={offline} onOpen={(id) => go(id, "ask")} onAdd={() => setAdding(true)} />}
      </main>

      {adding && <AddRepoModal onClose={() => setAdding(false)} onAdded={onAdded} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}
