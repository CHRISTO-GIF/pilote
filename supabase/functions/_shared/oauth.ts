// Outils communs aux boutons « Connecter … » (YouTube, Facebook/Instagram).
import { admin } from "./db.ts";

const enc = new TextEncoder();
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export type OAuthState = { uid: string; ret: string; exp: number };

/** État signé transmis au fournisseur, qui permet de retrouver l'utilisateur au retour. */
export async function signState(uid: string, ret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ uid, ret, exp: Date.now() + 15 * 60_000 })));
  return `${body}.${await hmac(body)}`;
}

export async function verifyState(state: string): Promise<OAuthState> {
  const [body, sig] = state.split(".");
  if (!body || !sig || sig !== (await hmac(body))) throw new Error("Lien de connexion invalide");
  const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  if (Date.now() > p.exp) throw new Error("Lien de connexion expiré, recommencez");
  return p;
}

/** Seules les adresses du site Pilote (ou localhost) sont acceptées comme retour. */
export function allowedReturn(url: string): boolean {
  try {
    const u = new URL(url);
    const site = Deno.env.get("PUBLIC_SITE_URL");
    return u.protocol === "https:" ? (!site || u.origin === new URL(site).origin) : u.hostname === "localhost";
  } catch {
    return false;
  }
}

/** Redirige vers l'écran « Comptes » du tableau de bord avec un message. */
export function backTo(ret: string, params: Record<string, string>): Response {
  const u = new URL(ret);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.hash = "accounts";
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

export function plainError(msg: string, status = 400): Response {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Crée ou met à jour un compte et son jeton, puis le marque comme vérifié. */
export async function saveConnectedAccount(a: {
  uid: string;
  platform: "facebook" | "instagram" | "youtube";
  externalId: string;
  name: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  message: string;
}): Promise<string> {
  const { data: existing } = await admin
    .from("accounts").select("id")
    .eq("user_id", a.uid).eq("platform", a.platform).eq("external_id", a.externalId)
    .maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await admin
      .from("accounts")
      .insert({ user_id: a.uid, platform: a.platform, name: a.name, external_id: a.externalId })
      .select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  const { error: secErr } = await admin.from("account_secrets").upsert({
    account_id: id,
    user_id: a.uid,
    access_token: a.accessToken,
    refresh_token: a.refreshToken ?? null,
    expires_at: a.expiresAt ?? null,
    updated_at: new Date().toISOString(),
  });
  if (secErr) throw secErr;
  await admin.from("accounts").update({
    name: a.name,
    active: true,
    last_check_at: new Date().toISOString(),
    last_check_ok: true,
    last_check_message: a.message,
  }).eq("id", id);
  return id;
}
