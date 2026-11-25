// Agent de commentaires : lit les commentaires des publications Facebook récentes,
// répond tout seul aux commentaires simples (quiz, remerciements, demandes d'information)
// et signale les autres dans Pilote sans y répondre.
// Appelé toutes les 15 min par le cron, ou depuis le tableau de bord (« Vérifier maintenant »).
import { admin, identify, type AccountRow } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json, sleep } from "../_shared/http.ts";
import { graphGet, graphPost } from "../_shared/platforms.ts";
import { freshToken } from "../_shared/tokens.ts";
import { classify, type PostInfo } from "./rules.ts";

const LOOKBACK_DAYS = 21;
const MAX_REPLIES_PER_RUN = 25;

type Comment = { id: string; message?: string; from?: { id: string; name: string }; created_time: string; permalink_url?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identify(req);
  if (!caller) return json({ error: "Non autorisé" }, 401);

  let q = admin.from("accounts").select("id, user_id, platform, name, external_id, active")
    .eq("platform", "facebook").eq("active", true).eq("auto_reply", true);
  if (caller.kind === "user") q = q.eq("user_id", caller.userId);
  const { data: accounts, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const summary = { pages: 0, posts: 0, nouveaux: 0, repondus: 0, signales: 0, erreurs: [] as string[] };
  let replies = 0;

  for (const acc of (accounts ?? []) as AccountRow[]) {
    summary.pages++;
    let token: string;
    try { token = await freshToken(acc); } catch (e) { summary.erreurs.push(`${acc.name} : ${errorMessage(e)}`); continue; }

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
    const { data: posts } = await admin.from("posts")
      .select("id, caption, external_post_id, published_at, content_items(tags)")
      .eq("account_id", acc.id).eq("status", "published")
      .not("external_post_id", "is", null).gte("published_at", since);

    for (const p of posts ?? []) {
      summary.posts++;
      let comments: Comment[] = [];
      try {
        const r = await graphGet(`/${p.external_post_id}/comments`, {
          fields: "id,message,from{id,name},created_time,permalink_url",
          filter: "toplevel", order: "chronological", limit: "100", access_token: token,
        });
        comments = r.data ?? [];
      } catch (e) {
        summary.erreurs.push(`${acc.name} / ${p.external_post_id} : ${errorMessage(e)}`);
        continue;
      }
      const fresh = comments.filter((c) => c.from?.id !== acc.external_id);
      if (!fresh.length) continue;
      const { data: known } = await admin.from("comment_log").select("comment_id").in("comment_id", fresh.map((c) => c.id));
      const seen = new Set((known ?? []).map((k) => k.comment_id));

      const info: PostInfo = {
        caption: p.caption ?? "",
        tags: ((p as { content_items?: { tags?: string[] } }).content_items?.tags) ?? [],
        publishedAt: p.published_at,
      };

      for (const c of fresh) {
        if (seen.has(c.id)) continue;
        summary.nouveaux++;
        const d = classify(c.message ?? "", c.from?.name ?? "", info, c.id);
        const row = {
          user_id: acc.user_id, account_id: acc.id, post_id: p.id, comment_id: c.id,
          author_name: c.from?.name ?? null, message: c.message ?? "", permalink: c.permalink_url ?? null,
          commented_at: c.created_time, category: d.category,
          status: d.reply ? "replied" : d.flag ? "flagged" : "ignored",
          reply_text: d.reply ?? null, reply_id: null as string | null, error: null as string | null,
        };
        if (d.reply) {
          if (replies >= MAX_REPLIES_PER_RUN) continue; // sera traité au prochain passage
          try {
            const r = await graphPost(`/${c.id}/comments`, { message: d.reply, access_token: token });
            row.reply_id = r.id ?? null;
            replies++; summary.repondus++;
            await graphPost(`/${c.id}/likes`, { access_token: token }).catch(() => {});
            await sleep(1500);
          } catch (e) {
            row.status = "error"; row.error = errorMessage(e);
            summary.erreurs.push(`Réponse ${c.id} : ${row.error}`);
          }
        } else if (d.flag) summary.signales++;
        await admin.from("comment_log").upsert(row, { onConflict: "comment_id", ignoreDuplicates: true });
      }
    }
  }
  return json(summary);
});
