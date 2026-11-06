import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { tokenize } from "../utils.js";

export function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return (
    <button className="ghost sm" onClick={copy} aria-label={label}>
      <Icon name={done ? "check" : "copy"} size={14} /> {done ? "Copied" : label}
    </button>
  );
}

/** Line-numbered, lightly highlighted code. `start` is the real file line number of the first line. */
export function Code({ text, lang, start = 1, numbers = true }) {
  return (
    <pre className="code" tabIndex={0}>
      {text.split("\n").map((line, i) => (
        <div className="ln" key={i}>
          {numbers && <span className="no">{start + i}</span>}
          <code>
            {tokenize(line, lang).map((tk, j) => (tk.c ? <span key={j} className={tk.c}>{tk.t}</span> : tk.t))}
            {line === "" && " "}
          </code>
        </div>
      ))}
    </pre>
  );
}
