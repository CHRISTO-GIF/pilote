import { useEffect, useState } from "react";
import { callFn, fmtDate, PLATFORMS, supabase } from "../lib/supabase.js";
import { Empty, PageHead, PlatformBadge, toast, useAction } from "../components/ui.jsx";

const blank = { platform: "tiktok", name: "", external_id: "", access_token: "", refresh_token: "", expires_days: "" };

// Connexions en un bouton (OAuth)
const PROVIDERS = {
  meta: { fn: "meta-oauth", label: "Facebook et Instagram", wait: "Ouverture de Facebook…" },
  youtube: { fn: "youtube-oauth", label: "YouTube", wait: "Ouverture de Google…" },
};

export default function Accounts() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, run] = useAction();

  async function load() {
    const { data } = await supabase.from("accounts").select("*").order("created_at");
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);

  // Retour d'une connexion Facebook/Instagram ou YouTube
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const provider = q.get("connect");
    const status = q.get("status");
    if (!provider || !status) return;
    const name = PROVIDERS[provider]?.label ?? provider;
    const n = Number(q.get("n") ?? 0);
    const msg = status === "ok"
      ? [`${name} : ${n} compte${n > 1 ? "s" : ""} connecté${n > 1 ? "s" : ""} ✓`, "ok"]
      : status === "annule"
      ? [`Connexion ${name} annulée`, "bad"]
      : [`${name} : ${q.get("message") ?? "la connexion a échoué"}`, "bad"];
    setTimeout(() => toast(...msg), 400); // laisser le temps au système de notifications de démarrer
    history.replaceState(null, "", location.pathname + location.hash);
  }, []);

  async function connect(provider) {
    const r = await run(provider, () => callFn(PROVIDERS[provider].fn, {
      action: "start",
      return_url: location.origin + location.pathname,
    }));
    if (r?.url) location.href = r.url;
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

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

  const manual = Object.entries(PLATFORMS).filter(([, v]) => v.oauth !== "youtube");
  const p = form && PLATFORMS[form.platform];

  return (
    <>
      <PageHead title="Comptes" sub="Les pages et chaînes sur lesquelles Pilote publie." />

      <section className="connect">
        <button className="connect-btn meta" disabled={!!busy} onClick={() => connect("meta")}>
          <span className="connect-ico"><i style={{ background: PLATFORMS.facebook.color }}>f</i><i style={{ background: PLATFORMS.instagram.color }}>◎</i></span>
          <span className="connect-txt">
            <strong>{busy === "meta" ? PROVIDERS.meta.wait : "Connecter Facebook et Instagram"}</strong>
            <small>Toutes vos Pages et leurs comptes Instagram liés, en une fois</small>
          </span>
        </button>
        <button className="connect-btn yt" disabled={!!busy} onClick={() => connect("youtube")}>
          <span className="connect-ico"><i style={{ background: PLATFORMS.youtube.color }}>▶</i></span>
          <span className="connect-txt">
            <strong>{busy === "youtube" ? PROVIDERS.youtube.wait : "Connecter ma chaîne YouTube"}</strong>
            <small>Vos vidéos verticales deviennent des Shorts</small>
          </span>
        </button>
        {!form && (
          <button className="link manual-link" onClick={() => setForm(blank)}>
            TikTok, LinkedIn ou saisie manuelle d'un jeton →
          </button>
        )}
      </section>

      {form && (
        <form className="card form" onSubmit={submit}>
          <h2>Saisie manuelle</h2>
          <div className="seg">
            {manual.map(([k, v]) => (
              <button type="button" key={k} className={form.platform === k ? "on" : ""}
                onClick={() => setForm({ ...form, platform: k })}>{v.label}</button>
            ))}
          </div>
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
        </form>
      )}

      {list.length === 0 ? (
        <Empty title="Aucun compte connecté">Touchez un des boutons ci-dessus pour relier vos réseaux.</Empty>
      ) : (
        <div className="grid">
          {list.map((a) => {
            const oauth = PLATFORMS[a.platform]?.oauth;
            return (
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
                {a.last_check_at && (
                  <p className={`check ${a.last_check_ok ? "ok" : "bad"}`}>
                    {a.last_check_ok ? "✓" : "✕"} {a.last_check_message}
                    <small>Vérifié {fmtDate(a.last_check_at)}</small>
                  </p>
                )}
                <div className="row gap wrap">
                  <button className="btn sm" disabled={!!busy} onClick={() =>
                    run(a.id, () => callFn("account-tools", { action: "check", account_id: a.id }),
                      (c) => c.message).then(load)}>
                    {busy === a.id ? "Test…" : "Tester"}
                  </button>
                  {oauth ? (
                    <button className="btn sm" disabled={!!busy} onClick={() => connect(oauth)}>Reconnecter</button>
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
            );
          })}
        </div>
      )}
    </>
  );
}
