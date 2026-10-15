// Rédaction IA à la demande depuis le tableau de bord.
import { identify } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { writeCaption } from "../_shared/ai.ts";
import type { Platform } from "../_shared/platforms.ts";

const PLATFORMS: Platform[] = ["facebook", "instagram", "linkedin", "tiktok"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identify(req);
  if (!caller || caller.kind !== "user") return json({ error: "Non autorisé" }, 401);

  const b = await req.json().catch(() => ({}));
  if (!PLATFORMS.includes(b.platform)) return json({ error: "Plateforme inconnue" }, 400);
  try {
    const caption = await writeCaption({
      platform: b.platform,
      mode: b.mode === "generate" ? "generate" : "enhance",
      brief: typeof b.brief === "string" ? b.brief.slice(0, 2000) : undefined,
      sourceText: typeof b.source_text === "string" ? b.source_text.slice(0, 5000) : undefined,
      title: typeof b.title === "string" ? b.title.slice(0, 300) : undefined,
      hasMedia: b.media_type === "image" || b.media_type === "video" ? b.media_type : null,
    });
    return json({ caption });
  } catch (e) {
    return json({ error: errorMessage(e) }, 502);
  }
});
