import { supabase } from "@/integrations/supabase/client";

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
    throw new Error(payload?.error || `Google OAuth misslyckades (${response.status})`);
  }

  return payload as T;
}
