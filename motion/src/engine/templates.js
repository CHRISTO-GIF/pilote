import {
  clamp, contain, cover, ctaPill, ease, fit, font, footer, lerp, readableOn, roundRect, seg, withAlpha,
} from "./engine.js";

// ---------------------------------------------------------------------------
// Champs partagés : le même contenu alimente tous les modèles
// ---------------------------------------------------------------------------
export const FIELDS = {
  titre: { label: "Titre", type: "text", max: 80 },
  sousTitre: { label: "Sous-titre", type: "textarea", max: 160 },
  cta: { label: "Appel à l'action", type: "text", max: 40, help: "Ex. Inscrivez-vous, Appelez-nous" },
  points: { label: "Points (un par ligne)", type: "textarea", max: 300 },
  chiffre: { label: "Chiffre", type: "text", max: 16, help: "Ex. -30%, 1 500, 98%" },
  chiffreLabel: { label: "Légende du chiffre", type: "text", max: 60 },
  date: { label: "Date", type: "date" },
  heure: { label: "Heure", type: "text", max: 20 },
  lieu: { label: "Lieu", type: "text", max: 60 },
  auteur: { label: "Auteur", type: "text", max: 50 },
  image: { label: "Image", type: "image" },
  images: { label: "Photos (jusqu'à 5)", type: "images" },
  logo: { label: "Logo", type: "image" },
  marque: { label: "Nom de la marque", type: "text", max: 40 },
  contact: { label: "Contact (tél., site)", type: "text", max: 40 },
};

export const DEFAULT_CONTENT = {
  titre: "Les inscriptions sont ouvertes",
  sousTitre: "Rentrée 2026-2027 : places limitées, réservez dès maintenant.",
  cta: "Inscrivez-vous",
  points: "Déposez votre dossier\nPassez le test d'entrée\nRecevez votre confirmation",
  chiffre: "98%",
  chiffreLabel: "de réussite au dernier examen",
  date: "2026-11-14",
  heure: "15 h 00",
  lieu: "Salle polyvalente, N'Djamena",
  auteur: "Proverbe africain",
  image: null,
  images: [],
  logo: null,
  marque: "Votre marque",
  contact: "+235 66 00 00 00",
};

