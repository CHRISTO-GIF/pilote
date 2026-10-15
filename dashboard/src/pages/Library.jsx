import { useEffect, useState } from "react";
import { mediaUrl, supabase } from "../lib/supabase.js";
import { Empty, PageHead, useAction } from "../components/ui.jsx";

const blank = { id: null, title: "", body: "", tags: "", file: null, media_path: null, media_type: null };

export default function Library({ user }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState("");
  const [busy, run] = useAction();

  async function load() {
    const { data } = await supabase.from("content_items").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    await run("save", async () => {
      let media_path = form.media_path;
      let media_type = form.media_type;
      if (form.file) {
        const ext = form.file.name.split(".").pop().toLowerCase();
        media_path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        media_type = form.file.type.startsWith("video") ? "video" : "image";
        const { error } = await supabase.storage.from("media").upload(media_path, form.file, {
          contentType: form.file.type,
        });
        if (error) throw error;
        if (form.media_path) await supabase.storage.from("media").remove([form.media_path]);
      }
      const row = {
        title: form.title.trim(),
        body: form.body.trim(),
        tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        media_path,
        media_type,
      };
      const q = form.id
        ? supabase.from("content_items").update(row).eq("id", form.id)
        : supabase.from("content_items").insert(row);
      const { error } = await q;
      if (error) throw error;
      setForm(null);
    }, "Contenu enregistré");
    load();
  }

  async function remove(it) {
    if (!confirm(`Supprimer « ${it.title} » ?`)) return;
    if (it.media_path) await supabase.storage.from("media").remove([it.media_path]);
    await supabase.from("content_items").delete().eq("id", it.id);
    load();
  }

  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort();
  const shown = filter ? items.filter((i) => i.tags.includes(filter)) : items;

  return (
    <>
      <PageHead title="Bibliothèque" sub="Vos textes, images et vidéos. Pilote les fait tourner et l'IA les adapte à chaque réseau.">
        {import.meta.env.VITE_MOTION_URL && (
          <a className="btn" href={import.meta.env.VITE_MOTION_URL} target="_blank" rel="noreferrer">🎬 Créer une vidéo animée</a>
        )}
        {!form && <button className="btn primary" onClick={() => setForm(blank)}>+ Ajouter un contenu</button>}
      </PageHead>

      {form && (
        <form className="card form" onSubmit={submit}>
          <h2>{form.id ? "Modifier le contenu" : "Nouveau contenu"}</h2>
          <label>Titre / sujet<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex. Inscriptions ouvertes pour la rentrée" /></label>
          <label>Texte de base
            <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Les informations clés : quoi, quand, où, contact… L'IA s'en servira pour rédiger chaque publication." />
          </label>
          <label>Étiquettes (séparées par des virgules)
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="promo, conseil, événement" />
            <small>Les règles de planning peuvent piocher seulement dans certaines étiquettes.</small>
          </label>
          <label>Image ou vidéo
            <input type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime"
              onChange={(e) => setForm({ ...form, file: e.target.files[0] ?? null })} />
            <small>JPEG ou PNG pour les images, MP4 pour les vidéos. Instagram et TikTok exigent un média ; YouTube exige une vidéo.</small>
          </label>
          {form.media_path && !form.file && <Thumb path={form.media_path} type={form.media_type} />}
          <div className="row gap">
            <button className="btn primary" disabled={!!busy}>{busy ? "Envoi…" : "Enregistrer"}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </form>
      )}

      {allTags.length > 0 && (
        <div className="chips">
          <button className={!filter ? "on" : ""} onClick={() => setFilter("")}>Tout ({items.length})</button>
          {allTags.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>#{t}</button>
          ))}
        </div>
      )}

      {shown.length === 0 && !form ? (
        <Empty title="Bibliothèque vide">Ajoutez des visuels et des textes : c'est la matière première de vos publications.</Empty>
      ) : (
        <div className="grid">
          {shown.map((it) => (
            <article key={it.id} className={`card item ${it.active ? "" : "off"}`}>
              {it.media_path ? <Thumb path={it.media_path} type={it.media_type} /> : <div className="thumb text">Aa</div>}
              <h3>{it.title}</h3>
              <p className="clamp small">{it.body}</p>
              <div className="row gap wrap small muted">
                {it.tags.map((t) => <span key={t}>#{t}</span>)}
                <span>· utilisé {it.use_count}×</span>
              </div>
              <div className="row gap wrap">
                <button className="btn sm" onClick={() => setForm({ ...it, tags: it.tags.join(", "), file: null })}>Modifier</button>
                <button className="btn sm" onClick={async () => {
                  await supabase.from("content_items").update({ active: !it.active }).eq("id", it.id);
                  load();
                }}>{it.active ? "Mettre en pause" : "Réactiver"}</button>
                <button className="btn sm danger" onClick={() => remove(it)}>Supprimer</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function Thumb({ path, type }) {
  const url = mediaUrl(path);
  return type === "video"
    ? <video className="thumb" src={url} muted controls preload="metadata" />
    : <img className="thumb" src={url} alt="" loading="lazy" />;
}
