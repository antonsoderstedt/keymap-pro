// Google OAuth: start + callback flow
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLIENT_ID = requireEnv("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/adwords",
  "openid",
  "email",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  try {
    // ---- START: build auth URL ----
    if (path === "start") {
      const userId = await getUserId(req);
      if (!userId) return json({ error: "Not authenticated" }, 401);

      const state = btoa(JSON.stringify({ uid: userId, ts: Date.now() }));
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    // ---- CALLBACK: exchange code, store tokens, redirect ----
    if (path === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const origin = url.searchParams.get("origin") || "";
      if (!code || !state) return new Response("Missing code/state", { status: 400 });

      const { uid } = JSON.parse(atob(state));

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tok = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("Token exchange failed", tok);
        return new Response(`Token exchange failed: ${JSON.stringify(tok)}`, { status: 400 });
      }

      const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { error } = await admin.from("google_tokens").upsert({
        user_id: uid,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: expiresAt,
        scope: tok.scope,
      }, { onConflict: "user_id" });
      if (error) {
        console.error("DB upsert failed", error);
        return new Response(`DB error: ${error.message}`, { status: 500 });
      }

      // Redirect back to app
      const redirectTo = `${origin || "https://id-preview--6f653bb9-6e58-44be-81c8-3c806443b232.lovable.app"}/dashboard?google=connected`;
      return new Response(null, { status: 302, headers: { Location: redirectTo } });
    }

    // ---- STATUS: is the current user connected? ----
    if (path === "status") {
      const userId = await getUserId(req);
      if (!userId) return json({ connected: false });
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data } = await admin.from("google_tokens").select("scope, expires_at").eq("user_id", userId).maybeSingle();
      return json({ connected: !!data, scope: data?.scope, expires_at: data?.expires_at });
    }

    // ---- DISCONNECT ----
    if (path === "disconnect") {
      const userId = await getUserId(req);
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      await admin.from("google_tokens").delete().eq("user_id", userId);
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  } catch (e) {
    console.error("google-oauth error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUserId(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  const supa = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await supa.auth.getClaims(token);

  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
