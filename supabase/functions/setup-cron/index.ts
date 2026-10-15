// Active l'automatisation (pg_cron) sans passer par l'éditeur SQL.
// Appelé une fois par le déploiement GitHub (en-tête x-cron-secret). Idempotent.
import postgres from "npm:postgres@3.4.5";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Non autorisé" }, 401);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    for (const [name, value] of [["pilote_project_url", projectUrl], ["pilote_cron_secret", secret]]) {
      const rows = await sql`select id from vault.secrets where name = ${name}`;
      if (rows.length) await sql`select vault.update_secret(${rows[0].id}::uuid, ${value})`;
      else await sql`select vault.create_secret(${value}, ${name})`;
    }

    const call = (fn: string, body: string, timeout: number) => `
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_project_url') || '/functions/v1/${fn}',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_cron_secret')),
        body    := '${body}'::jsonb,
        timeout_milliseconds := ${timeout}
      );`;

    await sql`select cron.schedule('pilote-planner', '7 * * * *', ${call("planner", '{"days": 7}', 120000)})`;
    await sql`select cron.schedule('pilote-publisher', '*/5 * * * *', ${call("publisher", "{}", 140000)})`;
    const jobs = await sql`select jobname, schedule from cron.job where jobname like 'pilote-%' order by jobname`;
    return json({ ok: true, jobs });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  } finally {
    await sql.end();
  }
});
