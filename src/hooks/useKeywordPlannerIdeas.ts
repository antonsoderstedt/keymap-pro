import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { KeywordPlannerIdea, KeywordPlannerRun } from "@/lib/types";

export interface KeywordPlannerFetchParams {
  customer_id: string;
  login_customer_id?: string;
  seed_keywords?: string[];
  seed_url?: string;
  language_code?: string;
  location_codes?: string[];
  include_adult?: boolean;
  max_ideas?: number;
}

export interface KeywordPlannerFetchResult {
  ok: boolean;
  run_id?: string;
  count?: number;
  reason?: "reauth_required" | "developer_token_not_approved";
  error?: string;
}

function groupRuns(rows: KeywordPlannerIdea[]): KeywordPlannerRun[] {
  const map = new Map<string, KeywordPlannerRun>();
  for (const row of rows) {
    let run = map.get(row.run_id);
    if (!run) {
      run = {
        run_id: row.run_id,
        fetched_at: row.fetched_at,
        seed_keywords: [],
        seed_url: row.seed_url ?? null,
        count: 0,
        ideas: [],
      };
      map.set(row.run_id, run);
    }
    run.ideas.push(row);
    run.count++;
    if (row.seed_keyword && !run.seed_keywords.includes(row.seed_keyword)) {
      run.seed_keywords.push(row.seed_keyword);
    }
    if (!run.seed_url && row.seed_url) run.seed_url = row.seed_url;
    if (new Date(row.fetched_at).getTime() > new Date(run.fetched_at).getTime()) {
      run.fetched_at = row.fetched_at;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime(),
  );
}

export function useKeywordPlannerIdeas(projectId: string | null | undefined) {
  const [runs, setRuns] = useState<KeywordPlannerRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("keyword_planner_ideas")
        .select("*")
        .eq("project_id", projectId)
        .order("fetched_at", { ascending: false })
        .limit(2000);
      if (err) throw err;
      setRuns(groupRuns((data || []) as unknown as KeywordPlannerIdea[]));
    } catch (e: any) {
      setError(e?.message || "Kunde inte hämta Keyword Planner-data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const fetchIdeas = useCallback(async (params: KeywordPlannerFetchParams): Promise<KeywordPlannerFetchResult> => {
    if (!projectId) return { ok: false, error: "no project" };
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("ads-keyword-planner", {
        body: { project_id: projectId, ...params },
      });
      if (err) throw err;
      const payload = (data || {}) as KeywordPlannerFetchResult;
      if (payload.ok) await refresh();
      else if (payload.error) setError(payload.error);
      return payload;
    } catch (e: any) {
      const msg = e?.message || "Anrop misslyckades";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, [projectId, refresh]);

  return { runs, loading, error, fetch: fetchIdeas, refresh };
}