// ---------------------------------------------------------------------------
// Éléments décoratifs
// ---------------------------------------------------------------------------
function blobs(ctx, s, opacity = 0.16) {
  const { t, W, H, p } = s;
  const pts = [
    [0.12, 0.16, 0.3, p.accent], [0.88, 0.82, 0.36, p.accent2],
    [0.92, 0.12, 0.15, p.accent2], [0.08, 0.88, 0.2, p.accent],
  ];
  const k = ease.outCubic(seg(t, 0, 1.2));
  pts.forEach(([x, y, r, col], i) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x * W + Math.sin(t * 0.7 + i) * 30, y * H + Math.cos(t * 0.5 + i * 2) * 30, r * Math.min(W, H) * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/** Position verticale (centre) du bouton d'action, au-dessus du bandeau contact. */
function ctaLine(s) {
  return s.portrait ? s.H - 270 : s.H - 236;
}

function bg(ctx, s, color) {
  ctx.fillStyle = color ?? s.p.bg;
  ctx.fillRect(0, 0, s.W, s.H);
}

function drawLines(ctx, lines, x, y, lh, align = "left") {
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return y + lines.length * lh;
}

/** Texte qui monte en fondu */
function rise(ctx, k, dy, fn) {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(k * 1.5);
  ctx.translate(0, (1 - ease.outCubic(k)) * dy);
  fn();
  ctx.restore();
}

function placeholder(ctx, s, x, y, w, h, label = "Ajoutez une image") {
  const { p, f, t } = s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = p.accent2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = withAlpha(readableOn(p.accent2), 0.12);
  ctx.lineWidth = 26;
  for (let i = -h; i < w + h; i += 80) {
    ctx.beginPath();
    ctx.moveTo(x + i + (t * 40) % 80, y);
    ctx.lineTo(x + i - h + (t * 40) % 80, y + h);
    ctx.stroke();
  }
  ctx.fillStyle = withAlpha(readableOn(p.accent2), 0.55);
  ctx.font = font(f, 36, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

const MONTHS = ["JANV.", "FÉVR.", "MARS", "AVR.", "MAI", "JUIN", "JUIL.", "AOÛT", "SEPT.", "OCT.", "NOV.", "DÉC."];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function parseNumber(str) {
  const m = String(str ?? "").match(/^(.*?)(-?\d[\d\s.,  ]*)(.*)$/);
  if (!m) return null;
  let raw = m[2].replace(/[\s  ]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  raw = raw.replace(",", ".");
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return null;
  const dec = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { prefix: m[1], value, dec, suffix: m[3] };
}

function fmtNumber(v, dec) {
  return v
    .toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    .replace(/[  ]/g, " ");
}

// ---------------------------------------------------------------------------
// Modèles
// ---------------------------------------------------------------------------
export const TEMPLATES = [
  {
    id: "kinetic",
    name: "Titre choc",
    desc: "Les mots claquent un par un",
    duration: 6,
    fields: ["titre", "sousTitre", "cta", "marque", "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      bg(ctx, s);
      blobs(ctx, s);
      const maxW = W - 160;
      const box = s.portrait ? H * 0.34 : H * 0.3;
      const { lines, size, lh } = fit(ctx, (c.titre || "").toUpperCase(), f, maxW, box, { max: 170, min: 44, weight: 800, lh: 1.04 });
      const subH = c.sousTitre ? 150 : 0;
      const y0 = H / 2 - (lines.length * lh + subH) / 2 - (s.portrait ? 100 : 40);
      let wi = 0;
      ctx.textBaseline = "top";
      lines.forEach((line, li) => {
        ctx.font = font(f, size, 800);
        const space = ctx.measureText(" ").width;
        let x = (W - ctx.measureText(line).width) / 2;
        const y = y0 + li * lh;
        for (const w of line.split(" ")) {
          ctx.font = font(f, size, 800);
          const ww = ctx.measureText(w).width;
          const k = seg(t, 0.2 + wi * 0.15, 0.45);
          if (k > 0) {
            ctx.save();
            ctx.translate(x + ww / 2, y + size / 2);
            const sc = lerp(1.7, 1, ease.outBack(k));
            ctx.scale(sc, sc);
            ctx.globalAlpha = clamp(k * 2.5);
            ctx.fillStyle = wi % 3 === 1 ? p.accent : p.fg;
            ctx.textAlign = "center";
            ctx.fillText(w, 0, -size / 2);
            ctx.restore();
          }
          x += ww + space;
          wi++;
        }
      });
      const after = 0.2 + wi * 0.15 + 0.25;
      const yEnd = y0 + lines.length * lh;
      // trait d'accent
      const kb = ease.outExpo(seg(t, after - 0.1, 0.6));
      ctx.fillStyle = p.accent;
      roundRect(ctx, W / 2 - 110 * kb, yEnd + 24, 220 * kb, 14, 7);
      ctx.fill();
      // sous-titre
      rise(ctx, seg(t, after, 0.6), 40, () => {
        const sub = fit(ctx, c.sousTitre || "", f, maxW - 60, 120, { max: 48, min: 28, weight: 500 });
        ctx.fillStyle = withAlpha(p.fg, 0.82);
        drawLines(ctx, sub.lines, W / 2, yEnd + 70, sub.lh, "center");
      });
      ctaPill(ctx, s, c.cta, W / 2, Math.min(yEnd + subH + 150, ctaLine(s)), seg(t, after + 0.5, 0.6), t);
      footer(ctx, s, t, after + 0.8);
    },
  },

  {
    id: "promo",
    name: "Offre promo",
    desc: "Photo, badge chiffre et appel à l'action",
    duration: 7,
    fields: ["image", ["chiffre", "Réduction ou prix"], "titre", "sousTitre", "cta", "marque", "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      bg(ctx, s);
      let r, tx;
      const ctaY = ctaLine(s);
      if (s.landscape) {
        r = { x: 0, y: 0, w: W * 0.5, h: H };
        tx = { x: W * 0.5 + 90, y: 150, w: W * 0.5 - 180, h: ctaY - 80 - 150 };
      } else {
        const ih = s.portrait ? H * 0.5 : H * 0.42;
        r = { x: 0, y: 0, w: W, h: ih };
        tx = { x: 80, y: ih + (s.portrait ? 110 : 90), w: W - 160 };
        tx.h = ctaY - 75 - tx.y;
      }
      // révélation diagonale de l'image
      const kr = ease.inOutCubic(seg(t, 0, 0.9));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + (r.w + r.h) * kr, r.y);
      ctx.lineTo(r.x + (r.w + r.h) * kr - r.h, r.y + r.h);
      ctx.lineTo(r.x, r.y + r.h);
      ctx.closePath();
      ctx.clip();
      const zoom = lerp(1.18, 1.02, ease.outCubic(seg(t, 0, 5)));
      if (!cover(ctx, s.img(c.image), r.x, r.y, r.w, r.h, zoom)) placeholder(ctx, s, r.x, r.y, r.w, r.h);
      ctx.restore();
      // badge
      if (c.chiffre) {
        const kb = seg(t, 0.8, 0.7);
        if (kb > 0) {
          const R = s.portrait ? 165 : 140;
          const bx = s.landscape ? W * 0.5 - R - 50 : W - 200, by = s.landscape ? H * 0.42 : r.h - R * 0.45;
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(lerp(-0.7, -0.12, ease.outCubic(kb)) + Math.sin(t * 2) * 0.02);
          ctx.scale(ease.outBack(kb), ease.outBack(kb));
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          for (let i = 0; i < 40; i++) {
            const a = (i / 40) * Math.PI * 2, rr = i % 2 ? R : R * 0.9;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = readableOn(p.accent);
          const n = fit(ctx, c.chiffre, f, R * 1.45, R * 1.0, { max: 120, min: 36, weight: 800, lh: 1 });
          drawLines(ctx, n.lines, 0, -(n.lines.length * n.lh) / 2 + 6, n.lh, "center");
          ctx.restore();
        }
      }
      // textes (mise en page calculée avant l'animation pour éviter tout chevauchement)
      const ti = fit(ctx, c.titre || "", f, tx.w, tx.h * 0.62, { max: 110, min: 40, weight: 800 });
      const subY = tx.y + ti.lines.length * ti.lh + 22;
      const sub = fit(ctx, c.sousTitre || "", f, tx.w, Math.max(tx.y + tx.h - subY, 30), { max: 46, min: 24, weight: 500 });
      rise(ctx, seg(t, 0.9, 0.6), 50, () => {
        ctx.font = font(f, ti.size, 800);
        ctx.fillStyle = p.fg;
        drawLines(ctx, ti.lines, tx.x, tx.y, ti.lh);
      });
      rise(ctx, seg(t, 1.3, 0.6), 40, () => {
        ctx.font = font(f, sub.size, 500);
        ctx.fillStyle = withAlpha(p.fg, 0.78);
        drawLines(ctx, sub.lines, tx.x, subY, sub.lh);
      });
      ctaPill(ctx, s, c.cta, s.landscape ? W * 0.75 : W / 2, ctaY, seg(t, 1.8, 0.6), t);
      footer(ctx, s, t, 2.2);
    },
  },

  {
    id: "event",
    name: "Événement",
    desc: "Date, heure, lieu — idéal pour une invitation",
    duration: 7,
    fields: ["titre", "date", "heure", "lieu", "sousTitre", "cta", "marque", "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      bg(ctx, s);
      // bande d'accent qui glisse
      const kb = ease.outExpo(seg(t, 0, 0.9));
      ctx.fillStyle = p.accent;
      const split = !s.portrait; // carré et paysage : bande à gauche, textes à droite
      const bandH = split ? H : H * 0.36;
      const bandW = split ? W * 0.36 : W;
      ctx.fillRect(0, 0, bandW * (split ? 1 : kb), bandH * (split ? kb : 1));
      blobs(ctx, s, 0.08);
      // carte date
      const d = c.date ? new Date(c.date + "T12:00:00") : null;
      const valid = d && !isNaN(d);
      const cw = split && !s.landscape ? 300 : 340, ch = split && !s.landscape ? 340 : 380;
      const cx = split ? bandW / 2 : W / 2;
      const cy = split ? H / 2 - 40 : bandH;
      const kc = seg(t, 0.4, 0.7);
      if (kc > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(lerp(0.25, -0.04, ease.outBack(kc)));
        ctx.scale(ease.outBack(kc), ease.outBack(kc));
        ctx.fillStyle = withAlpha("#000000", 0.15);
        roundRect(ctx, -cw / 2 + 14, -ch / 2 + 18, cw, ch, 36);
        ctx.fill();
        ctx.fillStyle = p.fg;
        roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 36);
        ctx.fill();
        ctx.fillStyle = p.accent2;
        roundRect(ctx, -cw / 2, -ch / 2, cw, 90, 36);
        ctx.fill();
        ctx.fillRect(-cw / 2, -ch / 2 + 50, cw, 40);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = readableOn(p.accent2);
        ctx.font = font(f, 44, 800);
        ctx.fillText(valid ? MONTHS[d.getMonth()] : "DATE", 0, -ch / 2 + 48);
        ctx.fillStyle = p.bg;
        ctx.font = font(f, 170, 800);
        ctx.fillText(valid ? String(d.getDate()) : "--", 0, 30);
        ctx.font = font(f, 38, 500);
        ctx.fillStyle = withAlpha(p.bg, 0.8);
        ctx.fillText(valid ? DAYS[d.getDay()] : "", 0, ch / 2 - 50);
        ctx.restore();
      }
      // titre et infos
      const area = split
        ? { x: bandW + 70, y: 130, w: W - bandW - 140 }
        : { x: 90, y: bandH + ch / 2 + 70, w: W - 180 };
      const ti = fit(ctx, c.titre || "", f, area.w, s.portrait ? 360 : 300, { max: 100, min: 38, weight: 800 });
      let y = area.y + ti.lines.length * ti.lh;
      rise(ctx, seg(t, 1.0, 0.6), 50, () => {
        ctx.font = font(f, ti.size, 800);
        ctx.fillStyle = p.fg;
        drawLines(ctx, ti.lines, area.x, area.y, ti.lh);
      });
      const infos = [
        c.heure && ["Heure", c.heure],
        c.lieu && ["Lieu", c.lieu],
      ].filter(Boolean);
      y += 40;
      infos.forEach(([lab, val], i) => {
        const k = seg(t, 1.5 + i * 0.3, 0.5);
        if (k <= 0) return;
        ctx.save();
        ctx.globalAlpha = clamp(k * 1.5);
        ctx.translate((1 - ease.outCubic(k)) * 80, 0);
        ctx.fillStyle = p.accent;
        roundRect(ctx, area.x, y + i * 90 + 8, 14, 56, 7);
        ctx.fill();
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = font(f, 30, 600);
        ctx.fillStyle = withAlpha(p.fg, 0.6);
        ctx.fillText(lab.toUpperCase(), area.x + 36, y + i * 90, area.w - 40);
        ctx.font = font(f, 40, 600);
        ctx.fillStyle = p.fg;
        ctx.fillText(val, area.x + 36, y + i * 90 + 32, area.w - 40);
        ctx.restore();
      });
      y += infos.length * 90 + 20;
      const space = ctaLine(s) - 80 - y;
      if (c.sousTitre && space > 70) {
        rise(ctx, seg(t, 2.1, 0.5), 30, () => {
          const sub = fit(ctx, c.sousTitre, f, area.w, space, { max: 40, min: 24, weight: 500 });
          if (sub.lines.length * sub.lh > space) return;
          ctx.fillStyle = withAlpha(p.fg, 0.75);
          drawLines(ctx, sub.lines, area.x, y, sub.lh);
        });
      }
      ctaPill(ctx, s, c.cta, split ? area.x + area.w / 2 : W / 2, ctaLine(s), seg(t, 2.4, 0.6), t);
      footer(ctx, s, t, 2.8);
    },
  },

  {
    id: "quote",
    name: "Citation",
    desc: "Citation, verset ou témoignage révélé ligne par ligne",
    duration: 7,
    fields: [["titre", "Citation"], "auteur", "marque", "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, p.bg);
      g.addColorStop(1, withAlpha(p.accent2, 0.35));
      bg(ctx, s);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const q = fit(ctx, c.titre || "", f, W - 220, s.portrait ? H * 0.42 : H * 0.42, { max: 88, min: 34, weight: 600, lh: 1.25 });
      const blockH = q.lines.length * q.lh;
      const y0 = H / 2 - blockH / 2 + (s.portrait ? 0 : 20);
      // guillemet
      const kq = seg(t, 0, 0.8);
      ctx.save();
      ctx.globalAlpha = 0.9 * clamp(kq * 2);
      ctx.fillStyle = p.accent;
      ctx.font = font("Georgia", 380, 700);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.translate(100, y0 - 40);
      ctx.scale(ease.outBack(kq), ease.outBack(kq));
      ctx.fillText("“", -20, 150);
      ctx.restore();
      // lignes révélées
      ctx.font = font(f, q.size, 600);
      q.lines.forEach((line, i) => {
        const k = ease.outCubic(seg(t, 0.6 + i * 0.35, 0.7));
        if (k <= 0) return;
        const y = y0 + i * q.lh;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y - 10, 110 + (W - 200) * k, q.lh + 20);
        ctx.clip();
        ctx.fillStyle = p.fg;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(line, 110, y + (1 - k) * 20);
        ctx.restore();
      });
      const after = 0.6 + q.lines.length * 0.35 + 0.4;
      const kl = ease.outExpo(seg(t, after, 0.7));
      ctx.fillStyle = p.accent;
      ctx.fillRect(110, y0 + blockH + 50, 140 * kl, 8);
      rise(ctx, seg(t, after + 0.2, 0.6), 20, () => {
        ctx.font = font(f, 42, 700);
        ctx.fillStyle = withAlpha(p.fg, 0.85);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        if (c.auteur) ctx.fillText("— " + c.auteur, 110, y0 + blockH + 90, W - 220);
      });
      footer(ctx, s, t, after + 0.6);
    },
  },

  {
    id: "steps",
    name: "Étapes / conseils",
    desc: "Liste numérotée qui apparaît point par point",
    duration: 8,
    fields: ["titre", "points", "cta", "marque", "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      bg(ctx, s);
      blobs(ctx, s, 0.1);
      const items = String(c.points || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5);
      const top = s.portrait ? 200 : 110;
      let y = top;
      rise(ctx, seg(t, 0.1, 0.6), 40, () => {
        const ti = fit(ctx, c.titre || "", f, W - 180, s.portrait ? 340 : 200, { max: 100, min: 40, weight: 800 });
        ctx.fillStyle = p.fg;
        y = drawLines(ctx, ti.lines, 90, top, ti.lh);
      });
      if (y === top) {
        const ti = fit(ctx, c.titre || "", f, W - 180, s.portrait ? 340 : 200, { max: 100, min: 40, weight: 800 });
        y = top + ti.lines.length * ti.lh;
      }
      const kbar = ease.outExpo(seg(t, 0.4, 0.6));
      ctx.fillStyle = p.accent;
      ctx.fillRect(90, y + 24, 160 * kbar, 10);
      const areaTop = y + 80;
      const areaBottom = c.cta ? ctaLine(s) - 80 : H - 180;
      const n = Math.max(items.length, 1);
      const rowH = Math.min(240, (areaBottom - areaTop) / n);
      const step = (s.landscape ? 4.2 : 4.6) / n;
      items.forEach((it, i) => {
        const k = seg(t, 0.8 + i * step, 0.55);
        if (k <= 0) return;
        const ry = areaTop + i * rowH;
        const R = Math.min(52, rowH * 0.3);
        ctx.save();
        ctx.globalAlpha = clamp(k * 1.5);
        ctx.translate((1 - ease.outCubic(k)) * 120, 0);
        ctx.fillStyle = i % 2 ? p.accent2 : p.accent;
        ctx.beginPath();
        ctx.arc(90 + R, ry + rowH / 2, R * ease.outBack(k), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = readableOn(i % 2 ? p.accent2 : p.accent);
        ctx.font = font(f, R * 1.05, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), 90 + R, ry + rowH / 2 + 3);
        const tx = fit(ctx, it, f, W - 90 - R * 2 - 130, rowH * 0.85, { max: 52, min: 26, weight: 600, lh: 1.15 });
        ctx.fillStyle = p.fg;
        drawLines(ctx, tx.lines, 90 + R * 2 + 40, ry + rowH / 2 - (tx.lines.length * tx.lh) / 2, tx.lh);
        ctx.restore();
      });
      const end = 0.8 + n * step;
      ctaPill(ctx, s, c.cta, W / 2, ctaLine(s), seg(t, Math.min(end, 6.4), 0.6), t);
      footer(ctx, s, t, Math.min(end + 0.3, 6.8));
    },
  },

  {
    id: "stat",
    name: "Chiffre clé",
    desc: "Un nombre qui compte jusqu'à la valeur",
    duration: 6,
    fields: [["titre", "Titre (au-dessus)"], "chiffre", "chiffreLabel", "marque", "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      bg(ctx, s);
      blobs(ctx, s, 0.1);
      const R = Math.min(W, H) * (s.portrait ? 0.34 : s.landscape ? 0.27 : 0.22);
      const cx = s.landscape ? W * 0.32 : W / 2;
      const cy = s.landscape ? H / 2 + 20 : s.portrait ? H / 2 - 20 : H / 2 + 10;
      // titre
      rise(ctx, seg(t, 0, 0.6), 40, () => {
        const area = s.landscape ? { x: W * 0.6, y: 220, w: W * 0.34 } : { x: 90, y: s.portrait ? 200 : 70, w: W - 180 };
        const ti = fit(ctx, c.titre || "", f, area.w, s.portrait ? 300 : 170, { max: 84, min: 36, weight: 800 });
        ctx.fillStyle = p.fg;
        drawLines(ctx, ti.lines, s.landscape ? area.x : W / 2, area.y, ti.lh, s.landscape ? "left" : "center");
      });
      // anneau
      const kr = ease.inOutCubic(seg(t, 0.4, 2.4));
      ctx.lineCap = "round";
      ctx.lineWidth = 34;
      ctx.strokeStyle = withAlpha(p.fg, 0.1);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = p.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.999 * kr);
      if (kr > 0) ctx.stroke();
      // nombre
      const num = parseNumber(c.chiffre);
      const kn = ease.outExpo(seg(t, 0.4, 2.4));
      const txt = num ? `${num.prefix}${fmtNumber(num.value * kn, num.dec)}${num.suffix}` : String(c.chiffre || "");
      const final = num ? `${num.prefix}${fmtNumber(num.value, num.dec)}${num.suffix}` : txt;
      const sz = fit(ctx, final, f, R * 1.55, R * 0.9, { max: 230, min: 50, weight: 800, lh: 1 }).size;
      ctx.save();
      ctx.globalAlpha = clamp(seg(t, 0.3, 0.4) * 2);
      ctx.font = font(f, sz, 800);
      ctx.fillStyle = p.fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pop = 1 + Math.sin(clamp((t - 2.8) / 0.4) * Math.PI) * 0.06;
      ctx.translate(cx, cy + 8);
      ctx.scale(pop, pop);
      ctx.fillText(txt, 0, 0);
      ctx.restore();
      // légende
      rise(ctx, seg(t, 2.6, 0.6), 30, () => {
        const area = s.landscape ? { x: W * 0.6, w: W * 0.34, y: H / 2 + 20 } : { x: W / 2, w: W - 200, y: cy + R + 50 };
        const room = s.landscape ? 200 : Math.min(170, H - 170 - area.y);
        const lb = fit(ctx, c.chiffreLabel || "", f, area.w, room, { max: 52, min: 26, weight: 600 });
        ctx.fillStyle = withAlpha(p.fg, 0.8);
        drawLines(ctx, lb.lines, area.x, area.y, lb.lh, s.landscape ? "left" : "center");
      });
      footer(ctx, s, t, 3.1);
    },
  },

  {
    id: "slideshow",
    name: "Diaporama photos",
    desc: "Vos photos en mouvement + carte de fin",
    duration: 9,
    fields: ["images", "titre", "sousTitre", "cta", "marque", "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      bg(ctx, s, "#000");
      const imgs = (c.images?.length ? c.images : c.image ? [c.image] : []).map((u) => s.img(u)).filter(Boolean);
      const endStart = 7;
      const n = Math.max(imgs.length, 1);
      const per = endStart / n;
      const idx = Math.min(Math.floor(t / per), n - 1);
      const drawSlide = (i, alpha) => {
        const local = clamp((t - i * per) / (per + 0.6));
        const zoom = lerp(1.04, 1.18, local);
        const dx = (i % 2 ? -1 : 1) * lerp(-0.03, 0.03, local);
        ctx.save();
        ctx.globalAlpha = alpha;
        if (!cover(ctx, imgs[i], 0, 0, W, H, zoom, dx, 0)) placeholder(ctx, s, 0, 0, W, H, "Ajoutez des photos");
        ctx.restore();
      };
      drawSlide(idx, 1);
      const fadeIn = clamp((t - (idx + 1) * per + 0.6) / 0.6);
      if (idx + 1 < n && fadeIn > 0) drawSlide(idx + 1, ease.inOutCubic(fadeIn));
      // dégradé + titre en bas
      const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.78)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.45, W, H * 0.55);
      rise(ctx, seg(t, 0.3, 0.7), 50, () => {
        const ti = fit(ctx, c.titre || "", f, W - 180, s.portrait ? 340 : 220, { max: 96, min: 38, weight: 800 });
        const sub = fit(ctx, c.sousTitre || "", f, W - 180, 130, { max: 42, min: 26, weight: 500 });
        const yb = H - (s.portrait ? 300 : 120) - sub.lines.length * sub.lh - 20;
        ctx.font = font(f, ti.size, 800);
        ctx.fillStyle = "#ffffff";
        drawLines(ctx, ti.lines, 90, yb - ti.lines.length * ti.lh, ti.lh);
        ctx.font = font(f, sub.size, 500);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        drawLines(ctx, sub.lines, 90, yb + 16, sub.lh);
        ctx.fillStyle = p.accent;
        ctx.fillRect(90, yb - ti.lines.length * ti.lh - 34, 120, 10);
      });
      // barre de progression des photos
      for (let i = 0; i < n; i++) {
        const w = (W - 180 - (n - 1) * 12) / n;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        roundRect(ctx, 90 + i * (w + 12), 70, w, 8, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        roundRect(ctx, 90 + i * (w + 12), 70, w * clamp((t - i * per) / per), 8, 4);
        ctx.fill();
      }
      // carte de fin
      const ke = ease.inOutCubic(seg(t, endStart, 0.6));
      if (ke > 0) {
        ctx.save();
        ctx.globalAlpha = ke;
        bg(ctx, s);
        blobs(ctx, { ...s, t: t - endStart + 1.2 }, 0.14);
        const ti = fit(ctx, c.titre || "", f, W - 200, H * 0.3, { max: 110, min: 40, weight: 800 });
        ctx.fillStyle = p.fg;
        drawLines(ctx, ti.lines, W / 2, H / 2 - ti.lines.length * ti.lh / 2 - 90, ti.lh, "center");
        ctx.restore();
        ctaPill(ctx, s, c.cta, W / 2, H / 2 + ti.lines.length * ti.lh / 2 + 40, seg(t, endStart + 0.3, 0.6), t);
        footer(ctx, s, t, endStart + 0.5);
      }
    },
  },

  {
    id: "logo",
    name: "Logo animé",
    desc: "Révélation du logo, de la marque et du slogan",
    duration: 5,
    fields: ["logo", "marque", ["sousTitre", "Slogan"], "contact"],
    draw(ctx, s) {
      const { t, W, H, p, f, c } = s;
      bg(ctx, s);
      const cx = W / 2, cy = H / 2 - (s.portrait ? 120 : 110);
      const big = Math.hypot(W, H);
      // vagues de couleur
      const k1 = ease.inOutCubic(seg(t, 0, 0.9));
      const k2 = ease.inOutCubic(seg(t, 0.35, 0.9));
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, big * k1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.bg;
      ctx.beginPath();
      ctx.arc(cx, cy, big * k2, 0, Math.PI * 2);
      ctx.fill();
      // anneaux qui tournent
      const ka = seg(t, 0.9, 0.6);
      const R = s.portrait ? 230 : 175;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.8);
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.strokeStyle = p.accent;
      ctx.globalAlpha = clamp(ka * 2);
      ctx.beginPath();
      ctx.arc(0, 0, R * ease.outBack(ka), 0, Math.PI * 1.2);
      ctx.stroke();
      ctx.strokeStyle = p.accent2;
      ctx.beginPath();
      ctx.arc(0, 0, (R + 30) * ease.outBack(ka), Math.PI, Math.PI * 1.9);
      ctx.stroke();
      ctx.restore();
      // logo
      const kl = seg(t, 1.0, 0.7);
      if (kl > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(ease.outBack(kl), ease.outBack(kl));
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, R - 30, 0, Math.PI * 2);
        ctx.fill();
        const logo = s.img(c.logo);
        if (!contain(ctx, logo, 0, 0, (R - 30) * 1.3, (R - 30) * 1.3)) {
          ctx.fillStyle = p.accent;
          ctx.font = font(f, 200, 800);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((c.marque || "?").trim().charAt(0).toUpperCase(), 0, 10);
        }
        ctx.restore();
      }
      // marque avec espacement qui se resserre
      const km = seg(t, 1.6, 0.8);
      if (km > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(km * 1.6);
        const sp = lerp(40, 6, ease.outCubic(km));
        if ("letterSpacing" in ctx) ctx.letterSpacing = `${sp}px`;
        const m = fit(ctx, (c.marque || "").toUpperCase(), f, W - 160, 150, { max: 96, min: 36, weight: 800, lh: 1 });
        ctx.fillStyle = p.fg;
        drawLines(ctx, m.lines, cx, cy + R + 60, m.lh, "center");
        ctx.restore();
      }
      rise(ctx, seg(t, 2.3, 0.6), 30, () => {
        const sy = cy + R + (s.portrait ? 190 : 165);
        const sl = fit(ctx, c.sousTitre || "", f, W - 220, Math.min(130, H - 175 - sy), { max: 46, min: 24, weight: 500 });
        ctx.fillStyle = withAlpha(p.fg, 0.75);
        drawLines(ctx, sl.lines, cx, sy, sl.lh, "center");
      });
      footer(ctx, { ...s, c: { ...c, marque: "" } }, t, 2.8);
    },
  },
];

