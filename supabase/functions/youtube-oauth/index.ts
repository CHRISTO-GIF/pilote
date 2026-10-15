// Bouton « Connecter ma chaîne YouTube » : connexion Google (OAuth) sans copier de code.
//  POST {action:"start", return_url}  (utilisateur connecté) -> { url } vers Google
//  GET  ?code=…&state=…               (retour de Google)     -> enregistre la chaîne, revient au tableau de bord
import { admin, identify } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { youtubeChannel } from "../_shared/platforms.ts";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

const redirectUri = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-oauth`;

// --- état signé (HMAC) pour relier le retour de Google à l'utilisateur ---------------
const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

async function sign(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

async function verify(state: string): Promise<{ uid: string; ret: string; exp: number }> {
  const [body, sig] = state.split(".");
  if (!body || !sig || sig !== (await hmac(body))) throw new Error("Lien de connexion invalide");
  const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  if (Date.now() > p.exp) throw new Error("Lien de connexion expiré, recommencez");
  return p;
}

function allowedReturn(url: string): boolean {
  try {
    const u = new URL(url);
    const site = Deno.env.get("PUBLIC_SITE_URL");
    return u.protocol === "https:" ? (!site || u.origin === new URL(site).origin) : u.hostname === "localhost";
  } catch {
    return false;
  }
}

function back(ret: string, params: Record<string, string>): Response {
  const u = new URL(ret);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.hash = "accounts";
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  // 1) Démarrage depuis le tableau de bord
  if (req.method === "POST") {
    const caller = await identify(req);
    if (!caller || caller.kind !== "user") return json({ error: "Non autorisé" }, 401);
    if (!clientId || !clientSecret) {
      return json({ error: "YouTube n'est pas encore configuré (identifiants Google manquants)." }, 400);
    }
    const b = await req.json().catch(() => ({}));
    const ret = String(b.return_url ?? "");
    if (!allowedReturn(ret)) return json({ error: "Adresse de retour non autorisée" }, 400);
    const state = await sign({ uid: caller.userId, ret, exp: Date.now() + 15 * 60_000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();
    return json({ url: url.toString() });
  }

  // 2) Retour de Google
  const q = new URL(req.url).searchParams;
  let st: { uid: string; ret: string };
  try {
    st = await verify(q.get("state") ?? "");
  } catch (e) {
    return new Response(errorMessage(e), { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (q.get("error")) return back(st.ret, { youtube: "annule" });

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: q.get("code") ?? "",
        client_id: clientId ?? "",
        client_secret: clientSecret ?? "",
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const tok = await res.json();
    if (!res.ok || !tok.access_token) throw new Error(tok.error_description ?? tok.error ?? `Google ${res.status}`);
    if (!tok.refresh_token) throw new Error("Google n'a pas fourni d'accès permanent : retirez Pilote de votre compte Google puis recommencez");

    const ch = await youtubeChannel(tok.access_token);

    // Créer ou mettre à jour le compte YouTube de l'utilisateur
    const { data: existing } = await admin
      .from("accounts").select("id")
      .eq("user_id", st.uid).eq("platform", "youtube").eq("external_id", ch.id)
      .maybeSingle();
    let accountId = existing?.id as string | undefined;
    if (!accountId) {
      const { data, error } = await admin
        .from("accounts")
        .insert({ user_id: st.uid, platform: "youtube", name: ch.title, external_id: ch.id })
        .select("id").single();
      if (error) throw error;
      accountId = data.id;
    } else {
      await admin.from("accounts").update({ name: ch.title, active: true }).eq("id", accountId);
    }
    const { error: secErr } = await admin.from("account_secrets").upsert({
      account_id: accountId,
      user_id: st.uid,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (secErr) throw secErr;
    await admin.from("accounts").update({
      last_check_at: new Date().toISOString(),
      last_check_ok: true,
      last_check_message: `Chaîne YouTube « ${ch.title} » connectée`,
    }).eq("id", accountId);
    return back(st.ret, { youtube: "ok" });
  } catch (e) {
    return back(st.ret, { youtube: "erreur", message: errorMessage(e).slice(0, 200) });
  }
});
