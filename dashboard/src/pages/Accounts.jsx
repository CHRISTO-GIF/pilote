import { useEffect, useState } from "react";
import { callFn, fmtDate, PLATFORMS, supabase } from "../lib/supabase.js";
import { Empty, PageHead, PlatformBadge, toast, useAction } from "../components/ui.jsx";

const blank = { platform: "facebook", name: "", external_id: "", access_token: "", refresh_token: "", expires_days: "" };

export default function Accounts() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, run] = useAction();

  async function load() {
    const { data } = await supabase.from("accounts").select("*").order("created_at");
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);

  // Retour de la connexion Google (YouTube)
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const yt = q.get("youtube");
    if (!yt) return;
    const msg = yt === "ok" ? ["Chaîne YouTube connectée ✓", "ok"]
      : yt === "annule" ? ["Connexion YouTube annulée", "bad"]
      : [`YouTube : ${q.get("message") ?? "la connexion a échoué"}`, "bad"];
    setTimeout(() => toast(...msg), 400); // laisser le temps au système de notifications de démarrer
    history.replaceState(null, "", location.pathname + location.hash);
  }, []);

  async function connectYouTube() {
    const r = await run("yt", () => callFn("youtube-oauth", {
      action: "start",
      return_url: location.origin + location.pathname,
    }));
    if (r?.url) location.href = r.url;
  }

  const set =(k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function saveToken(accountId, f) {
    await callFn("account-tools", {
      action: "save_token",
      account_id: accountId,
      access_token: f.access_token,
      refresh_token: f.refresh_token || null,
      expires_in_seconds: f.expires_days ? Number(f.expires_days) * 86400 : 0,
    });
  }

  async function submit(e) {
    e.preventDefault();
    await run("save", async () => {
      const { data, error } = await supabase
        .from("accounts")
        .insert({ platform: form.platform, name: form.name.trim(), external_id: form.external_id.trim() })
        .select("id")
        .single();
      if (error) throw error;
      try {
        await saveToken(data.id, form);
      } catch (err) {
        await supabase.from("accounts").delete().eq("id", data.id);
        throw err;
      }
      const check = await callFn("account-tools", { action: "check", account_id: data.id });
      setForm(null);
      return check;
    }, (c) => (c.ok ? `Compte ajouté — ${c.message}` : `Compte ajouté, mais le test échoue : ${c.message}`));
    load();
  }

  const p = form && PLATFORMS[form.platform];

  return (
    <>
      <PageHead title="Comptes" sub="Les pages et profils sur lesquels Pilote publie.">
        {!form && <button className="btn primary" onClick={() => setForm(blank)}>+ Ajouter un compte</button>}
      </PageHead>

      {form && (
        <form className="card form" onSubmit={submit}>
          <h2>Nouveau compte</h2>
          <div className="seg">
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <button type="button" key={k} className={form.platform === k ? "on" : ""}
                onClick={() => setForm({ ...form, platform: k })}>{v.label}</button>
            ))}
          </div>
          {p.oauth ? (
            <div className="oauth-box">
              <p>{p.help}</p>
              <button type="button" className="btn primary" disabled={!!busy} onClick={connectYouTube}>
                {busy === "yt" ? "Ouverture de Google…" : "▶ Connecter ma chaîne YouTube"}
              </button>
              <small className="muted">Vous choisirez votre compte Google, puis vous reviendrez ici automatiquement.</small>
              <button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button>
            </div>
          ) : (<>
          <label>Nom affiché<input required value={form.name} onChange={set("name")} placeholder="Ex. Page de l'école" /></label>
          <label>{p.idLabel}<input required value={form.external_id} onChange={set("external_id")} /><small>{p.idHelp}</small></label>
          <label>Jeton d'accès<textarea required rows={3} value={form.access_token} onChange={set("access_token")} /><small>{p.tokenHelp}</small></label>
          {form.platform === "tiktok" && (
            <label>Jeton de rafraîchissement<textarea rows={2} value={form.refresh_token} onChange={set("refresh_token")} /></label>
          )}
          {(form.platform === "linkedin" || form.platform === "tiktok") && (
            <label>Le jeton expire dans (jours)
              <input type="number" min="0" step="0.01" value={form.expires_days} onChange={set("expires_days")}
                placeholder={form.platform === "tiktok" ? "1" : "60"} />
            </label>
          )}
          <p className="muted small">Le jeton est stocké côté serveur et n'est plus jamais affiché dans le navigateur.</p>
          <div className="row gap">
            <button className="btn primary" disabled={!!busy}>{busy ? "Enregistrement…" : "Enregistrer et tester"}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button>
          </div>
          </>)}
        </form>
      )}

      {list.length === 0 && !form ? (
        <Empty title="Aucun compte">Ajoutez votre première page Facebook, Instagram, LinkedIn, TikTok ou votre chaîne YouTube.</Empty>
      ) : (
        <div className="grid">
          {list.map((a) => (
            <article key={a.id} className={`card acc ${a.active ? "" : "off"}`}>
              <div className="row between">
                <PlatformBadge platform={a.platform} />
                <label className="switch" title={a.active ? "Actif" : "En pause"}>
                  <input type="checkbox" checked={a.active} onChange={async () => {
                    await supabase.from("accounts").update({ active: !a.active }).eq("id", a.id);
                    load();
                  }} />
                  <span />
                </label>
              </div>
              <h3>{a.name}</h3>
              <code className="small">{a.external_id}</code>
              {a.last_check_at && (
                <p className={`check ${a.last_check_ok ? "ok" : "bad"}`}>
                  {a.last_check_ok ? "✓" : "✕"} {a.last_check_message}
                  <small>Testé {fmtDate(a.last_check_at)}</small>
                </p>
              )}
              <div className="row gap wrap">
                <button className="btn sm" disabled={!!busy} onClick={() =>
                  run(a.id, () => callFn("account-tools", { action: "check", account_id: a.id }),
                    (c) => c.message).then(load)}>
                  {busy === a.id ? "Test…" : "Tester"}
                </button>
                {PLATFORMS[a.platform]?.oauth ? (
                  <button className="btn sm" disabled={!!busy} onClick={connectYouTube}>Reconnecter</button>
                ) : (
                <button className="btn sm" onClick={() => {
                  const t = prompt("Nouveau jeton d'accès :");
                  if (!t) return;
                  const days = a.platform === "linkedin" ? prompt("Expire dans combien de jours ? (vide = jamais)", "60") : "";
                  run("tok", () => saveToken(a.id, { access_token: t, expires_days: days }), "Jeton mis à jour");
                }}>Changer le jeton</button>
                )}
                <button className="btn sm danger" onClick={async () => {
                  if (!confirm(`Supprimer « ${a.name} » et ses publications programmées ?`)) return;
                  await supabase.from("accounts").delete().eq("id", a.id);
                  load();
                }}>Supprimer</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
