import { createClient } from "jsr:@supabase/supabase-js@2";

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export type Caller = { kind: "cron" } | { kind: "user"; userId: string };

/** Appel autorisé soit par le cron (en-tête x-cron-secret), soit par un utilisateur connecté (JWT). */
export async function identify(req: Request): Promise<Caller | null> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const given = req.headers.get("x-cron-secret");
  if (cronSecret && given && given === cronSecret) return { kind: "cron" };

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  return { kind: "user", userId: data.user.id };
}

export function publicMediaUrl(path: string | null): string | null {
  if (!path) return null;
  return admin.storage.from("media").getPublicUrl(path).data.publicUrl;
}

export type AccountRow = {
  id: string;
  user_id: string;
  platform: "facebook" | "instagram" | "linkedin" | "tiktok";
  name: string;
  external_id: string;
  active: boolean;
};

export type SecretRow = {
  account_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};
