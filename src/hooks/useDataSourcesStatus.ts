import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SourceStatus = "ok" | "stale" | "error" | "reauth_required" | "not_connected";
export type SourceKey = "ga4" | "gsc" | "ads";

export interface SourceInfo {
  source: SourceKey;
  status: SourceStatus;
  reason: string | null;
  scope_ok: boolean;
  token_expired: boolean;
  selection: { id: string | null; name: string | null; label: string };
  last_synced_at: string | null;
  last_error: string | null;
  ttl_seconds: number;
  age_seconds: number | null;
}

export interface DataSourcesPayload {
  generated_at: string;
  google_connected: boolean;
  token_scope: string | null;
  sources: SourceInfo[];
}

export function useDataSourcesStatus(projectId: string | null | undefined) {
  const [data, setData] = useState<DataSourcesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: payload, error: err } = await supabase.functions.invoke("data-sources-status", {
        body: { project_id: projectId },
      });
      if (err) throw err;
      setData(payload as DataSourcesPayload);
    } catch (e: any) {
      setError(e?.message || "Kunde inte hämta status");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: re-fetch when status row ändras
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`data_source_status:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "data_source_status", filter: `project_id=eq.${projectId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  return { data, loading, error, refresh };
}

export function useSourceStatus(projectId: string | null | undefined, source: SourceKey) {
  const { data, loading, refresh } = useDataSourcesStatus(projectId);
  const info = data?.sources.find((s) => s.source === source) ?? null;
  return { info, loading, refresh };
}
