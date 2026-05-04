// useProjectGoals — läs/skriv projektets goals med fallback till
// project_revenue_settings för bakåtkompatibilitet.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_GOALS, type ProjectGoals } from "@/lib/goalsEngine";

export function useProjectGoals(projectId: string | null | undefined) {
  const [goals, setGoals] = useState<ProjectGoals>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const { data: g } = await supabase
      .from("project_goals")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    if (g) {
      setGoals({
        conversion_type: g.conversion_type as any,
        conversion_label: g.conversion_label,
        conversion_value: Number(g.conversion_value),
        conversion_rate_pct: Number(g.conversion_rate_pct),
        primary_goal: g.primary_goal as any,
        strategy_split: g.strategy_split as any,
        brand_terms: (g.brand_terms as string[]) || [],
        currency: g.currency || "SEK",
      });
      setExists(true);
    } else {
      // Fallback från project_revenue_settings
      const { data: rev } = await supabase
        .from("project_revenue_settings")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (rev) {
        setGoals({
          ...DEFAULT_GOALS,
          conversion_value: Number(rev.avg_order_value) || DEFAULT_GOALS.conversion_value,
          conversion_rate_pct: Number(rev.conversion_rate_pct) || DEFAULT_GOALS.conversion_rate_pct,
          currency: rev.currency || "SEK",
        });
      }
      setExists(false);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: Partial<ProjectGoals>) => {
    if (!projectId) return;
    const merged: ProjectGoals = { ...goals, ...next };
    const payload = {
      project_id: projectId,
      conversion_type: merged.conversion_type,
      conversion_label: merged.conversion_label,
      conversion_value: merged.conversion_value,
      conversion_rate_pct: merged.conversion_rate_pct,
      primary_goal: merged.primary_goal,
      strategy_split: merged.strategy_split,
      brand_terms: merged.brand_terms,
      currency: merged.currency,
    };
    const { error } = await supabase
      .from("project_goals")
      .upsert(payload, { onConflict: "project_id" });
    if (error) throw error;
    setGoals(merged);
    setExists(true);
  }, [projectId, goals]);

  return { goals, loading, exists, save, reload: load };
}
