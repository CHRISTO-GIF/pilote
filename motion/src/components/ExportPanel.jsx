import { useEffect, useState } from "react";
import { FORMATS } from "../engine/engine.js";
import { exportPoster, exportVideo, pickMime } from "../engine/exporter.js";
import { contentImages, getImg, preload } from "../lib/images.js";
import { sendToPilote, supabase } from "../lib/supabase.js";

export default function ExportPanel({ state, format, audio, caption, setCaption, needLogin, toast }) {
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const mime = pickMime();

  // Toute modification invalide la vidéo déjà exportée
  useEffect(() => {
    setSent(false);
  }, [result]);

  async function run() {
    const F = FORMATS[format];
    setResult(null);
    setProgress(0);
    try {
      await preload(contentImages(state.content));
      await document.fonts.load(`700 40px "${state.font}"`);
      const r = await exportVideo({ width: F.w, height: F.h, state, getImg, audioFile: audio, onProgress: setProgress });
      if (result?.url) URL.revokeObjectURL(result.url);
      setResult({ ...r, url: URL.createObjectURL(r.blob) });
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setProgress(null);
    }
  }

  async function poster() {
    const F = FORMATS[format];
    await preload(contentImages(state.content));
    const blob = await exportPoster({ width: F.w, height: F.h, state, getImg });
    download(URL.createObjectURL(blob), `${fileBase(state)}.png`);
  }

  async function send() {
    if (!supabase) return toast("Configurez Supabase (.env) pour envoyer vers Pilote.", "bad");
    const { data } = await supabase.auth.getSession();
    if (!data.session) return needLogin();
    setSending(true);
    try {
      const c = state.content;
      await sendToPilote({
        blob: result.blob,
        ext: result.ext,
        mime: result.mime,
        title: c.titre || c.marque || state.template.name,
        body: caption || [c.titre, c.sousTitre, c.cta, c.contact].filter(Boolean).join("\n"),
        tags: ["motion", state.template.id],
      });
      setSent(true);
      toast("Vidéo ajoutée à la bibliothèque de Pilote ✓");
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="export">
      <div className="row">
        <button className="btn primary grow" disabled={progress !== null} onClick={run}>
          {progress !== null ? `Enregistrement… ${Math.round(progress * 100)} %` : "🎬 Exporter la vidéo"}
        </button>
        <button className="btn" onClick={poster} title="Image fixe de la dernière image">PNG</button>
      </div>
      {progress !== null && (
        <>
          <div className="bar"><i style={{ width: `${progress * 100}%` }} /></div>
          <small className="muted">L'enregistrement se fait en temps réel : gardez cet onglet ouvert au premier plan.</small>
        </>
      )}
      {!mime && <small className="bad-text">Ce navigateur ne peut pas enregistrer de vidéo. Utilisez Chrome, Edge ou Safari récent.</small>}
      {mime && !mime.startsWith("video/mp4") && (
        <small className="muted">Ce navigateur exporte en WebM. Pour Instagram et TikTok (MP4 obligatoire), exportez depuis Chrome récent ou Safari.</small>
      )}

      {result && (
        <div className="result">
          <video src={result.url} controls playsInline />
          <div className="row wrap">
            <button className="btn" onClick={() => download(result.url, `${fileBase(state)}.${result.ext}`)}>⬇ Télécharger ({result.ext.toUpperCase()}, {(result.blob.size / 1e6).toFixed(1)} Mo)</button>
          </div>
          <label className="field">
            <span>Légende de la publication</span>
            <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder="Texte qui accompagnera la vidéo sur les réseaux (l'IA le propose quand vous l'utilisez)." />
          </label>
          <button className="btn accent" disabled={sending || sent} onClick={send}>
            {sent ? "✓ Dans la bibliothèque Pilote" : sending ? "Envoi…" : "Envoyer vers Pilote"}
          </button>
          <small className="muted">La vidéo rejoint la bibliothèque avec l'étiquette #motion : vos règles de planning peuvent la publier automatiquement.</small>
        </div>
      )}
    </div>
  );
}

function fileBase(state) {
  const slug = (state.content.titre || state.template.name)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `motion-${slug || state.template.id}`;
}

function download(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
