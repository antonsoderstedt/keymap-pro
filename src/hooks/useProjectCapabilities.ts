// useProjectCapabilities — kollar vilka delar av appen som är aktiverbara
// för ett projekt. Driver sidomeny-låsning och onboarding-checklista.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectCapabilities {
  hasGA4: boolean;
  hasGSC: boolean;
  hasAds: boolean;
  hasAnalysis: boolean;
  hasPrelaunch: boolean;
  hasKeywordUniverse: boolean;
  hasGoals: boolean;
  hasBaseline: boolean;
  hasBrandKit: boolean;
  hasKpiTargets: boolean;
  hasBriefing: boolean;
  loading: boolean;
}

const EMPTY: ProjectCapabilities = {
  hasGA4: false,
  hasGSC: false,
  hasAds: false,
  hasAnalysis: false,
  hasPrelaunch: false,
  hasKeywordUniverse: false,
  hasGoals: false,
  hasBaseline: false,
  hasBrandKit: false,
  hasKpiTargets: false,
  hasBriefing: false,
  loading: true,
};

export function useProjectCapabilities(projectId: string | null | undefined): ProjectCapabilities {
  const [caps, setCaps] = useState<ProjectCapabilities>(EMPTY);

  useEffect(() => {
    if (!projectId) {
      setCaps({ ...EMPTY, loading: false });
      return;
    }
    let cancelled = false;

    async function load() {
      const [gs, analysis, prelaunch, goals, baseline, brand, kpi] = await Promise.all([
        supabase.from("project_google_settings").select("ga4_property_id, gsc_site_url, ads_customer_id").eq("project_id", projectId!).maybeSingle(),
        supabase.from("analyses").select("id, keyword_universe_json").eq("project_id", projectId!).limit(1).maybeSingle(),
        supabase.from("prelaunch_blueprints").select("id, keyword_universe").eq("project_id", projectId!).limit(1).maybeSingle(),
        supabase.from("project_goals").select("id").eq("project_id", projectId!).maybeSingle(),
        supabase.from("project_baselines").select("id").eq("project_id", projectId!).limit(1).maybeSingle(),
        supabase.from("brand_kits").select("id").eq("project_id", projectId!).maybeSingle(),
        supabase.from("kpi_targets").select("id").eq("project_id", projectId!).eq("is_active", true).limit(1).maybeSingle(),
      ]);

      if (cancelled) return;

      const gsRow: any = gs.data || {};
      const hasAnalysis = !!analysis.data?.id;
      const hasPrelaunch = !!prelaunch.data?.id;

      setCaps({
        hasGA4: !!gsRow.ga4_property_id,
        hasGSC: !!gsRow.gsc_site_url,
        hasAds: !!gsRow.ads_customer_id,
        hasAnalysis,
        hasPrelaunch,
        hasKeywordUniverse: hasAnalysis || hasPrelaunch,
        hasGoals: !!goals.data?.id,
        hasBaseline: !!baseline.data?.id,
        hasBrandKit: !!brand.data?.id,
        hasKpiTargets: !!kpi.data?.id,
        hasBriefing: false,
        loading: false,
      });
    }

    load().catch(e => {
      console.error("useProjectCapabilities error", e);
      if (!cancelled) setCaps({ ...EMPTY, loading: false });
    });

    return () => { cancelled = true; };
  }, [projectId]);

  return caps;
}
