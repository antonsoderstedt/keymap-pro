// Shared helper: get a valid Google access token for the authenticated user.
// Refreshes via refresh_token when expired.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = requireEnv("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");

interface JwtPayload {
  sub?: string;
  exp?: number;
  aud?: string | string[];
  role?: string;
}

export async function getGoogleAccessToken(authHeader: string | null): Promise<string> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Not authenticated");
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new Error("Not authenticated");

  const userId = await getAuthenticatedUserId(jwt);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: row, error } = await admin
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
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
  }).eq("user_id", userId);

  return newAccess;
}

async function getAuthenticatedUserId(jwt: string): Promise<string> {
  const payload = await verifyJwt(jwt);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);

  if (!payload.sub || !payload.exp || payload.exp * 1000 <= Date.now()) {
    throw new Error("Not authenticated");
  }

  if (!audiences.includes("authenticated") && payload.role !== "authenticated") {
    throw new Error("Not authenticated");
  }

  return payload.sub;
}

async function verifyJwt(jwt: string): Promise<JwtPayload> {
  const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Not authenticated");

  const header = JSON.parse(base64UrlToString(encodedHeader));
  const payload = JSON.parse(base64UrlToString(encodedPayload)) as JwtPayload;

  if (header.alg !== "ES256" || !header.kid) {
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: { user }, error } = await supa.auth.getUser(jwt);
    if (error || !user) throw new Error("Not authenticated");
    return { ...payload, sub: user.id };
  }

  const jwksRes = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  if (!jwksRes.ok) throw new Error("Not authenticated");
  const jwks = await jwksRes.json();
  const jwk = jwks.keys?.find((key: JsonWebKey & { kid?: string }) => key.kid === header.kid);
  if (!jwk) throw new Error("Not authenticated");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!valid) throw new Error("Not authenticated");
  return payload;
}

function base64UrlToString(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
