import { useEffect, useState } from "react";
import { APP_TZ, callFn, PLATFORMS, supabase, WEEKDAYS } from "../lib/supabase.js";
import { Empty, PageHead, PlatformBadge, useAction } from "../components/ui.jsx";

const blank = {
  id: null,
  name: "",
  frequency: "daily",
  weekdays: [1, 3, 5],
  post_time: "09:00",
  account_ids: [],
  tags: "",
  ai_mode: "none",
  ai_brief: "",
  require_approval: false,
};

const AI_MODES = {
  none: { label: "Texte tel quel", help: "Publie le texte de la bibliothèque sans le modifier." },
  enhance: { label: "IA adapte", help: "L'IA réécrit votre texte pour chaque réseau (ton, longueur, hashtags)." },
  generate: { label: "IA rédige", help: "L'IA écrit une publication neuve à partir de vos consignes (et du contenu s'il y en a)." },
};

export function describe(s) {
  const time = String(s.post_time).slice(0, 5);
  if (s.frequency === "daily") return `Chaque jour à ${time}`;
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => s.weekdays.includes(d)).map((d) => WEEKDAYS[d]);
  return `${days.join(", ") || "Aucun jour"} à ${time}`;
}

export default function Schedules() {
  const [list, setList] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, run] = useAction();

  async function load() {
    const [{ data: s }, { data: a }] = await Promise.all([
      supabase.from("schedules").select("*").order("created_at"),
      supabase.from("accounts").select("id, name, platform, active").order("created_at"),
    ]);
    setList(s ?? []);
    setAccounts(a ?? []);
  }
  useEffect(() => { load(); }, []);

  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function submit(e) {
    e.preventDefault();
    if (!form.account_ids.length) return alert("Choisissez au moins un compte.");
    if (form.frequency === "weekly" && !form.weekdays.length) return alert("Choisissez au moins un jour.");
    const row = {
      name: form.name.trim(),
      frequency: form.frequency,
      weekdays: form.weekdays,
      post_time: form.post_time,
      timezone: APP_TZ,
      account_ids: form.account_ids,
      tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      ai_mode: form.ai_mode,
      ai_brief: form.ai_brief.trim(),
      require_approval: form.require_approval,
    };
    const id = await run("save", async () => {
      const q = form.id
        ? supabase.from("schedules").update(row).eq("id", form.id).select("id").single()
        : supabase.from("schedules").insert(row).select("id").single();
      const { data, error } = await q;
      if (error) throw error;
      setForm(null);
      return data.id;
    }, "Règle enregistrée");
    await load();
    if (id) {
      await run(id, () => callFn("planner", { schedule_id: id, days: 7 }), (r) =>
        `${r.created} publication(s) préparée(s) pour 7 jours${r.errors.length ? ` — ${r.errors[0]}` : ""}`);
    }
  }

  return (
    <>
      <PageHead title="Planning" sub="Des règles simples : quels comptes, quel rythme, quel contenu.">
        {!form && <button className="btn primary" onClick={() => setForm(blank)}>+ Nouvelle règle</button>}
      </PageHead>

      {form && (
        <form className="card form" onSubmit={submit}>
          <h2>{form.id ? "Modifier la règle" : "Nouvelle règle"}</h2>
          <label>Nom<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex. Publication du matin" /></label>

          <div className="field">
            <span>Rythme</span>
            <div className="seg">
              <button type="button" className={form.frequency === "daily" ? "on" : ""} onClick={() => setForm({ ...form, frequency: "daily" })}>Quotidien</button>
              <button type="button" className={form.frequency === "weekly" ? "on" : ""} onClick={() => setForm({ ...form, frequency: "weekly" })}>Hebdomadaire</button>
            </div>
          </div>

          {form.frequency === "weekly" && (
            <div className="field">
              <span>Jours</span>
              <div className="chips">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button type="button" key={d} className={form.weekdays.includes(d) ? "on" : ""}
                    onClick={() => setForm({ ...form, weekdays: toggleIn(form.weekdays, d) })}>{WEEKDAYS[d]}</button>
                ))}
              </div>
            </div>
          )}

          <label>Heure de publication ({APP_TZ.split("/")[1]})
            <input type="time" required value={form.post_time} onChange={(e) => setForm({ ...form, post_time: e.target.value })} />
          </label>

          <div className="field">
            <span>Comptes</span>
            {accounts.length === 0 ? <small className="muted">Ajoutez d'abord un compte dans « Comptes ».</small> : (
              <div className="checks">
                {accounts.map((a) => (
                  <label key={a.id} className={`check-row ${a.active ? "" : "off"}`}>
                    <input type="checkbox" checked={form.account_ids.includes(a.id)}
                      onChange={() => setForm({ ...form, account_ids: toggleIn(form.account_ids, a.id) })} />
                    <PlatformBadge platform={a.platform} /> {a.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <label>Piocher dans les étiquettes (vide = toute la bibliothèque)
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="promo, conseil" />
          </label>

          <div className="field">
            <span>Rédaction</span>
            <div className="seg">
              {Object.entries(AI_MODES).map(([k, v]) => (
                <button type="button" key={k} className={form.ai_mode === k ? "on" : ""} onClick={() => setForm({ ...form, ai_mode: k })}>{v.label}</button>
              ))}
            </div>
            <small className="muted">{AI_MODES[form.ai_mode].help}</small>
          </div>

          {form.ai_mode !== "none" && (
            <label>Consignes pour l'IA
              <textarea rows={4} value={form.ai_brief} onChange={(e) => setForm({ ...form, ai_brief: e.target.value })}
                placeholder="Qui nous sommes, notre ton, ce qu'il faut toujours mentionner (téléphone, adresse, site)…" />
            </label>
          )}

          <label className="check-row">
            <input type="checkbox" checked={form.require_approval} onChange={(e) => setForm({ ...form, require_approval: e.target.checked })} />
            Je valide chaque publication avant qu'elle parte
          </label>

          <div className="row gap">
            <button className="btn primary" disabled={!!busy}>{busy ? "…" : "Enregistrer et préparer 7 jours"}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </form>
      )}

      {list.length === 0 && !form ? (
        <Empty title="Aucune règle">Exemple : « Chaque jour à 08:00 sur Facebook et Instagram, l'IA adapte un contenu de la bibliothèque ».</Empty>
      ) : (
        <div className="grid">
          {list.map((s) => (
            <article key={s.id} className={`card ${s.active ? "" : "off"}`}>
              <div className="row between">
                <h3>{s.name}</h3>
                <label className="switch">
                  <input type="checkbox" checked={s.active} onChange={async () => {
                    await supabase.from("schedules").update({ active: !s.active }).eq("id", s.id);
                    load();
                  }} />
                  <span />
                </label>
              </div>
              <p className="big-line">{describe(s)}</p>
              <div className="row gap wrap">
                {s.account_ids.map((id) => {
                  const a = accounts.find((x) => x.id === id);
                  return a ? <PlatformBadge key={id} platform={a.platform} /> : null;
                })}
              </div>
              <p className="small muted">
                {AI_MODES[s.ai_mode].label}
                {s.tags.length ? ` · #${s.tags.join(" #")}` : " · toute la bibliothèque"}
                {s.require_approval ? " · validation manuelle" : ""}
              </p>
              <div className="row gap wrap">
                <button className="btn sm" disabled={!!busy} onClick={() =>
                  run(s.id, () => callFn("planner", { schedule_id: s.id, days: 7 }),
                    (r) => `${r.created} publication(s) préparée(s)${r.errors.length ? ` — ${r.errors[0]}` : ""}`)}>
                  {busy === s.id ? "…" : "Préparer 7 jours"}
                </button>
                <button className="btn sm" onClick={() => setForm({ ...s, post_time: String(s.post_time).slice(0, 5), tags: s.tags.join(", ") })}>Modifier</button>
                <button className="btn sm danger" onClick={async () => {
                  if (!confirm(`Supprimer la règle « ${s.name} » ? Les publications déjà préparées restent dans la file.`)) return;
                  await supabase.from("schedules").delete().eq("id", s.id);
                  load();
                }}>Supprimer</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="small muted foot-note">
        Pilote prépare automatiquement les 7 prochains jours toutes les heures et publie toutes les 5 minutes.
        Plateformes : {Object.values(PLATFORMS).map((p) => p.label).join(", ")}.
      </p>
    </>
  );
}
