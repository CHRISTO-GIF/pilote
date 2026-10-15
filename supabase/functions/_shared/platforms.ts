import { sleep } from "./http.ts";

export type Platform = "facebook" | "instagram" | "linkedin" | "tiktok" | "youtube";
export type MediaType = "image" | "video" | null;

export type PublishInput = {
  externalId: string;
  token: string;
  caption: string;
  mediaUrl: string | null;
  mediaType: MediaType;
};

/** Quels types de contenu chaque plateforme accepte dans ce MVP. */
export function supports(platform: Platform, mediaType: MediaType): boolean {
  switch (platform) {
    case "facebook":
      return true;
    case "instagram":
      return mediaType === "image" || mediaType === "video";
    case "linkedin":
      return mediaType === null || mediaType === "image";
    case "tiktok":
      return mediaType === "image" || mediaType === "video";
    case "youtube":
      return mediaType === "video";
  }
}

export async function publish(platform: Platform, input: PublishInput): Promise<string> {
  if (!supports(platform, input.mediaType)) {
    throw new Error(`${platform} n'accepte pas ce type de publication (${input.mediaType ?? "texte seul"})`);
  }
  switch (platform) {
    case "facebook":
      return await publishFacebook(input);
    case "instagram":
      return await publishInstagram(input);
    case "linkedin":
      return await publishLinkedIn(input);
    case "tiktok":
      return await publishTikTok(input);
    case "youtube":
      return await publishYouTube(input);
  }
}

export async function checkAccount(platform: Platform, externalId: string, token: string): Promise<string> {
  switch (platform) {
    case "facebook": {
      const r = await graphGet(`/${externalId}`, { fields: "name", access_token: token });
      return `Page « ${r.name} » accessible`;
    }
    case "instagram": {
      const r = await graphGet(`/${externalId}`, { fields: "username", access_token: token });
      return `Compte Instagram @${r.username} accessible`;
    }
    case "linkedin": {
      const org = externalId.match(/^urn:li:organization:(\d+)$/);
      if (org) {
        const r = await linkedinFetch(`/rest/organizations/${org[1]}`, token);
        return `Organisation « ${r.localizedName ?? org[1]} » accessible`;
      }
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`LinkedIn ${res.status} : ${(await res.text()).slice(0, 200)}`);
      const r = await res.json();
      return `Profil « ${r.name ?? "LinkedIn"} » accessible`;
    }
    case "tiktok": {
      const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const r = await res.json();
      if (!res.ok || (r.error && r.error.code !== "ok")) {
        throw new Error(`TikTok : ${r.error?.message ?? res.status}`);
      }
      return `Compte TikTok « ${r.data?.user?.display_name ?? "?"} » accessible`;
    }
    case "youtube": {
      const ch = await youtubeChannel(token);
      return `Chaîne YouTube « ${ch.title} » accessible`;
    }
  }
}

// ---------------------------------------------------------------------
// Meta (Facebook + Instagram) — Graph API
// ---------------------------------------------------------------------
const graphBase = () => `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v23.0"}`;

