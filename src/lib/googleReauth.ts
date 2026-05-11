import { toast } from "sonner";

export const GOOGLE_REAUTH_EVENT = "google-reauth-required";

export function isGoogleReauthError(err: unknown): boolean {
  const msg = extractMessage(err);
  return /GOOGLE_REAUTH_REQUIRED|invalid_grant|Token has been expired or revoked|Google not connected/i.test(msg);
}

export function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    const anyErr = err as any;
    return anyErr?.message || anyErr?.error?.message || anyErr?.error || JSON.stringify(err);
  } catch {
    return String(err);
  }
}

let lastFiredAt = 0;
export function notifyGoogleReauthRequired(opts?: { message?: string }) {
  const now = Date.now();
  if (now - lastFiredAt < 1500) return; // de-dupe rapid bursts
  lastFiredAt = now;

  const detail = {
    message:
      opts?.message ||
      "Din Google-anslutning har gått ut eller återkallats. Koppla om Google för att fortsätta hämta GSC, GA4 och Ads-data.",
  };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GOOGLE_REAUTH_EVENT, { detail }));
  }
  toast.error("Google-anslutning krävs", {
    description: detail.message,
    duration: 8000,
  });
}

/**
 * Helper: pass any caught error. Returns true if it was a Google reauth error
 * (and triggers banner+toast). Lets callers `if (handleGoogleReauthError(e)) return;`.
 */
export function handleGoogleReauthError(err: unknown): boolean {
  if (!isGoogleReauthError(err)) return false;
  notifyGoogleReauthRequired({ message: extractMessage(err) });
  return true;
}
