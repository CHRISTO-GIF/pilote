import { renderFrame } from "./engine.js";

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01F",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/**
 * Enregistre la vidéo en temps réel depuis un canvas plein format.
 * @returns {Promise<{blob: Blob, mime: string, ext: string}>}
 */
export async function exportVideo({ width, height, state, getImg, audioFile, fps = 30, onProgress }) {
  const mime = pickMime();
  if (!mime) throw new Error("Votre navigateur ne sait pas enregistrer de vidéo. Utilisez Chrome, Edge ou Safari récent.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  renderFrame(ctx, width, height, 0, state, getImg);

  const stream = canvas.captureStream(fps);
  let audioCtx, audioEl;
  if (audioFile) {
    audioCtx = new AudioContext();
    audioEl = new Audio(URL.createObjectURL(audioFile));
    audioEl.crossOrigin = "anonymous";
    const src = audioCtx.createMediaElementSource(audioEl);
    const gain = audioCtx.createGain();
    const dest = audioCtx.createMediaStreamDestination();
    src.connect(gain).connect(dest);
    // fondu de sortie sur la dernière seconde
    gain.gain.setValueAtTime(1, audioCtx.currentTime + Math.max(0, state.duration - 1));
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + state.duration);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }

  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));

  rec.start(250);
  if (audioEl) await audioEl.play().catch(() => {});
  const t0 = performance.now();

  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      renderFrame(ctx, width, height, Math.min(t, state.duration), state, getImg);
      onProgress?.(Math.min(t / state.duration, 1));
      if (t < state.duration + 0.25) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  rec.stop();
  await done;
  audioEl?.pause();
  audioCtx?.close();
  stream.getTracks().forEach((tr) => tr.stop());

  const type = mime.split(";")[0];
  return { blob: new Blob(chunks, { type }), mime: type, ext: type === "video/mp4" ? "mp4" : "webm" };
}

/** Image PNG de la dernière image (vignette / visuel fixe). */
export async function exportPoster({ width, height, state, getImg, at }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  renderFrame(canvas.getContext("2d"), width, height, at ?? state.duration, state, getImg);
  return await new Promise((res) => canvas.toBlob(res, "image/png"));
}
