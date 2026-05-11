// Skriver data_source_status via SECURITY DEFINER-RPC. Rollar med service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type SourceStatus = "ok" | "stale" | "error" | "reauth_required" | "not_connected";
export type SourceKey = "ga4" | "gsc" | "ads" | "firecrawl" | "dataforseo" | "lovable_ai";

export async function markSourceStatus(opts: {
  projectId: string;
  source: SourceKey;
  status: SourceStatus;
  lastError?: string | null;
  meta?: Record<string, unknown>;
  bumpSynced?: boolean;
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);
    await sb.rpc("mark_source_status", {
      _project_id: opts.projectId,
      _source: opts.source,
      _status: opts.status,
      _last_error: opts.lastError ?? null,
      _meta: opts.meta ?? {},
      _bump_synced: opts.bumpSynced ?? true,
    });
  } catch (e) {
    console.error("markSourceStatus failed", e);
  }
}

export function classifyGoogleError(message: string): SourceStatus {
  if (!message) return "error";
  if (
    /GOOGLE_NOT_CONNECTED|Google not connected/.test(message) ||
    /no.*token/i.test(message)
  ) {
    return "not_connected";
  }
  if (
    /MISSING_(ADS|GA4|GSC)_SCOPE|GOOGLE_REAUTH_REQUIRED|OAUTH_INVALID|invalid_grant|Token has been expired or revoked|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|insufficientPermissions/i
      .test(message)
  ) {
    return "reauth_required";
  }
  return "error";
}
