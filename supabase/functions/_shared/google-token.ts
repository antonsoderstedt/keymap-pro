// Shared helper: get a valid Google access token for the authenticated user.
// Refreshes via refresh_token when expired.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const CLIENT_ID = requireEnv("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");

export async function getGoogleAccessToken(authHeader: string | null): Promise<string> {
  if (!authHeader) throw new Error("Not authenticated");
  const supa = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: row, error } = await admin
    .from("google_tokens")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !row) throw new Error("Google not connected");

  // Still valid (with 60s buffer)?
  if (new Date(row.expires_at).getTime() - 60_000 > Date.now()) {
    return row.access_token as string;
  }

  // Refresh
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tok = await res.json();
  if (!res.ok) throw new Error(`Refresh failed: ${JSON.stringify(tok)}`);

  const newAccess = tok.access_token as string;
  const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
  await admin.from("google_tokens").update({
    access_token: newAccess,
    expires_at: expiresAt,
  }).eq("user_id", user.id);

  return newAccess;
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
