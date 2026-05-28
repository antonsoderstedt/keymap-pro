/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PulseSignal = {
  label: string;
  value: string;
  delta: number;
  direction: "up" | "down" | "flat";
};

export type DataAge = {
  gsc_days: number | null;
  ga4_days: number | null;
  ads_days: number | null;
};

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function pctDelta(current: number, prev: number) {
  if (prev <= 0 && current <= 0) return 0;
  if (prev <= 0) return 100;
  return ((current - prev) / prev) * 100;
}

function direction(delta: number): "up" | "down" | "flat" {
  if (delta > 1) return "up";
  if (delta < -1) return "down";
  return "flat";
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function useDailyPulse(projectId?: string) {
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<PulseSignal[]>([]);
  const [dataAge, setDataAge] = useState<DataAge>({ gsc_days: null, ga4_days: null, ads_days: null });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const [gscRes, ga4Res, adsRes] = await Promise.all([
          (supabase as any)
            .from("gsc_snapshots")
            .select("rows,totals,created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(2),
          (supabase as any)
            .from("ga4_snapshots")
            .select("totals,created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(2),
          (supabase as any)
            .from("ads_change_proposals")
            .select("status,estimated_impact_sek,created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(200),
        ]);

        const gscRows = gscRes.data || [];
        const ga4Rows = ga4Res.data || [];
        const adsRows = adsRes.data || [];

        const gscLatest = gscRows[0] as any;
        const gscPrev = gscRows[1] as any;
        const gscLatestClicks = toNum(gscLatest?.totals?.clicks) || toNum((gscLatest?.rows || []).reduce((s: number, r: any) => s + toNum(r.clicks), 0));
        const gscPrevClicks = toNum(gscPrev?.totals?.clicks) || toNum((gscPrev?.rows || []).reduce((s: number, r: any) => s + toNum(r.clicks), 0));
        const gscLatestImpr = toNum(gscLatest?.totals?.impressions) || toNum((gscLatest?.rows || []).reduce((s: number, r: any) => s + toNum(r.impressions), 0));
        const gscPrevImpr = toNum(gscPrev?.totals?.impressions) || toNum((gscPrev?.rows || []).reduce((s: number, r: any) => s + toNum(r.impressions), 0));

        const ga4Latest = ga4Rows[0] as any;
        const ga4Prev = ga4Rows[1] as any;
        const ga4LatestSessions = toNum(ga4Latest?.totals?.sessions || ga4Latest?.totals?.screenPageViews || ga4Latest?.totals?.totalUsers);
        const ga4PrevSessions = toNum(ga4Prev?.totals?.sessions || ga4Prev?.totals?.screenPageViews || ga4Prev?.totals?.totalUsers);
        const ga4LatestConv = toNum(ga4Latest?.totals?.conversions);
        const ga4PrevConv = toNum(ga4Prev?.totals?.conversions);

        const pendingAds = adsRows.filter((r: any) => ["proposed", "queued"].includes(String(r.status || "").toLowerCase()));
        const pendingImpact = pendingAds.reduce((s: number, r: any) => s + toNum(r.estimated_impact_sek), 0);

        const computedSignals: PulseSignal[] = [
          {
            label: "Klick",
            value: `${Math.round(pctDelta(gscLatestClicks, gscPrevClicks))}%`,
            delta: pctDelta(gscLatestClicks, gscPrevClicks),
            direction: direction(pctDelta(gscLatestClicks, gscPrevClicks)),
          },
          {
            label: "Impressioner",
            value: `${Math.round(pctDelta(gscLatestImpr, gscPrevImpr))}%`,
            delta: pctDelta(gscLatestImpr, gscPrevImpr),
            direction: direction(pctDelta(gscLatestImpr, gscPrevImpr)),
          },
          {
            label: "Sessioner",
            value: `${Math.round(pctDelta(ga4LatestSessions, ga4PrevSessions))}%`,
            delta: pctDelta(ga4LatestSessions, ga4PrevSessions),
            direction: direction(pctDelta(ga4LatestSessions, ga4PrevSessions)),
          },
          {
            label: "Ads hälsa",
            value: `${pendingAds.length} / ${adsRows.length}`,
            delta: pendingAds.length,
            direction: pendingAds.length > 0 ? "up" : "flat",
          },
        ];

        if (!cancelled) {
          setSignals(computedSignals);
          setDataAge({
            gsc_days: daysSince(gscLatest?.created_at),
            ga4_days: daysSince(ga4Latest?.created_at),
            ads_days: daysSince((adsRows[0] as any)?.created_at),
          });
        }

        void pendingImpact;
        void ga4LatestConv;
        void ga4PrevConv;
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return useMemo(() => ({ loading, signals, dataAge }), [loading, signals, dataAge]);
}
