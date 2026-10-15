import type { Platform } from "./platforms.ts";

const PLATFORM_GUIDE: Record<Platform, string> = {
  facebook:
    "Facebook : ton chaleureux et conversationnel, 1 à 3 courts paragraphes, un appel à l'action clair, 0 à 3 hashtags.",
  instagram:
    "Instagram : première ligne accrocheuse, phrases courtes, quelques emojis pertinents, 5 à 10 hashtags regroupés en fin de texte.",
  linkedin:
    "LinkedIn : ton professionnel et crédible, une idée utile ou un enseignement concret, paragraphes aérés, 3 hashtags maximum.",
  tiktok:
    "TikTok : très court (moins de 150 caractères), dynamique, 3 à 5 hashtags.",
  youtube:
    "YouTube : première ligne = titre accrocheur de moins de 90 caractères, puis une description de 2 à 4 phrases avec un appel à l'action, puis 3 à 5 hashtags dont #Shorts.",
};

export type CaptionRequest = {
  platform: Platform;
  mode: "enhance" | "generate";
  brief?: string;        // consignes de la règle de planification (marque, ton, thème…)
  sourceText?: string;   // texte de la bibliothèque à adapter
  title?: string;
  hasMedia?: "image" | "video" | null;
};

export async function writeCaption(req: CaptionRequest): Promise<string> {
  const audience = audienceLine();

  const system = [
    "Tu es le community manager de la marque. Tu rédiges des publications pour les réseaux sociaux, en français,",
    `pour ${audience}. Style naturel, pas de jargon creux, pas d'informations inventées (dates, prix, chiffres, lieux).`,
    "Réponds UNIQUEMENT avec le texte final de la publication, sans guillemets, sans titre, sans commentaire.",
    PLATFORM_GUIDE[req.platform],
  ].join(" ");

  const parts: string[] = [];
  if (req.brief) parts.push(`Consignes de la marque :\n${req.brief}`);
  if (req.title) parts.push(`Sujet : ${req.title}`);
  if (req.hasMedia) parts.push(`La publication est accompagnée d'une ${req.hasMedia === "image" ? "image" : "vidéo"}.`);
  if (req.mode === "enhance") {
    parts.push(`Adapte et améliore ce texte pour ${req.platform}, en gardant le sens et les informations :\n${req.sourceText ?? ""}`);
  } else {
    parts.push(
      req.sourceText
        ? `Écris une nouvelle publication pour ${req.platform} inspirée de ce contenu :\n${req.sourceText}`
        : `Écris une nouvelle publication originale pour ${req.platform} en respectant les consignes.`,
    );
  }

  return await callClaude(system, parts.join("\n\n"), 800);
}

export function audienceLine(): string {
  return Deno.env.get("AUDIENCE") ?? "un public principalement tchadien et d'Afrique francophone";
}

/** Appel brut à l'API Claude, renvoie le texte de la réponse. */
export async function callClaude(system: string, user: string, maxTokens = 800): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY n'est pas configurée");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`IA ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("IA : réponse vide");
  return text;
}