async function graphPost(path: string, params: Record<string, string>) {
  const res = await fetch(graphBase() + path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Meta : ${data.error?.message ?? res.status}`);
  return data;
}

async function graphGet(path: string, params: Record<string, string>) {
  const res = await fetch(`${graphBase()}${path}?${new URLSearchParams(params)}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Meta : ${data.error?.message ?? res.status}`);
  return data;
}

async function publishFacebook(i: PublishInput): Promise<string> {
  if (i.mediaType === "image") {
    const r = await graphPost(`/${i.externalId}/photos`, {
      url: i.mediaUrl!, caption: i.caption, access_token: i.token,
    });
    return r.post_id ?? r.id;
  }
  if (i.mediaType === "video") {
    const r = await graphPost(`/${i.externalId}/videos`, {
      file_url: i.mediaUrl!, description: i.caption, access_token: i.token,
    });
    return r.id;
  }
  const r = await graphPost(`/${i.externalId}/feed`, { message: i.caption, access_token: i.token });
  return r.id;
}

async function publishInstagram(i: PublishInput): Promise<string> {
  const params: Record<string, string> = { caption: i.caption, access_token: i.token };
  if (i.mediaType === "video") {
    params.media_type = "REELS";
    params.video_url = i.mediaUrl!;
  } else {
    params.image_url = i.mediaUrl!;
  }
  const container = await graphPost(`/${i.externalId}/media`, params);

  // Attendre que Meta ait traité le média (rapide pour une image, plus long pour une vidéo)
  const deadline = Date.now() + 75_000;
  while (true) {
    const s = await graphGet(`/${container.id}`, { fields: "status_code", access_token: i.token });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new Error(`Instagram : traitement du média en échec (${s.status_code})`);
    }
    if (Date.now() > deadline) throw new Error("Instagram : média encore en traitement, nouvel essai plus tard");
    await sleep(3000);
  }
  const r = await graphPost(`/${i.externalId}/media_publish`, {
    creation_id: container.id, access_token: i.token,
  });
  return r.id;
}

// ---------------------------------------------------------------------
// LinkedIn — Posts API (texte et image)
// ---------------------------------------------------------------------
function linkedinHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": Deno.env.get("LINKEDIN_VERSION") ?? "202606",
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

async function linkedinFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch("https://api.linkedin.com" + path, {
    ...init,
    headers: { ...linkedinHeaders(token), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`LinkedIn ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function publishLinkedIn(i: PublishInput): Promise<string> {
  const body: Record<string, unknown> = {
    author: i.externalId, // urn:li:organization:123 ou urn:li:person:abc
    commentary: escapeLinkedIn(i.caption),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (i.mediaType === "image") {
    const init = await linkedinFetch("/rest/images?action=initializeUpload", i.token, {
      method: "POST",
      body: JSON.stringify({ initializeUploadRequest: { owner: i.externalId } }),
    });
    const { uploadUrl, image } = init.value;
    const media = await fetch(i.mediaUrl!);
    if (!media.ok) throw new Error(`Téléchargement du média impossible (${media.status})`);
    const up = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${i.token}` },
      body: await media.arrayBuffer(),
    });
    if (!up.ok) throw new Error(`LinkedIn upload ${up.status}`);
    body.content = { media: { id: image } };
  }

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedinHeaders(i.token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LinkedIn ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return res.headers.get("x-restli-id") ?? "linkedin-ok";
}

/** Le champ commentary de LinkedIn interprète certains caractères : on les échappe. */
function escapeLinkedIn(text: string): string {
  return text.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => "\\" + c);
}

// ---------------------------------------------------------------------
// TikTok — Content Posting API (vidéo et photos, publication directe)
// ---------------------------------------------------------------------
async function tiktokPost(path: string, token: string, payload: unknown) {
  const res = await fetch("https://open.tiktokapis.com" + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || (data.error && data.error.code !== "ok")) {
    throw new Error(`TikTok : ${data.error?.message ?? res.status}`);
  }
  return data;
}

async function publishTikTok(i: PublishInput): Promise<string> {
  // Une application non auditée par TikTok ne peut publier qu'en privé (SELF_ONLY).
  const privacy = Deno.env.get("TIKTOK_PRIVACY") ?? "SELF_ONLY";
  if (i.mediaType === "video") {
    const r = await tiktokPost("/v2/post/publish/video/init/", i.token, {
      post_info: {
        title: i.caption.slice(0, 2200),
        privacy_level: privacy,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: { source: "PULL_FROM_URL", video_url: i.mediaUrl },
    });
    return r.data.publish_id;
  }
  const r = await tiktokPost("/v2/post/publish/content/init/", i.token, {
    post_info: {
      title: i.caption.slice(0, 90),
      description: i.caption.slice(0, 4000),
      privacy_level: privacy,
      disable_comment: false,
      auto_add_music: true,
    },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: [i.mediaUrl] },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
  return r.data.publish_id;
}

/** Rafraîchit un jeton TikTok (durée de vie 24 h). */
export async function refreshTikTokToken(refreshToken: string) {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: Deno.env.get("TIKTOK_CLIENT_KEY") ?? "",
      client_secret: Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok refresh : ${data.error_description ?? data.error ?? res.status}`);
  }
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) ?? refreshToken,
    expires_at: new Date(Date.now() + (data.expires_in ?? 86400) * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------
// YouTube — Data API v3 (envoi de vidéos ; une vidéo verticale courte devient un Short)
// ---------------------------------------------------------------------
export async function youtubeChannel(token: string): Promise<{ id: string; title: string }> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`YouTube : ${data.error?.message ?? res.status}`);
  const ch = data.items?.[0];
  if (!ch) throw new Error("YouTube : aucune chaîne sur ce compte Google (créez-en une sur youtube.com)");
  return { id: ch.id, title: ch.snippet?.title ?? "YouTube" };
}

async function publishYouTube(i: PublishInput): Promise<string> {
  const media = await fetch(i.mediaUrl!);
  if (!media.ok) throw new Error(`Téléchargement de la vidéo impossible (${media.status})`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const type = media.headers.get("content-type")?.split(";")[0] || "video/mp4";

  // Titre : première ligne de la légende (100 caractères max, sans < >)
  const clean = (x: string) => x.replace(/[<>]/g, "").trim();
  const firstLine = clean(i.caption.split("\n").find((l) => l.trim()) ?? "") || "Nouvelle vidéo";
  const title = firstLine.length > 100 ? firstLine.slice(0, 97) + "…" : firstLine;

  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${i.token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": type,
        "X-Upload-Content-Length": String(bytes.byteLength),
      },
      body: JSON.stringify({
        snippet: { title, description: clean(i.caption).slice(0, 5000), categoryId: "22" },
        status: {
          privacyStatus: Deno.env.get("YOUTUBE_PRIVACY") ?? "public",
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );
  if (!init.ok) {
    const e = await init.json().catch(() => ({}));
    throw new Error(`YouTube : ${e.error?.message ?? init.status}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube : adresse d'envoi manquante");
  const up = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${i.token}`, "Content-Type": type },
    body: bytes,
  });
  const data = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`YouTube : ${data.error?.message ?? up.status}`);
  return data.id;
}

/** Renouvelle un jeton Google (durée de vie 1 h) à partir du jeton de rafraîchissement. */
export async function refreshGoogleToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Google : ${data.error_description ?? data.error ?? res.status} — reconnectez la chaîne YouTube`);
  }
  return {
    access_token: data.access_token as string,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}
