import { useRef, useState } from "react";
import { api } from "../api.js";
import { Modal } from "./Modal.jsx";
import { Icon } from "./Icons.jsx";

const EXAMPLES = ["https://github.com/pallets/flask", "https://github.com/expressjs/express"];
const GH = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/;

export default function AddRepoModal({ onClose, onAdded }) {
  const [mode, setMode] = useState("github");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();

  const pick = (f) => {
    if (f && !f.name.toLowerCase().endsWith(".zip")) return setError("Choose a .zip file.");
    setError(""); setFile(f || null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "github" && !GH.test(url.trim())) return setError("Enter a GitHub URL like https://github.com/owner/repo");
    if (mode === "zip" && !file) return setError("Choose a .zip file first.");
    setBusy(true);
    try {
      const repo = mode === "github" ? await api.addRepo(url.trim()) : await api.upload(file);
      onAdded(repo);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a repository" onClose={onClose}>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={mode === "github"} className={mode === "github" ? "on" : ""} onClick={() => setMode("github")}>
          <Icon name="link" size={15} /> GitHub URL
        </button>
        <button role="tab" aria-selected={mode === "zip"} className={mode === "zip" ? "on" : ""} onClick={() => setMode("zip")}>
          <Icon name="upload" size={15} /> Upload zip
        </button>
      </div>

      <form onSubmit={submit} noValidate>
        {mode === "github" ? (
          <>
            <label htmlFor="repo-url">Repository URL</label>
            <input id="repo-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo"
                   autoComplete="off" spellCheck="false" inputMode="url" />
            <p className="hint">Public repos work out of the box. Add a branch with <code className="inline">/tree/branch-name</code>.</p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} className="chip" onClick={() => setUrl(ex)}>{ex.replace("https://github.com/", "")}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className={`drop ${drag ? "over" : ""}`} onClick={() => inputRef.current.click()}
                 onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                 onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
                 role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current.click()}>
              <Icon name="upload" size={26} />
              {file ? <strong>{file.name} <span className="muted">({(file.size / 1048576).toFixed(1)} MB)</span></strong>
                    : <strong>Drop a .zip here, or click to browse</strong>}
              <span className="muted">Up to 100 MB. node_modules, build folders and binaries are skipped.</span>
              <input ref={inputRef} type="file" accept=".zip" hidden onChange={(e) => pick(e.target.files[0])} />
            </div>
          </>
        )}
        {error && <p className="error" role="alert"><Icon name="alert" size={15} /> {error}</p>}
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Starting…" : "Index repository"}</button>
        </footer>
      </form>
    </Modal>
  );
}
