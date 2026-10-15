import { useEffect, useRef } from "react";
import { renderFrame } from "../engine/engine.js";
import { getImg } from "../lib/images.js";

/**
 * Canvas animé. Sans `timeRef`, il boucle tout seul (vignettes de la galerie)
 * en marquant une pause sur l'image finale.
 */
export default function LiveCanvas({ state, width, height, timeRef, className }) {
  const ref = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let raf;
    const start = performance.now();
    let visible = true;
    let staticKey = null;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (ref.current) io.observe(ref.current);
    const loop = (now) => {
      const st = stateRef.current;
      const c = ref.current;
      if (c && !visible && staticKey !== st) {
        // Hors écran : on dessine une fois l'image finale, sans animer (économie de batterie)
        renderFrame(c.getContext("2d"), c.width, c.height, st.duration, st, getImg);
        staticKey = st;
      }
      if (c && visible) {
        staticKey = null;
        const t = timeRef
          ? timeRef.current
          : Math.min(((now - start) / 1000) % (st.duration + 1.5), st.duration);
        renderFrame(c.getContext("2d"), c.width, c.height, t, st, getImg);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [timeRef]);

  return <canvas ref={ref} width={width} height={height} className={className} />;
}
