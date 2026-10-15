// Gestion sécurisée des jetons d'accès (jamais renvoyés au navigateur) + test de connexion.
import { admin, identify, type AccountRow } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { checkAccount } from "../_shared/platforms.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await identify(req);
  if (!caller || caller.kind !== "user") return json({ error: "Non autorisé" }, 401);

  const b = await req.json().catch(() => ({}));
  const { data: account } = await admin
    .from("accounts")
    .select("id, user_id, platform, name, external_id, active")
    .eq("id", b.account_id)
    .eq("user_id", caller.userId)
    .maybeSingle<AccountRow>();
  if (!account) return json({ error: "Compte introuvable" }, 404);

  if (b.action === "save_token") {
    const token = String(b.access_token ?? "").trim();
    if (!token) return json({ error: "Jeton vide" }, 400);
    const expiresIn = Number(b.expires_in_seconds ?? 0);
    const { error } = await admin.from("account_secrets").upsert({
      account_id: account.id,
      user_id: caller.userId,
      access_token: token,
      refresh_token: b.refresh_token ? String(b.refresh_token).trim() : null,
      expires_at: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (b.action === "check") {
    const { data: secret } = await admin
      .from("account_secrets")
      .select("access_token")
      .eq("account_id", account.id)
      .maybeSingle();
    let ok = false;
    let message: string;
    if (!secret) {
      message = "Aucun jeton enregistré";
    } else {
      try {
        message = await checkAccount(account.platform, account.external_id, secret.access_token);
        ok = true;
      } catch (e) {
        message = errorMessage(e);
      }
    }
    await admin
      .from("accounts")
      .update({ last_check_at: new Date().toISOString(), last_check_ok: ok, last_check_message: message })
      .eq("id", account.id);
    return json({ ok, message });
  }

  return json({ error: "Action inconnue" }, 400);
});
