import { useEffect, useMemo, useState } from "react";
import { FORMATS } from "./engine/engine.js";
import { DEFAULT_CONTENT, FONTS, PALETTES, TEMPLATES } from "./engine/templates.js";
import Player from "./components/Player.jsx";
import { ContentEditor, Gallery, StyleEditor } from "./components/Panels.jsx";
import ExportPanel from "./components/ExportPanel.jsx";
import Login from "./components/Login.jsx";
import { supabase } from "./lib/supabase.js";

const STORE = "pilote-motion-v1";

function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "{}");
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}

export default function App() {
  const saved = useMemo(loadSaved, []);
  const [tplId, setTplId] = useState(saved.tplId ?? "kinetic");
  const [format, setFormat] = useState(saved.format ?? "9:16");
  // Les images (URL locales) ne survivent pas à un rechargement : on ne garde que les textes
  const [content, setContent] = useState({ ...DEFAULT_CONTENT, ...(saved.content ?? {}), image: null, images: [], logo: null });
  const [palette, setPalette] = useState(saved.palette ?? PALETTES[0]);
  const [fontName, setFont] = useState(saved.font ?? FONTS[0]);
  const [durations, setDurations] = useState(saved.durations ?? {});
  const [audio, setAudio] = useState(null);
  const [caption, setCaption] = useState("");
  const [tab, setTab] = useState("templates");
  const [session, setSession] = useState(null);
  const [login, setLogin] = useState(false);
  const [toasts, setToasts] = useState([]);

  const tpl = TEMPLATES.find((x) => x.id === tplId) ?? TEMPLATES[0];
  const duration = durations[tpl.id] ?? tpl.duration;
  const base = { content, palette, font: fontName };
  const state = { ...base, template: tpl, duration };

  useEffect(() => {
    try {
      const { image, images, logo, ...texts } = content;
      localStorage.setItem(STORE, JSON.stringify({ tplId, format, content: texts, palette, font: fontName, durations }));
    } catch { /* stockage indisponible */ }
  }, [tplId, format, content, palette, fontName, durations]);

  useEffect(() => {
    FONTS.forEach((f) => document.fonts?.load(`700 40px "${f}"`).catch(() => {}));
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  function toast(msg, tone = "ok") {
    const id = Math.random();
    setToasts((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 5000);
  }

  const pilotUrl = import.meta.env.VITE_PILOTE_URL;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">▶</span>
          <span>Pilote <em>Motion</em></span>
        </div>
        <div className="seg formats">
          {Object.entries(FORMATS).map(([k, v]) => (
            <button key={k} className={format === k ? "on" : ""} onClick={() => setFormat(k)} title={v.label}>{k}</button>
          ))}
        </div>
        <div className="top-right">
          {pilotUrl && <a className="btn small ghost" href={pilotUrl}>← Pilote</a>}
          {supabase && (session
            ? <button className="btn small ghost" onClick={() => supabase.auth.signOut()} title={session.user.email}>Déconnexion</button>
            : <button className="btn small" onClick={() => setLogin(true)}>Connexion</button>)}
        </div>
      </header>

      <div className="work">
        <section className="preview">
          <Player state={state} format={format} />
          <div className="now">
            <strong>{tpl.name}</strong>
            <span className="muted">· {FORMATS[format].label}</span>
          </div>
          <ExportPanel state={state} format={format} audio={audio} caption={caption} setCaption={setCaption}
            needLogin={() => setLogin(true)} toast={toast} />
        </section>

        <aside className="panel">
          <nav className="tabs">
            {[["templates", "Modèles"], ["content", "Contenu"], ["style", "Style"]].map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>
          <div className="panel-body">
            {tab === "templates" && (
              <>
                <p className="muted small">Votre contenu, animé dans chaque modèle. Touchez celui qui vous plaît.</p>
                <Gallery base={base} format={format} current={tpl.id} durations={durations}
                  onPick={(id) => { setTplId(id); setTab("content"); }} />
              </>
            )}
            {tab === "content" && (
              <ContentEditor tpl={tpl} content={content} setContent={setContent} onCaption={setCaption}
                needLogin={() => setLogin(true)} toast={toast} />
            )}
            {tab === "style" && (
              <StyleEditor palette={palette} setPalette={setPalette} fontName={fontName} setFont={setFont}
                duration={duration} setDuration={(d) => setDurations({ ...durations, [tpl.id]: d })}
                audio={audio} setAudio={setAudio} />
            )}
          </div>
        </aside>
      </div>

      {login && supabase && <Login onClose={() => setLogin(false)} toast={toast} />}
      <div className="toaster">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.msg}</div>)}
      </div>
    </div>
  );
}
