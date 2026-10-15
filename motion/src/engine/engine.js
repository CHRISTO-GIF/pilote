// Moteur d'animation : utilitaires de dessin et rendu d'une image à l'instant t.
// Tous les modèles dessinent dans un repère logique où le plus petit côté vaut 1080.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Progression 0→1 d'un segment qui commence à `start` et dure `dur` secondes. */
export const seg = (t, start, dur) => clamp((t - start) / dur);

export const ease = {
  linear: (x) => x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inCubic: (x) => x * x * x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  outElastic: (x) => {
    if (x === 0 || x === 1) return x;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

export const FORMATS = {
  "9:16": { label: "Story / Reel / TikTok", w: 1080, h: 1920 },
  "1:1": { label: "Carré (fil d'actualité)", w: 1080, h: 1080 },
  "16:9": { label: "Paysage (YouTube, Facebook)", w: 1920, h: 1080 },
};

export function font(f, size, weight = 700) {
  return `${weight} ${Math.round(size)}px "${f}", system-ui, sans-serif`;
}

export function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Découpe un texte en lignes qui tiennent dans maxW. */
export function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text ?? "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Cherche la plus grande taille de police pour que le texte tienne dans la boîte. */
export function fit(ctx, text, family, maxW, maxH, { max = 140, min = 28, weight = 700, lh = 1.12 } = {}) {
  let size = max;
  let lines = [];
  while (size >= min) {
    ctx.font = font(family, size, weight);
    lines = wrap(ctx, text, maxW);
    if (lines.length * size * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
    size -= 4;
  }
  ctx.font = font(family, size, weight);
  return { lines, size, lh: size * lh };
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Image en mode "cover" avec zoom et décalage (effet Ken Burns). */
export function cover(ctx, img, x, y, w, h, zoom = 1, dx = 0, dy = 0) {
  if (!img || !img.naturalWidth) return false;
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2 + dx * w, y + (h - ih) / 2 + dy * h, iw, ih);
  ctx.restore();
  return true;
}

/** Image entière dans une boîte (logos). */
export function contain(ctx, img, cx, cy, maxW, maxH) {
  if (!img || !img.naturalWidth) return false;
  const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  ctx.drawImage(img, cx - (img.naturalWidth * s) / 2, cy - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return true;
}

/** Bandeau marque + contact en bas de l'écran, commun à tous les modèles. */
export function footer(ctx, s, t, appear = 0.6) {
  const { c, p, f, W, H } = s;
  const txt = [c.marque, c.contact].filter(Boolean).join("  ·  ");
  if (!txt) return;
  const k = ease.outCubic(seg(t, appear, 0.6));
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.font = font(f, 34, 600);
  const tw = Math.min(ctx.measureText(txt).width, W - 160);
  const bw = tw + 72, bh = 76;
  const x = (W - bw) / 2, y = H - 70 - bh + (1 - k) * 40;
  ctx.fillStyle = withAlpha(p.fg, 0.92);
  roundRect(ctx, x, y, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = p.bg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt, W / 2, y + bh / 2 + 2, W - 200);
  ctx.restore();
}

/** Bouton d'appel à l'action (pilule) avec légère pulsation. */
export function ctaPill(ctx, s, text, cx, cy, k, t) {
  if (!text || k <= 0) return;
  const { p, f } = s;
  ctx.save();
  ctx.font = font(f, 44, 700);
  const w = Math.min(ctx.measureText(text).width + 100, s.W - 120), h = 100;
  const pulse = 1 + Math.sin(t * 4) * 0.02 * k;
  ctx.translate(cx, cy);
  ctx.scale(ease.outBack(k) * pulse, ease.outBack(k) * pulse);
  ctx.globalAlpha = clamp(k * 2);
  ctx.fillStyle = p.accent;
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = readableOn(p.accent);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 4, w - 60);
  ctx.restore();
}

/** Noir ou blanc selon la luminosité du fond. */
export function readableOn(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111111" : "#ffffff";
}

/**
 * Dessine l'image du modèle à l'instant `t` (secondes réelles de la vidéo).
 * `state` = { template, content, palette, font, duration }, `getImg(url)` renvoie une image chargée.
 */
export function renderFrame(ctx, pixelW, pixelH, t, state, getImg) {
  const tpl = state.template;
  const scale = Math.min(pixelW, pixelH) / 1080;
  const W = pixelW / scale, H = pixelH / scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
  // Le temps est ramené à la durée de base du modèle (la durée choisie étire ou accélère l'animation)
  const tt = clamp(t, 0, state.duration) * (tpl.duration / state.duration);
  tpl.draw(ctx, {
    t: tt,
    W,
    H,
    portrait: H > W * 1.2,
    landscape: W > H * 1.2,
    c: state.content,
    p: state.palette,
    f: state.font,
    img: (url) => (url ? getImg(url) : null),
  });
}
