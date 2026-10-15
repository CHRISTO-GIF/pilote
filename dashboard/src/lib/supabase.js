import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const APP_TZ = import.meta.env.VITE_TIMEZONE || "Africa/Ndjamena";

export function mediaUrl(path) {
  if (!path) return null;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

/** Appelle une Edge Function et remonte une erreur lisible. */
export async function callFn(name, body) {
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

export function fmtDate(ts) {
  return new Date(ts).toLocaleString("fr-FR", {
    timeZone: APP_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PLATFORMS = {
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    idLabel: "ID de la Page Facebook",
    idHelp: "Paramètres de la Page → Transparence, ou Meta Business Suite.",
    tokenHelp: "Jeton d'accès de la Page (longue durée, n'expire pas s'il vient d'un jeton utilisateur longue durée).",
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    idLabel: "ID du compte Instagram professionnel",
    idHelp: "Compte pro relié à une Page Facebook (Graph API : /{page-id}?fields=instagram_business_account).",
    tokenHelp: "Jeton de la Page Facebook reliée au compte Instagram.",
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    idLabel: "URN de l'auteur",
    idHelp: "urn:li:organization:123456 pour une page entreprise, urn:li:person:xxxx pour un profil.",
    tokenHelp: "Jeton OAuth LinkedIn (scope w_organization_social ou w_member_social). Expire après 60 jours.",
  },
  tiktok: {
    label: "TikTok",
    color: "#111111",
    idLabel: "Open ID TikTok",
    idHelp: "Renvoyé par TikTok lors de l'autorisation OAuth.",
    tokenHelp: "Jeton d'accès (24 h) + jeton de rafraîchissement : Pilote le renouvelle tout seul.",
  },
};

export const STATUS = {
  pending_approval: { label: "À valider", tone: "warn" },
  scheduled: { label: "Programmé", tone: "info" },
  publishing: { label: "En cours", tone: "info" },
  published: { label: "Publié", tone: "ok" },
  failed: { label: "Échec", tone: "bad" },
  cancelled: { label: "Annulé", tone: "muted" },
};

export const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
