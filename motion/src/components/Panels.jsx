import { useState } from "react";
import LiveCanvas from "./LiveCanvas.jsx";
import { FORMATS } from "../engine/engine.js";
import { FONTS, PALETTES, TEMPLATES, fieldList } from "../engine/templates.js";
import { callFn, supabase } from "../lib/supabase.js";

// ---------------------------------------------------------------------------
// Galerie : votre contenu animé dans tous les modèles en même temps
// ---------------------------------------------------------------------------
export function Gallery({ base, format, current, onPick, durations }) {
  const F = FORMATS[format];
  const k = 200 / Math.min(F.w, F.h);
  return (
    <div className="gallery">
      {TEMPLATES.map((tpl) => (
        <button key={tpl.id} className={`tpl ${current === tpl.id ? "on" : ""}`} onClick={() => onPick(tpl.id)}>
          <div className={`tpl-thumb f${format.replace(":", "x")}`}>
            <LiveCanvas
              state={{ ...base, template: tpl, duration: durations[tpl.id] ?? tpl.duration }}
              width={Math.round(F.w * k)}
              height={Math.round(F.h * k)}
            />
          </div>
          <strong>{tpl.name}</strong>
          <small>{tpl.desc}</small>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contenu du modèle + remplissage par l'IA
// ---------------------------------------------------------------------------
export function ContentEditor({ tpl, content, setContent, onCaption, needLogin, toast }) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = fieldList(tpl);
  const set = (k, v) => setContent({ ...content, [k]: v });

  async function aiFill() {
    if (!brief.trim()) return toast("Décrivez d'abord ce que la vidéo doit annoncer.", "bad");
    if (!supabase) return toast("Configurez Supabase pour utiliser l'IA.", "bad");
    const { data } = await supabase.auth.getSession();
    if (!data.session) return needLogin();
    setBusy(true);
    try {
      const r = await callFn("motion-script", {
        template: tpl.name,
        brief,
        fields: fields
          .filter((f) => ["text", "textarea", "date"].includes(f.type))
          .map((f) => ({ key: f.key, label: f.label, type: f.type, max: f.max })),
      });
      setContent({ ...content, ...r.fields });
      if (r.caption) onCaption(r.caption);
      toast("Textes rédigés ✓ — relisez-les et ajustez si besoin.");
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor">
      <div className="ai-box">
        <label>
          <span>✦ Remplir avec l'IA</span>
          <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)}
            placeholder="Ex. Notre école Holy Flame ouvre les inscriptions pour la rentrée, test d'entrée le 14 novembre, places limitées." />
        </label>
        <button className="btn accent" disabled={busy} onClick={aiFill}>{busy ? "Rédaction…" : "Rédiger les textes"}</button>
      </div>

      {fields.map((f) => (
        <Field key={f.key} f={f} value={content[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
    </div>
  );
}

function Field({ f, value, onChange }) {
  if (f.type === "image") {
    return (
      <div className="field">
        <span>{f.label}</span>
        <div className="img-field">
          {value && <img src={value} alt="" />}
          <label className="btn small file">
            {value ? "Changer" : "Choisir une image"}
            <input type="file" accept="image/*" hidden onChange={(e) => {
              const file = e.target.files[0];
              if (file) onChange(URL.createObjectURL(file));
            }} />
          </label>
          {value && <button className="btn small ghost" onClick={() => onChange(null)}>Retirer</button>}
        </div>
      </div>
    );
  }
  if (f.type === "images") {
    const list = value ?? [];
    return (
      <div className="field">
        <span>{f.label}</span>
        <div className="img-list">
          {list.map((u, i) => (
            <div key={u} className="img-item">
              <img src={u} alt="" />
              <button aria-label="Retirer" onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {list.length < 5 && (
            <label className="img-add">
              +
              <input type="file" accept="image/*" multiple hidden onChange={(e) => {
                const urls = [...e.target.files].slice(0, 5 - list.length).map((x) => URL.createObjectURL(x));
                onChange([...list, ...urls]);
              }} />
            </label>
          )}
        </div>
      </div>
    );
  }
  const common = {
    value: value ?? "",
    maxLength: f.max,
    onChange: (e) => onChange(e.target.value),
  };
  return (
    <label className="field">
      <span>{f.label}</span>
      {f.type === "textarea" ? <textarea rows={3} {...common} />
        : <input type={f.type === "date" ? "date" : "text"} {...common} />}
      {f.help && <small>{f.help}</small>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Style : couleurs, police, durée, musique
// ---------------------------------------------------------------------------
export function StyleEditor({ palette, setPalette, fontName, setFont, duration, setDuration, audio, setAudio }) {
  return (
    <div className="editor">
      <div className="field">
        <span>Palette</span>
        <div className="palettes">
          {PALETTES.map((pl) => (
            <button key={pl.name} title={pl.name}
              className={`pal ${palette.name === pl.name ? "on" : ""}`}
              onClick={() => setPalette(pl)}>
              {[pl.bg, pl.fg, pl.accent, pl.accent2].map((c, i) => <i key={i} style={{ background: c }} />)}
              <small>{pl.name}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Couleurs personnalisées</span>
        <div className="colors">
          {[["bg", "Fond"], ["fg", "Texte"], ["accent", "Accent"], ["accent2", "Accent 2"]].map(([k, l]) => (
            <label key={k}>
              <input type="color" value={palette[k]} onChange={(e) => setPalette({ ...palette, name: "Perso", [k]: e.target.value })} />
              <small>{l}</small>
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Police</span>
        <div className="chips">
          {FONTS.map((f) => (
            <button key={f} className={fontName === f ? "on" : ""} style={{ fontFamily: `"${f}"` }} onClick={() => setFont(f)}>{f}</button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Durée : {duration} s</span>
        <input type="range" min="4" max="20" step="1" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        <small>L'animation s'étire ou s'accélère pour tenir dans la durée choisie.</small>
      </label>
      <div className="field">
        <span>Musique (facultatif)</span>
        <div className="img-field">
          <label className="btn small file">
            {audio ? "Changer" : "Choisir un fichier audio"}
            <input type="file" accept="audio/*" hidden onChange={(e) => setAudio(e.target.files[0] ?? null)} />
          </label>
          {audio && <><small className="ellipsis">{audio.name}</small><button className="btn small ghost" onClick={() => setAudio(null)}>Retirer</button></>}
        </div>
        <small>Utilisez une musique libre de droits : les réseaux bloquent les morceaux protégés.</small>
      </div>
    </div>
  );
}
