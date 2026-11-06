const BASE = import.meta.env.VITE_API_URL || "";

async function errorFrom(res) {
  let msg = `Request failed (${res.status})`;
  try {
    const j = await res.json();
    if (typeof j.detail === "string") msg = j.detail;
    else if (Array.isArray(j.detail)) msg = j.detail.map((d) => d.msg).join(", ");
  } catch { /* keep default */ }
  return new Error(msg);
}

async function req(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(BASE + path, {
    ...opts,
    headers: opts.body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: opts.body && !isForm ? JSON.stringify(opts.body) : opts.body,
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export const api = {
  health: () => req("/api/health"),
  repos: () => req("/api/repos"),
  addRepo: (url) => req("/api/repos", { method: "POST", body: { url } }),
  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return req("/api/repos/upload", { method: "POST", body: fd });
  },
  reindex: (id) => req(`/api/repos/${id}/reindex`, { method: "POST" }),
  remove: (id) => req(`/api/repos/${id}`, { method: "DELETE" }),
  files: (id) => req(`/api/repos/${id}/files`),
  messages: (id) => req(`/api/repos/${id}/messages`),
  clearMessages: (id) => req(`/api/repos/${id}/messages`, { method: "DELETE" }),
};

/** POST a question and read the newline-delimited JSON event stream. */
export async function streamChat(repoId, question, { onEvent, signal }) {
  const res = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_id: repoId, question }),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
}
