import { useEffect, useRef, useState } from "react";
import LiveCanvas from "./LiveCanvas.jsx";
import { FORMATS } from "../engine/engine.js";

export default function Player({ state, format }) {
  const timeRef = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const playRef = useRef(playing);
  playRef.current = playing;
  const durRef = useRef(state.duration);
  durRef.current = state.duration;

  useEffect(() => {
    let raf, last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playRef.current) {
        let nt = timeRef.current + dt;
        if (nt > durRef.current + 1.2) nt = 0; // petite pause sur l'image finale puis boucle
        timeRef.current = nt;
        setT(Math.min(nt, durRef.current));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Rejouer depuis le début quand on change de modèle
  useEffect(() => {
    timeRef.current = 0;
    setPlaying(true);
  }, [state.template.id, format]);

  const F = FORMATS[format];
  const scale = 540 / Math.min(F.w, F.h);

  return (
    <div className="player">
      <div className={`stage f${format.replace(":", "x")}`}>
        <LiveCanvas state={state} width={Math.round(F.w * scale)} height={Math.round(F.h * scale)} timeRef={timeRef} className="stage-canvas" />
      </div>
      <div className="transport">
        <button className="round" onClick={() => {
          if (!playing && timeRef.current >= state.duration) timeRef.current = 0;
          setPlaying(!playing);
        }} aria-label={playing ? "Pause" : "Lecture"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <input type="range" min="0" max={state.duration} step="0.01" value={t}
          onChange={(e) => {
            setPlaying(false);
            timeRef.current = Number(e.target.value);
            setT(Number(e.target.value));
          }} />
        <span className="time">{t.toFixed(1)} / {state.duration.toFixed(0)} s</span>
      </div>
    </div>
  );
}
