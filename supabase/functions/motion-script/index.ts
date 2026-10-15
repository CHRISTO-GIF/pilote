// Pilote Motion : l'IA rédige les textes courts d'une vidéo animée + la légende de publication.
import { identify } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { audienceLine, callClaude } from "../_shared/ai.ts";

type FieldSpec = { key: string; label: string; type: string; max?: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identify(req);
  if (!caller || caller.kind !== "user") return json({ error: "Non autorisé" }, 401);

  const b = await req.json().catch(() => ({}));
  const brief = String(b.brief ?? "").slice(0, 2000).trim();
  const fields: FieldSpec[] = Array.isArray(b.fields) ? b.fields.slice(0, 20) : [];
  if (!brief || !fields.length) return json({ error: "Brief ou champs manquants" }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const spec = fields
    .map((f) => {
      const hint = f.type === "date"
        ? "date au format AAAA-MM-JJ (vide si aucune date n'est donnée)"
        : f.key === "points"
        ? "3 à 5 points très courts, séparés par \\n"
        : `${f.max ?? 80} caractères maximum`;
      return `- "${f.key}" (${f.label}) : ${hint}`;
    })
    .join("\n");

  const system = [
    `Tu es motion designer et rédacteur publicitaire pour ${audienceLine()}.`,
    "Tu écris en français des textes TRÈS courts et percutants, lisibles en une seconde à l'écran.",
    "N'invente jamais de date, de prix, de numéro de téléphone ni de lieu qui ne figure pas dans la demande : laisse alors le champ vide.",
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.",
  ].join(" ");

  const user = [
    `Modèle de vidéo : ${b.template ?? "animation"}. Date du jour : ${today}.`,
    `Demande :\n${brief}`,
    `Remplis ces champs :\n${spec}`,
    `Ajoute aussi "caption" : la légende de la publication qui accompagnera la vidéo (2 à 4 phrases, un appel à l'action, 3 à 6 hashtags).`,
    `Format : {"fields": {${fields.map((f) => `"${f.key}": "..."`).join(", ")}}, "caption": "..."}`,
  ].join("\n\n");

  try {
    const raw = await callClaude(system, user, 1200);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Réponse IA illisible");
    const parsed = JSON.parse(match[0]);
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = parsed.fields?.[f.key];
      if (typeof v !== "string") continue;
      if (f.type === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
      out[f.key] = f.max ? v.slice(0, f.key === "points" ? 300 : f.max) : v;
    }
    return json({ fields: out, caption: typeof parsed.caption === "string" ? parsed.caption : "" });
  } catch (e) {
    return json({ error: errorMessage(e) }, 502);
  }
});
