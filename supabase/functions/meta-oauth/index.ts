// Bouton « Connecter Facebook et Instagram » : connexion Meta sans copier de code.
// Ajoute toutes les Pages choisies + les comptes Instagram professionnels qui leur sont liés.
// Les jetons de Page obtenus à partir d'un jeton utilisateur longue durée n'expirent pas.
import { identify } from "../_shared/db.ts";
import { corsHeaders, errorMessage, json } from "../_shared/http.ts";
import { allowedReturn, backTo, plainError, saveConnectedAccount, signState, verifyState } from "../_shared/oauth.ts";

const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

const version = () => Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
const redirectUri = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-oauth`;

async function graph(path: string, params: Record<string, string>) {
  const res = await fetch(`https://graph.facebook.com/${version()}${path}?${new URLSearchParams(params)}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Meta : ${data.error?.message ?? res.status}`);
  return data;
}

type Page = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");

  // 1) Démarrage depuis le tableau de bord
  if (req.method === "POST") {
    const caller = await identify(req);
    if (!caller || caller.kind !== "user") return json({ error: "Non autorisé" }, 401);
    if (!appId || !appSecret) {
      return json({ error: "Facebook n'est pas encore configuré (identifiants de l'application Meta manquants)." }, 400);
    }
    const b = await req.json().catch(() => ({}));
    const ret = String(b.return_url ?? "");
    if (!allowedReturn(ret)) return json({ error: "Adresse de retour non autorisée" }, 400);

    const params: Record<string, string> = {
      client_id: appId,
      redirect_uri: redirectUri(),
      response_type: "code",
      state: await signState(caller.userId, ret),
    };
    // Liste des autorisations (testé : fonctionne avec l'appli Pilote, alors que config_id renvoie
    // une erreur générique). META_USE_CONFIG=true permet de revenir à l'identifiant de configuration.
    const configId = Deno.env.get("META_CONFIG_ID");
    if (configId && Deno.env.get("META_USE_CONFIG") === "true") {
      params.config_id = configId;
      params.override_default_response_type = "true";
    } else {
      params.scope = SCOPES;
    }
    const url = `https://www.facebook.com/${version()}/dialog/oauth?${new URLSearchParams(params)}`;
    return json({ url });
  }

  // 2) Retour de Facebook
  const q = new URL(req.url).searchParams;
  let st;
  try {
    st = await verifyState(q.get("state") ?? "");
  } catch (e) {
    return plainError(errorMessage(e));
  }
  if (q.get("error")) return backTo(st.ret, { connect: "meta", status: "annule" });

  try {
    const short = await graph("/oauth/access_token", {
      client_id: appId ?? "",
      client_secret: appSecret ?? "",
      redirect_uri: redirectUri(),
      code: q.get("code") ?? "",
    });
    const long = await graph("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId ?? "",
      client_secret: appSecret ?? "",
      fb_exchange_token: short.access_token,
    });
    const pages = await graph("/me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
      access_token: long.access_token,
    });
    const list = (pages.data ?? []) as Page[];
    if (!list.length) {
      throw new Error("Aucune Page trouvée : pendant la connexion, cochez la ou les Pages à gérer.");
    }

    let n = 0;
    for (const p of list) {
      await saveConnectedAccount({
        uid: st.uid,
        platform: "facebook",
        externalId: p.id,
        name: p.name,
        accessToken: p.access_token,
        message: `Page « ${p.name} » connectée`,
      });
      n++;
      const ig = p.instagram_business_account;
      if (ig?.id) {
        await saveConnectedAccount({
          uid: st.uid,
          platform: "instagram",
          externalId: ig.id,
          name: ig.username ? `@${ig.username}` : `Instagram de ${p.name}`,
          accessToken: p.access_token,
          message: `Compte Instagram ${ig.username ? "@" + ig.username : ""} connecté`.trim(),
        });
        n++;
      }
    }
    return backTo(st.ret, { connect: "meta", status: "ok", n: String(n) });
  } catch (e) {
    return backTo(st.ret, { connect: "meta", status: "erreur", message: errorMessage(e).slice(0, 200) });
  }
});
