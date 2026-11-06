import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code, CopyButton } from "./Code.jsx";
import { parseCite } from "../utils.js";

/** Renders model output. Inline `path:12-40` references become clickable citation chips. */
export default function Markdown({ text, onCite }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code({ className, children }) {
          const raw = String(children).replace(/\n$/, "");
          const lang = /language-(\w+)/.exec(className || "")?.[1];
          if (lang || raw.includes("\n")) {
            return (
              <div className="codeblock">
                <div className="codeblock-bar"><span>{lang || "code"}</span><CopyButton text={raw} /></div>
                <Code text={raw} lang={lang} numbers={false} />
              </div>
            );
          }
          const cite = parseCite(raw);
          if (cite && onCite) {
            return (
              <button className="cite" onClick={() => onCite(cite)} title="Show this code">
                {raw}
              </button>
            );
          }
          return <code className="inline">{raw}</code>;
        },
        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
