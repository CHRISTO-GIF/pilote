import { useEffect, useState } from "react";
import { callFn, fmtDate, supabase } from "../lib/supabase.js";
import { Empty, PageHead, toast, useAction } from "../components/ui.jsx";

const FILTERS = {
  todo: { label: "À traiter", q: (q) => q.in("status", ["flagged", "error"]).eq("resolved", false) },
  replied: { label: "Répondus par l'agent", q: (q) => q.eq("status", "replied") },
  all: { label: "Tout", q: (q) => q },
};
const CAT = {
  quiz: "Quiz", merci: "Remerciement", info: "Demande d'info", court: "Message court",
  sensible: "Sensible", a_relire: "À relire", vide: "Sans texte",
};

export default function Comments() {
  const [filter, setFilter] = useState("todo");
  const [rows, setRows] = useState([]);
  const [pages, setPages] = useState([]);
  const [busy, run] = useAction();

  async function load() {
    const { data } = await FILTERS[filter].q(
      supabase.from("comment_log").select("*, accounts(name)").order("commented_at", { ascending: false }).limit(150),
    );
    setRows(data ?? []);
    const { data: acc } = await supabase.from("accounts").select("id, name, auto_reply").eq("platform", "facebook");
    setPages(acc ?? []);
  }
  useEffect(() => { load(); }, [filter]);

  async function checkNow() {
    const r = await run("check", () => callFn("comment-agent", {}));
    if (r) {
      toast(`${r.nouveaux} nouveau(x) commentaire(s) · ${r.repondus} réponse(s) · ${r.signales} à traiter`);
      if (r.erreurs?.length) toast(r.erreurs[0], "bad");
    }
    load();
  }

  async function authorize() {
    const r = await run("auth", () => callFn("meta-oauth", { comments: true, return_url: location.origin + location.pathname }));
    if (r?.url) location.href = r.url;
  }

  const resolve = async (id) => {
    await supabase.from("comment_log").update({ resolved: true }).eq("id", id);
    toast("Marqué comme traité");
    load();
  };

  return (
    <>
      <PageHead title="Commentaires" sub="L'agent répond seul aux quiz, remerciements et demandes d'information. Il vous signale le reste ici, sans y répondre.">
        <button className="btn primary" disabled={!!busy} onClick={checkNow}>{busy === "check" ? "Vérification…" : "Vérifier maintenant"}</button>
      </PageHead>

      <div className="card">
        <strong>Pages surveillées</strong>
        {pages.length === 0 && <p className="small muted">Aucune Page Facebook connectée.</p>}
        {pages.map((p) => (
          <div key={p.id} className="row between gap" style={{ marginTop: 10 }}>
            <span>{p.name}</span>
            <label className="switch" title={p.auto_reply ? "Réponses automatiques actives" : "Désactivé"}>
              <input type="checkbox" checked={p.auto_reply} onChange={async () => {
                await supabase.from("accounts").update({ auto_reply: !p.auto_reply }).eq("id", p.id);
                load();
              }} />
              <span />
            </label>
          </div>
        ))}
        <p className="small muted" style={{ marginTop: 12 }}>
          Première fois ? Autorisez Pilote à lire et répondre aux commentaires :
        </p>
        <button className="btn sm" disabled={!!busy} onClick={authorize}>{busy === "auth" ? "Ouverture de Facebook…" : "Autoriser les réponses aux commentaires"}</button>
      </div>

      <div className="chips">
        {Object.entries(FILTERS).map(([k, f]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{f.label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title={filter === "todo" ? "Rien à traiter 🎉" : "Aucun commentaire"}>
          L'agent passe toutes les 15 minutes sur les publications des 3 dernières semaines.
        </Empty>
      ) : (
        <div className="posts">
          {rows.map((c) => (
            <article key={c.id} className="card post">
              <div className="row between wrap gap">
                <div className="row gap">
                  <strong>{c.author_name || "Membre de Facebook"}</strong>
                  <span className="small muted">· {c.accounts?.name}</span>
                </div>
                <div className="row gap">
                  <time className="small muted">{fmtDate(c.commented_at)}</time>
                  <span className={`sbadge ${c.status === "replied" ? "ok" : c.status === "error" ? "bad" : "warn"}`}>
                    {CAT[c.category] ?? c.category}
                  </span>
                </div>
              </div>
              <p className="pre">{c.message || "(autocollant ou image)"}</p>
              {c.reply_text && <p className="small muted">↳ Réponse de l'agent : {c.reply_text}</p>}
              {c.error && <p className="small bad-text">{c.error}</p>}
              <div className="row gap wrap">
                {c.permalink && <a className="btn sm" href={c.permalink} target="_blank" rel="noreferrer">Ouvrir sur Facebook</a>}
                {c.status !== "replied" && !c.resolved && <button className="btn sm primary" onClick={() => resolve(c.id)}>C'est traité</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
