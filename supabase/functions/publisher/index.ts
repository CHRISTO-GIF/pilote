// Publication : envoie aux réseaux les publications arrivées à échéance.
// Appelé toutes les 5 min par le cron, ou par le tableau de bord ("Publier maintenant").
import { admin, identify, publicMediaUrl, type AccountRow } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { publish } from "../_shared/platforms.ts";
import { freshToken } from "../_shared/tokens.ts";

const BATCH = 5;          // limite par exécution (les fonctions ont une durée max)
const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 15;

type Post = {
  id: string;
  user_id: string;
  account_id: string;
  caption: string;
  media_path: string | null;
  media_type: "image" | "video" | null;
  attempts: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identify(req);
  if (!caller) return json({ error: "Non autorisé" }, 401);
  const body = await req.json().catch(() => ({}));

  // Débloquer les publications restées "publishing" après un plantage
  await admin
    .from("posts")
    .update({ status: "scheduled", locked_at: null })
    .eq("status", "publishing")
    .lt("locked_at", new Date(Date.now() - 10 * 60_000).toISOString());

  let q = admin
    .from("posts")
    .select("id, user_id, account_id, caption, media_path, media_type, attempts")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(BATCH);
  if (caller.kind === "user") q = q.eq("user_id", caller.userId);
  if (body.post_id) q = q.eq("id", body.post_id);

  const { data: due, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const results: { id: string; ok: boolean; detail: string }[] = [];
  for (const post of (due ?? []) as Post[]) {
    // Verrou optimiste : une seule exécution traite ce post
    const { data: claimed } = await admin
      .from("posts")
      .update({ status: "publishing", attempts: post.attempts + 1, locked_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("status", "scheduled")
      .select("id");
    if (!claimed?.length) continue;

    try {
      const externalId = await publishOne(post);
      await admin
        .from("posts")
        .update({
          status: "published",
          external_post_id: externalId,
          published_at: new Date().toISOString(),
          error: null,
          locked_at: null,
        })
        .eq("id", post.id);
      results.push({ id: post.id, ok: true, detail: externalId });
    } catch (e) {
      const msg = errorMessage(e);
      const attempts = post.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await admin
        .from("posts")
        .update(
          giveUp
            ? { status: "failed", error: msg, locked_at: null }
            : {
              status: "scheduled",
              error: `Essai ${attempts}/${MAX_ATTEMPTS} : ${msg}`,
              scheduled_at: new Date(Date.now() + RETRY_MINUTES * 60_000).toISOString(),
              locked_at: null,
            },
        )
        .eq("id", post.id);
      results.push({ id: post.id, ok: false, detail: msg });
    }
  }
  return json({ processed: results.length, results });
});

async function publishOne(post: Post): Promise<string> {
  const { data: account } = await admin
    .from("accounts")
    .select("id, user_id, platform, name, external_id, active")
    .eq("id", post.account_id)
    .single<AccountRow>();
  if (!account) throw new Error("Compte introuvable");
  if (!account.active) throw new Error("Compte désactivé");

  const token = await freshToken(account);

  return await publish(account.platform, {
    externalId: account.external_id,
    token,
    caption: post.caption,
    mediaUrl: publicMediaUrl(post.media_path),
    mediaType: post.media_type,
  });
}
