import { supabase } from "@/integrations/supabase/client";
import { handleGoogleReauthError } from "@/lib/googleReauth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type GoogleOauthPath = "start" | "status" | "disconnect";

export async function invokeGoogleOauth<T = unknown>(path: GoogleOauthPath): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (sessionError || !token) {
    throw new Error("Du behöver vara inloggad för att koppla Google.");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/google-oauth/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = new Error(payload?.error || `Google OAuth misslyckades (${response.status})`);
    handleGoogleReauthError(err);
    throw err;
  }

  return payload as T;
}

/**
 * Full reconnect flow: tear down existing google_tokens row and immediately
 * start a fresh OAuth consent flow. Redirects the browser to Google.
 */
export async function reconnectGoogle(): Promise<void> {
  // Best-effort cleanup of stale token row (ignore "already gone" errors)
  try {
    await invokeGoogleOauth("disconnect");
  } catch (e) {
    console.warn("[reconnectGoogle] disconnect failed (continuing):", e);
  }
  const { url } = await invokeGoogleOauth<{ url?: string }>("start");
  if (!url) throw new Error("Kunde inte starta Google OAuth — ingen URL returnerades.");
  // Bryt ut ur ev. iframe (t.ex. Lovable preview) — annars blockerar Google med 403.
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // Cross-origin iframe — öppna i ny flik istället
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(url);
}