export const PALETTES = [
  { name: "Sahel", bg: "#F4E9D8", fg: "#2B1D14", accent: "#C8551B", accent2: "#1F6F5C" },
  { name: "Nuit", bg: "#10131C", fg: "#F5F3EE", accent: "#F2B33D", accent2: "#4F7CFF" },
  { name: "Royal", bg: "#1D1A4D", fg: "#FFFFFF", accent: "#FFC93C", accent2: "#E4572E" },
  { name: "Frais", bg: "#E9F5EE", fg: "#0E3B2E", accent: "#17A673", accent2: "#F28C28" },
  { name: "Corail", bg: "#FFF4EF", fg: "#2A1E2F", accent: "#FF5D4E", accent2: "#2E86AB" },
  { name: "École", bg: "#FFFFFF", fg: "#13294B", accent: "#1C5DBA", accent2: "#E5B81F" },
  { name: "Ébène", bg: "#0B0B0B", fg: "#FFFFFF", accent: "#E63946", accent2: "#F1FAEE" },
];

export const FONTS = ["Bricolage Grotesque", "Montserrat", "Poppins", "Playfair Display", "Bebas Neue"];

export function fieldList(tpl) {
  return tpl.fields.map((x) => (Array.isArray(x) ? { key: x[0], ...FIELDS[x[0]], label: x[1] } : { key: x, ...FIELDS[x] }));
}
