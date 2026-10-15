import { useEffect, useState } from "react";
import { callFn, fmtDate, supabase } from "../lib/supabase.js";
import { Empty, PageHead, PlatformBadge, StatusBadge, toast, useAction } from "../components/ui.jsx";
import { Thumb } from "./Library.jsx";

const FILTERS = {
  upcoming: { label: "À venir", statuses: ["scheduled", "pending_approval", "publishing"], asc: true },
  approve: { label: "À valider", statuses: ["pending_approval"], asc: true },
  published: { label: "Publiées", statuses: ["published"], asc: false },
  failed: { label: "Échecs", statuses: ["failed"], asc: false },
  all: { label: "Tout", statuses: null, asc: false },
};

export default function Posts() {
  const [filter, setFilter] = useState("upcoming");
  const [posts, setPosts] = useState([]);
  const [composer, setComposer] = useState(false);
  const [busy, run] = useAction();

  async function load() {
    const f = FILTERS[filter];
    let q = supabase
      .from("posts")
      .select("*, accounts(name, platform)")
      .order("scheduled_at", { ascending: f.asc })
      .limit(100);
    if (f.statuses) q = q.in("status", f.statuses);
    const { data } = await q;
    setPosts(data ?? []);
  }
  useEffect(() => { load(); }, [filter]);

  const update = async (id, patch, msg) => {
    const { error } = await supabase.from("posts").update(patch).eq("id", id);
    if (error) return toast(error.message, "bad");
    if (msg) toast(msg);
    load();
  };

  async function publishNow(p) {
    await update(p.id, { status: "scheduled", scheduled_at: new Date().toISOString(), attempts: 0, error: null });
    const r = await run(p.id, () => callFn("publisher", { post_id: p.id }));
    const res = r?.results?.[0];
    if (res) toast(res.ok ? "Publié ✓" : `Échec : ${res.detail}`, res.ok ? "ok" : "bad");
    load();
  }

  async function rewrite(p) {
    const r = await run(`ai-${p.id}`, () => callFn("generate-caption", {
      platform: p.accounts.platform, mode: "enhance", source_text: p.caption, media_type: p.media_type,
    }));
    if (r?.caption) setPosts((xs) => xs.map((x) => (x.id === p.id ? { ...x, caption: r.caption, _dirty: true } : x)));
  }

  // Grouper par jour pour la lecture
  const groups = [];
  for (const p of posts) {
    const day = new Date(p.scheduled_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const g = groups.at(-1);
    if (g && g.day === day) g.items.push(p);
    else groups.push({ day, items: [p] });
  }

  return (
    <>
      <PageHead title="Publications" sub="La file d'attente et l'historique. Vous pouvez tout relire et corriger.">
        <button className="btn primary" onClick={() => setComposer(!composer)}>{composer ? "Fermer" : "+ Publication ponctuelle"}</button>
      </PageHead>

      {composer && <Composer onDone={() => { setComposer(false); load(); }} />}

      <div className="chips">
        {Object.entries(FILTERS).map(([k, f]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{f.label}</button>
        ))}
      </div>

      {posts.length === 0 ? (
        <Empty title="Rien ici">Les publications apparaissent ici après « Préparer la semaine » ou une publication ponctuelle.</Empty>
      ) : groups.map((g) => (
        <section key={g.day}>
          <h2 className="day">{g.day}</h2>
          <div className="posts">
            {g.items.map((p) => {
              const editable = ["scheduled", "pending_approval", "failed"].includes(p.status);
              return (
                <article key={p.id} className="card post">
                  <div className="row between wrap gap">
                    <div className="row gap">
                      <PlatformBadge platform={p.accounts?.platform} />
                      <strong>{p.accounts?.name}</strong>
                    </div>
                    <div className="row gap">
                      <time className="small muted">{fmtDate(p.status === "published" ? p.published_at : p.scheduled_at)}</time>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div className="post-body">
                    {p.media_path && <Thumb path={p.media_path} type={p.media_type} />}
                    {editable ? (
                      <textarea rows={5} value={p.caption}
                        onChange={(e) => setPosts((xs) => xs.map((x) => (x.id === p.id ? { ...x, caption: e.target.value, _dirty: true } : x)))} />
                    ) : (
                      <p className="pre">{p.caption}</p>
                    )}
                  </div>
                  {p.error && <p className={`small ${p.status === "failed" ? "bad-text" : "muted"}`}>{p.error}</p>}
                  {editable && (
                    <div className="row gap wrap">
                      {p._dirty && <button className="btn sm primary" onClick={() => update(p.id, { caption: p.caption }, "Texte enregistré")}>Enregistrer le texte</button>}
                      {p.status === "pending_approval" && (
                        <button className="btn sm primary" onClick={() => update(p.id, { status: "scheduled", caption: p.caption }, "Validé : sera publié à l'heure prévue")}>Valider</button>
                      )}
                      <button className="btn sm" disabled={!!busy} onClick={() => rewrite(p)}>{busy === `ai-${p.id}` ? "IA…" : "Réécrire avec l'IA"}</button>
                      <button className="btn sm" disabled={!!busy} onClick={() => publishNow(p)}>{busy === p.id ? "Envoi…" : "Publier maintenant"}</button>
                      <button className="btn sm danger" onClick={() => update(p.id, { status: "cancelled" }, "Publication annulée")}>Annuler</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

function Composer({ onDone }) {
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ account_ids: [], caption: "", item_id: "", when: "" });
  const [busy, run] = useAction();

  useEffect(() => {
    supabase.from("accounts").select("id, name, platform").eq("active", true).then(({ data }) => setAccounts(data ?? []));
    supabase.from("content_items").select("id, title, body, media_path, media_type").eq("active", true)
      .order("created_at", { ascending: false }).then(({ data }) => setItems(data ?? []));
  }, []);

  const item = items.find((i) => i.id === f.item_id);

  async function submit(e) {
    e.preventDefault();
    if (!f.account_ids.length) return toast("Choisissez au moins un compte", "bad");
    await run("save", async () => {
      const at = f.when ? new Date(f.when) : new Date();
      const rows = f.account_ids.map((account_id) => ({
        account_id,
        content_item_id: item?.id ?? null,
        caption: f.caption,
        media_path: item?.media_path ?? null,
        media_type: item?.media_type ?? null,
        scheduled_at: at.toISOString(),
        status: "scheduled",
      }));
      const { error } = await supabase.from("posts").insert(rows);
      if (error) throw error;
      if (!f.when) await callFn("publisher", {});
    }, f.when ? "Publication programmée" : "Publication envoyée");
    onDone();
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Publication ponctuelle</h2>
      <div className="checks">
        {accounts.map((a) => (
          <label key={a.id} className="check-row">
            <input type="checkbox" checked={f.account_ids.includes(a.id)} onChange={() => setF({
              ...f,
              account_ids: f.account_ids.includes(a.id) ? f.account_ids.filter((x) => x !== a.id) : [...f.account_ids, a.id],
            })} />
            <PlatformBadge platform={a.platform} /> {a.name}
          </label>
        ))}
      </div>
      <label>Média de la bibliothèque (facultatif)
        <select value={f.item_id} onChange={(e) => {
          const it = items.find((i) => i.id === e.target.value);
          setF({ ...f, item_id: e.target.value, caption: f.caption || it?.body || "" });
        }}>
          <option value="">— Aucun (texte seul) —</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.media_type ? ` (${i.media_type})` : ""}</option>)}
        </select>
      </label>
      {item?.media_path && <Thumb path={item.media_path} type={item.media_type} />}
      <label>Texte<textarea required rows={5} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></label>
      <label>Date et heure (vide = maintenant)
        <input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
      </label>
      <div className="row gap">
        <button className="btn primary" disabled={!!busy}>{busy ? "…" : f.when ? "Programmer" : "Publier maintenant"}</button>
      </div>
    </form>
  );
}
