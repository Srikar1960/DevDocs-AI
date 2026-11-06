import { useEffect, useRef } from "react";
import { Icon } from "./Icons.jsx";

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector("input, button.primary, button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose, busy }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{body}</p>
      <footer>
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button className="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
      </footer>
    </Modal>
  );
}
