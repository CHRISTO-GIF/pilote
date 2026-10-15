import { useEffect, useState } from "react";
import { callFn, fmtDate, supabase } from "../lib/supabase.js";
import { Empty, PageHead, PlatformBadge, StatusBadge, useAction } from "../components/ui.jsx";

export default function Overview({ go }) {
  const [stats, setStats] = useState(null);
  const [next, setNext] = useState([]);
  const [busy, run] = useAction();

  async function load() {
    const now = new Date().toISOString();
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const count = (q) => q.then((r) => r.count ?? 0);
    const base = () => supabase.from("posts").select("id", { count: "exact", head: true });
    const [upcoming, toApprove, published, failed, accounts, schedules] = await Promise.all([
      count(base().eq("status", "scheduled").gte("scheduled_at", now)),
      count(base().eq("status", "pending_approval")),
      count(base().eq("status", "published").gte("published_at", weekAgo)),
      count(base().eq("status", "failed")),
      count(supabase.from("accounts").select("id", { count: "exact", head: true }).eq("active", true)),
      count(supabase.from("schedules").select("id", { count: "exact", head: true }).eq("active", true)),
    ]);
    setStats({ upcoming, toApprove, published, failed, accounts, schedules });
    const { data } = await supabase
      .from("posts")
      .select("id, caption, scheduled_at, status, accounts(name, platform)")
      .in("status", ["scheduled", "pending_approval"])
      .order("scheduled_at")
      .limit(6);
    setNext(data ?? []);
  }
  useEffect(() => { load(); }, []);

  const steps = stats && [
    { done: stats.accounts > 0, label: "Ajouter vos pages et comptes", tab: "accounts" },
    { done: stats.schedules > 0, label: "Créer une règle de publication (quotidienne ou hebdomadaire)", tab: "schedules" },
    { done: stats.upcoming + stats.toApprove > 0, label: "Générer le planning des 7 prochains jours", tab: "schedules" },
  ];

  return (
    <>
      <PageHead title="Tableau de bord" sub="Ce que Pilote publie pour vous.">
        <button className="btn" disabled={!!busy} onClick={() =>
          run("plan", () => callFn("planner", { days: 7 }), (r) =>
            `${r.created} publication(s) préparée(s)${r.errors.length ? ` · ${r.errors.length} alerte(s)` : ""}`).then(load)}>
          {busy === "plan" ? "Préparation…" : "Préparer la semaine"}
        </button>
        <button className="btn primary" disabled={!!busy} onClick={() =>
          run("pub", () => callFn("publisher", {}), (r) => `${r.processed} publication(s) traitée(s)`).then(load)}>
          {busy === "pub" ? "Envoi…" : "Publier ce qui est dû"}
        </button>
      </PageHead>

      {stats && (
        <section className="stats">
          <Stat n={stats.upcoming} label="programmées" />
          <Stat n={stats.toApprove} label="à valider" tone={stats.toApprove ? "warn" : ""} onClick={() => go("posts")} />
          <Stat n={stats.published} label="publiées (7 j)" tone="ok" />
          <Stat n={stats.failed} label="en échec" tone={stats.failed ? "bad" : ""} onClick={() => go("posts")} />
        </section>
      )}

      {steps && steps.some((s) => !s.done) && (
        <section className="card">
          <h2>Mise en route</h2>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={i} className={s.done ? "done" : ""}>
                <span>{s.done ? "✓" : i + 1}</span>
                <button className="link" onClick={() => go(s.tab)}>{s.label}</button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <h2>Prochaines publications</h2>
        {next.length === 0 ? (
          <Empty title="Rien de programmé">Créez une règle dans « Planning » puis cliquez sur « Préparer la semaine ».</Empty>
        ) : (
          <ul className="timeline">
            {next.map((p) => (
              <li key={p.id}>
                <time>{fmtDate(p.scheduled_at)}</time>
                <div>
                  <div className="row gap">
                    <PlatformBadge platform={p.accounts?.platform} />
                    <strong>{p.accounts?.name}</strong>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="clamp">{p.caption || <em className="muted">(sans texte)</em>}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ n, label, tone = "", onClick }) {
  return (
    <button className={`stat ${tone}`} onClick={onClick} disabled={!onClick}>
      <b>{n}</b>
      <span>{label}</span>
    </button>
  );
}
