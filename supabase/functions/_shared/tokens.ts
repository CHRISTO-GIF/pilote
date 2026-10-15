import { admin, type AccountRow, type SecretRow } from "./db.ts";
import { refreshGoogleToken, refreshTikTokToken } from "./platforms.ts";

/** Renvoie un jeton d'accès valide pour le compte, en le renouvelant si besoin (TikTok, YouTube). */
export async function freshToken(account: AccountRow): Promise<string> {
  const { data: secret } = await admin
    .from("account_secrets")
    .select("account_id, access_token, refresh_token, expires_at")
    .eq("account_id", account.id)
    .maybeSingle<SecretRow>();
  if (!secret) throw new Error("Aucun jeton d'accès enregistré pour ce compte");

  const expiresSoon = secret.expires_at && Date.parse(secret.expires_at) < Date.now() + 10 * 60_000;
  if (!expiresSoon) return secret.access_token;

  if (secret.refresh_token && (account.platform === "tiktok" || account.platform === "youtube")) {
    const fresh = account.platform === "tiktok"
      ? await refreshTikTokToken(secret.refresh_token)
      : await refreshGoogleToken(secret.refresh_token);
    await admin
      .from("account_secrets")
      .update({ ...fresh, updated_at: new Date().toISOString() })
      .eq("account_id", account.id);
    return fresh.access_token;
  }
  if (Date.parse(secret.expires_at!) < Date.now()) {
    throw new Error("Jeton expiré : mettez-le à jour dans « Comptes »");
  }
  return secret.access_token;
}
