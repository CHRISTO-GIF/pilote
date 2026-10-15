// Planificateur : transforme les règles (quotidiennes / hebdomadaires) en publications
// concrètes pour les N prochains jours. Idempotent : peut tourner toutes les heures.
import { admin, identify, type AccountRow } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { addDays, localToUtc, todayIn, weekday } from "../_shared/time.ts";
import { writeCaption } from "../_shared/ai.ts";
import { supports, type MediaType } from "../_shared/platforms.ts";

type Schedule = {
  id: string;
  user_id: string;
  name: string;
  frequency: "daily" | "weekly";
  weekdays: number[];
  post_time: string;
  timezone: string;
  account_ids: string[];
  tags: string[];
  ai_mode: "none" | "enhance" | "generate";
  ai_brief: string;
  require_approval: boolean;
};

type Item = {
  id: string;
  title: string;
  body: string;
  media_path: string | null;
  media_type: MediaType;
  tags: string[];
  use_count: number;
  last_used_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identify(req);
  if (!caller) return json({ error: "Non autorisé" }, 401);

  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(Number(body.days ?? 7), 31));

  let q = admin.from("schedules").select("*").eq("active", true);
  if (caller.kind === "user") q = q.eq("user_id", caller.userId);
  if (body.schedule_id) q = q.eq("id", body.schedule_id);
  const { data: schedules, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const report = { created: 0, slots_already_planned: 0, errors: [] as string[] };

  for (const s of (schedules ?? []) as Schedule[]) {
    try {
      await planSchedule(s, days, report);
    } catch (e) {
      report.errors.push(`${s.name} : ${errorMessage(e)}`);
    }
  }
  return json(report);
});

async function planSchedule(
  s: Schedule,
  days: number,
  report: { created: number; slots_already_planned: number; errors: string[] },
) {
  if (!s.account_ids?.length) return;
  const { data: accRows } = await admin
    .from("accounts")
    .select("id, user_id, platform, name, external_id, active")
    .in("id", s.account_ids)
    .eq("user_id", s.user_id)
    .eq("active", true);
  const accounts = (accRows ?? []) as AccountRow[];
  if (!accounts.length) return;

  let iq = admin
    .from("content_items")
    .select("id, title, body, media_path, media_type, tags, use_count, last_used_at")
    .eq("user_id", s.user_id)
    .eq("active", true);
  if (s.tags?.length) iq = iq.overlaps("tags", s.tags);
  const { data: itemRows } = await iq;
  // Rotation : les contenus jamais / le moins récemment utilisés passent en premier
  const items = ((itemRows ?? []) as Item[]).sort((a, b) => {
    const ta = a.last_used_at ? Date.parse(a.last_used_at) : 0;
    const tb = b.last_used_at ? Date.parse(b.last_used_at) : 0;
    return ta - tb || a.use_count - b.use_count;
  });

  const time = String(s.post_time).slice(0, 5);
  const today = todayIn(s.timezone);

  for (let k = 0; k < days; k++) {
    const ymd = addDays(today, k);
    if (s.frequency === "weekly" && !(s.weekdays ?? []).includes(weekday(ymd))) continue;
    const at = localToUtc(ymd, time, s.timezone);
    if (at.getTime() < Date.now() + 60_000) continue;

    const { data: existing } = await admin
      .from("posts")
      .select("account_id")
      .eq("schedule_id", s.id)
      .eq("scheduled_at", at.toISOString());
    const done = new Set((existing ?? []).map((e) => e.account_id));
    const todo = accounts.filter((a) => !done.has(a.id));
    if (!todo.length) {
      report.slots_already_planned++;
      continue;
    }

    // Un même contenu pour tout le créneau si possible (message cohérent sur tous les réseaux)
    const shared = items.find((it) => todo.every((a) => supports(a.platform, it.media_type)));
    const used = new Set<string>();

    for (const acc of todo) {
      let item: Item | undefined = shared ?? items.find((it) => supports(acc.platform, it.media_type));
      if (!item && !(s.ai_mode === "generate" && supports(acc.platform, null))) {
        report.errors.push(
          `${s.name} / ${acc.name} (${ymd}) : aucun contenu compatible dans la bibliothèque` +
            (acc.platform === "instagram" || acc.platform === "tiktok" ? " (image ou vidéo requise)" : ""),
        );
        continue;
      }

      let caption = item ? (item.body || item.title) : "";
      let note: string | null = null;
      if (s.ai_mode !== "none") {
        try {
          caption = await writeCaption({
            platform: acc.platform,
            mode: s.ai_mode === "generate" ? "generate" : "enhance",
            brief: s.ai_brief,
            sourceText: item?.body || item?.title,
            title: item?.title,
            hasMedia: item?.media_type ?? null,
          });
        } catch (e) {
          note = `Texte IA indisponible, texte d'origine utilisé : ${errorMessage(e)}`;
          if (!caption) {
            report.errors.push(`${s.name} / ${acc.name} (${ymd}) : ${errorMessage(e)}`);
            continue;
          }
        }
      }

      const { error: insErr, data: ins } = await admin
        .from("posts")
        .upsert(
          {
            user_id: s.user_id,
            schedule_id: s.id,
            account_id: acc.id,
            content_item_id: item?.id ?? null,
            caption,
            media_path: item?.media_path ?? null,
            media_type: item?.media_type ?? null,
            scheduled_at: at.toISOString(),
            status: s.require_approval ? "pending_approval" : "scheduled",
            error: note,
          },
          { onConflict: "schedule_id,account_id,scheduled_at", ignoreDuplicates: true },
        )
        .select("id");
      if (insErr) {
        report.errors.push(`${s.name} / ${acc.name} : ${insErr.message}`);
        continue;
      }
      if (ins?.length) report.created++;
      if (item) used.add(item.id);
    }

    // Marquer les contenus utilisés et les renvoyer en fin de rotation
    for (const id of used) {
      const it = items.find((x) => x.id === id)!;
      it.use_count++;
      it.last_used_at = new Date().toISOString();
      await admin
        .from("content_items")
        .update({ use_count: it.use_count, last_used_at: it.last_used_at })
        .eq("id", id);
      items.splice(items.indexOf(it), 1);
      items.push(it);
    }
  }
}
