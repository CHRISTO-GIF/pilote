import { useEffect, useState } from "react";
import { PLATFORMS, STATUS } from "../lib/supabase.js";

export function PlatformBadge({ platform }) {
  const p = PLATFORMS[platform];
  return (
    <span className="pbadge" style={{ "--pc": p?.color ?? "#666" }}>
      <i />
      {p?.label ?? platform}
    </span>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status] ?? { label: status, tone: "muted" };
  return <span className={`sbadge ${s.tone}`}>{s.label}</span>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <header className="pagehead">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="pagehead-actions">{children}</div>}
    </header>
  );
}

/** Petit système de notifications global */
let pushToast = () => {};
export function toast(msg, tone = "ok") {
  pushToast({ id: Math.random(), msg, tone });
}
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    pushToast = (t) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), 5000);
    };
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>{t.msg}</div>
      ))}
    </div>
  );
}

/** Exécute une action asynchrone avec état de chargement + notification d'erreur */
export function useAction() {
  const [busy, setBusy] = useState(null);
  async function run(key, fn, okMsg) {
    setBusy(key);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg);
      return r;
    } catch (e) {
      toast(e.message ?? String(e), "bad");
    } finally {
      setBusy(null);
    }
  }
  return [busy, run];
}
