import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AnalysisResult, KeywordUniverse, UniverseKeyword } from "@/lib/types";

export interface WorkspaceAnalysisData {
  analysisId: string | null;
  result: AnalysisResult | null;
  universe: KeywordUniverse | null;
  universeScale: string | null;
  createdAt: string | null;
  source: "analysis" | "prelaunch" | null;
  pending: boolean;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Centraliserad datahämtning för Sökord & innehåll-vyn.
 * - Hämtar senaste completed analys (med result_json)
 * - Detekterar pågående analys (utan result_json) → pending=true + polling var 5:e sek
 * - Faller tillbaka till prelaunch_blueprints om ingen analys finns
 */
export function useWorkspaceAnalysis(projectId: string | undefined): WorkspaceAnalysisData {
  const [state, setState] = useState<Omit<WorkspaceAnalysisData, "refetch">>({
    analysisId: null,
    result: null,
    universe: null,
    universeScale: null,
    createdAt: null,
    source: null,
    pending: false,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  const cancelledRef = useRef(false);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!projectId) return;
    cancelledRef.current = false;

    const load = async () => {
      // Senaste completed analys
      const { data: completed } = await supabase
        .from("analyses")
        .select("id, result_json, keyword_universe_json, universe_scale, created_at")
        .eq("project_id", projectId)
        .not("result_json", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Ev. nyare pågående analys
      const { data: pendingRow } = await supabase
        .from("analyses")
        .select("id, created_at")
        .eq("project_id", projectId)
        .is("result_json", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const pending = !!pendingRow && (!completed ||
        new Date((pendingRow as any).created_at) > new Date((completed as any).created_at));

      if (completed) {
        const r = (completed as any).result_json as AnalysisResult | null;
        const failure = r && typeof r === "object" && "__error" in (r as any)
          ? String((r as any).__error || "") : null;
        if (cancelledRef.current) return;
        setState({
          analysisId: (completed as any).id,
          result: failure ? null : r,
          universe: ((completed as any).keyword_universe_json as KeywordUniverse | null) || null,
          universeScale: (completed as any).universe_scale ?? null,
          createdAt: (completed as any).created_at,
          source: "analysis",
          pending,
          error: failure,
          loading: false,
        });
        return;
      }

      // Pre-launch fallback
      const { data: prelaunch } = await supabase
        .from("prelaunch_blueprints")
        .select("id, created_at, keyword_universe")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prelaunch && (prelaunch as any).keyword_universe) {
        const raw: any = (prelaunch as any).keyword_universe;
        const universe = normalizePrelaunchUniverse(raw);
        if (cancelledRef.current) return;
        setState({
          analysisId: null,
          result: null,
          universe,
          universeScale: "pre-launch",
          createdAt: (prelaunch as any).created_at,
          source: "prelaunch",
          pending,
          error: null,
          loading: false,
        });
        return;
      }

      if (cancelledRef.current) return;
      setState({
        analysisId: pendingRow ? (pendingRow as any).id : null,
        result: null,
        universe: null,
        universeScale: null,
        createdAt: pendingRow ? (pendingRow as any).created_at : null,
        source: null,
        pending,
        error: null,
        loading: false,
      });
    };

    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [projectId, tick]);

  // Polla när pending
  useEffect(() => {
    if (!state.pending || !projectId) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, [state.pending, projectId]);

  return { ...state, refetch };
}

function normalizePrelaunchUniverse(raw: any): KeywordUniverse {
  const keywords: UniverseKeyword[] = Array.isArray(raw?.keywords)
    ? raw.keywords.map((k: any) => ({
        keyword: k.keyword || "",
        cluster: k.cluster || "Övrigt",
        dimension: k.dimension || "produkt",
        intent: k.intent || "informational",
        funnelStage: k.funnelStage || k.funnel_stage || "awareness",
        priority: k.priority || "medium",
        channel: k.channel || "SEO",
        recommendedLandingPage: k.recommendedLandingPage,
        recommendedAdGroup: k.recommendedAdGroup,
        contentIdea: k.contentIdea,
        isNegative: !!k.isNegative,
        searchVolume: k.searchVolume ?? k.search_volume ?? k.volume,
        cpc: k.cpc ?? k.cpc_sek,
        competition: k.competition,
        dataSource: k.dataSource || (k.searchVolume != null ? "real" : "estimated"),
        kd: k.kd,
        serpFeatures: k.serpFeatures || [],
        topRankingDomains: k.topRankingDomains || [],
        competitorGap: !!k.competitorGap,
      }))
    : [];
  return {
    scale: raw?.scale || "focused",
    generatedAt: raw?.generatedAt || new Date().toISOString(),
    totalKeywords: raw?.totalKeywords ?? keywords.length,
    totalEnriched: raw?.totalEnriched ?? keywords.filter((k) => k.dataSource === "real").length,
    cities: raw?.cities || [],
    keywords,
  };
}
