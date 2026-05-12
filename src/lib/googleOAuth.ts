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
  openOAuthUrl(url);
}

/**
 * Öppnar Google OAuth-URL på ett sätt som funkar både i Lovable preview-iframe
 * och i fristående fönster. Returnerar true om navigation startades, annars
 * kastar fel som beskriver att popup blockerades.
 */
export function openOAuthUrl(url: string): void {
  const inIframe = (() => { try { return window.top !== window.self; } catch { return true; } })();

  if (inIframe) {
    // 1) Försök öppna i ny flik (kräver att klicket räknas som user-gesture)
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) return;
    // 2) Popup blockerad — försök bryta ut ur iframen via _top
    try {
      const a = document.createElement("a");
      a.href = url; a.target = "_top"; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); a.remove();
      return;
    } catch {
      throw new Error("Popup blockerades. Tillåt popups för Lovable-preview, eller öppna appen i en egen flik och försök igen.");
    }
  }

  window.location.assign(url);
}

