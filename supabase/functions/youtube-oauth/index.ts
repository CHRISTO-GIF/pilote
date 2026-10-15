// Bouton « Connecter ma chaîne YouTube » : connexion Google (OAuth) sans copier de code.
//  POST {action:"start", return_url}  (utilisateur connecté) -> { url } vers Google
//  GET  ?code=…&state=…               (retour de Google)     -> enregistre la chaîne, revient au tableau de bord
import { identify } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { youtubeChannel } from "../_shared/platforms.ts";
import { allowedReturn, backTo, plainError, saveConnectedAccount, signState, verifyState } from "../_shared/oauth.ts";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

const redirectUri = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-oauth`;

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
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: await signState(caller.userId, ret),
    }).toString();
    return json({ url: url.toString() });
  }

  // 2) Retour de Google
  const q = new URL(req.url).searchParams;
  let st;
  try {
    st = await verifyState(q.get("state") ?? "");
  } catch (e) {
    return plainError(errorMessage(e));
  }
  if (q.get("error")) return backTo(st.ret, { connect: "youtube", status: "annule" });

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
    if (!tok.refresh_token) {
      throw new Error("Google n'a pas fourni d'accès permanent : retirez Pilote de votre compte Google puis recommencez");
    }
    const ch = await youtubeChannel(tok.access_token);
    await saveConnectedAccount({
      uid: st.uid,
      platform: "youtube",
      externalId: ch.id,
      name: ch.title,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      message: `Chaîne YouTube « ${ch.title} » connectée`,
    });
    return backTo(st.ret, { connect: "youtube", status: "ok", n: "1" });
  } catch (e) {
    return backTo(st.ret, { connect: "youtube", status: "erreur", message: errorMessage(e).slice(0, 200) });
  }
});
