export const BUSY = ["queued", "fetching", "reading", "embedding"];
export const STAGES = [
  ["fetching", "Fetch code"],
  ["reading", "Read files"],
  ["embedding", "Build index"],
  ["ready", "Ready"],
];

export const LANG_COLORS = {
  python: "#2BA58F", javascript: "#E5B800", typescript: "#3178C6", java: "#D2691E", go: "#00ADD8",
  rust: "#C0562B", ruby: "#CC342D", php: "#777BB4", c: "#6B7A8F", cpp: "#C7457B", csharp: "#68217A",
  kotlin: "#A97BFF", swift: "#F05138", html: "#E34C26", css: "#7A4CC2", scss: "#C6538C",
  vue: "#41B883", svelte: "#FF3E00", markdown: "#6C7A89", json: "#8A9BB0", yaml: "#B0524B",
  shell: "#4EAA25", sql: "#E38C00", dockerfile: "#2496ED",
};
export const langColor = (l) => LANG_COLORS[l] || "#8A96A6";

export const fmt = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n ?? 0}`);

export function timeAgo(ts) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** `src/auth/login.py:12-48` -> { path, start, end } */
export function parseCite(text) {
  const m = /^([\w@.\/-]+):(\d+)(?:-(\d+))?$/.exec(text.trim());
  if (!m || !/[./]/.test(m[1])) return null;
  const start = +m[2];
  return { path: m[1], start, end: m[3] ? +m[3] : start };
}

export function findSource(sources = [], cite) {
  const same = sources.filter((s) => s.path === cite.path || s.path.endsWith("/" + cite.path) || cite.path.endsWith("/" + s.path));
  return same.find((s) => cite.start <= s.end && s.start <= cite.end) || same[0] || null;
}

export const baseName = (p) => p.split("/").pop();

const KW = new Set(("def class return if else elif for while import from as with try except finally raise yield lambda async await " +
  "function const let var export default new this self null None true false True False undefined typeof interface type enum " +
  "extends implements public private protected static void int string bool func fn pub struct impl use mod match package go " +
  "defer chan select switch case break continue throw throws catch in not and or is where trait").split(" "));
const DEF_KW = new Set(["def", "class", "function", "func", "fn", "struct", "interface", "trait", "enum"]);
const HASH_COMMENT = new Set(["python", "shell", "yaml", "ruby", "toml", "ini", "dockerfile", "makefile", "r", "env"]);

/** Tiny single-line highlighter: enough to make code scannable without a dependency. */
export function tokenize(line, lang) {
  if (lang === "markdown") return [{ t: line }];
  const hash = HASH_COMMENT.has(lang);
  const re = new RegExp(
    `(${hash ? "#.*$|" : ""}\\/\\/.*$|\\/\\*.*?\\*\\/)|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)`, "g");
  const out = [];
  let last = 0, m, prev = "";
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ t: line.slice(last, m.index) });
    if (m[1]) out.push({ t: m[1], c: "cm" });
    else if (m[2]) out.push({ t: m[2], c: "st" });
    else if (m[3]) out.push({ t: m[3], c: "nu" });
    else if (KW.has(m[4])) { out.push({ t: m[4], c: "kw" }); prev = m[4]; last = re.lastIndex; continue; }
    else if (DEF_KW.has(prev)) out.push({ t: m[4], c: "fn" });
    else out.push({ t: m[4] });
    prev = "";
    last = re.lastIndex;
  }
  if (last < line.length) out.push({ t: line.slice(last) });
  return out;
}
