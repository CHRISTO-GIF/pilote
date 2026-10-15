import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** null si Supabase n'est pas configuré : l'app fonctionne alors en mode « téléchargement seul ». */
export const supabase = url && key ? createClient(url, key) : null;

export async function callFn(name, body) {
  if (!supabase) throw new Error("Supabase n'est pas configuré (fichier .env).");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Dépose la vidéo dans la bibliothèque de Pilote. */
export async function sendToPilote({ blob, ext, mime, title, body, tags }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Connectez-vous d'abord.");
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("media").upload(path, blob, { contentType: mime });
  if (up.error) throw up.error;
  const { error } = await supabase.from("content_items").insert({
    title, body, tags, media_path: path, media_type: "video",
  });
  if (error) {
    await supabase.storage.from("media").remove([path]);
    throw error;
  }
}
