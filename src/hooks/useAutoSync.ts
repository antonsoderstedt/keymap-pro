// Auto-refresh hook: fetches fresh data for all connected sources on mount,
// on tab focus/visibility, and at scheduled intervals while the tab is open.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 min
const MIN_GAP_MS = 60 * 1000; // never run more often than once per minute

interface Selections {
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  ads_customer_id: string | null;
}

async function loadSelections(projectId: string): Promise<Selections | null> {
  const { data } = await supabase
    .from("project_google_settings")
    .select("ga4_property_id, gsc_site_url, ads_customer_id")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as Selections) ?? null;
}

async function refreshAllSources(projectId: string): Promise<void> {
  const sel = await loadSelections(projectId);
  if (!sel) return;

  const tasks: Promise<unknown>[] = [];

  if (sel.ga4_property_id) {
    tasks.push(
      supabase.functions.invoke("ga4-fetch", {
        body: {
          action: "report",
          projectId,
          propertyId: sel.ga4_property_id,
          startDate: "7daysAgo",
          endDate: "today",
          dimensions: [{ name: "date" }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }],
          limit: 1,
        },
      }).catch(() => null),
    );
  }

  if (sel.gsc_site_url) {
    const today = new Date();
    const end = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const start = new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    tasks.push(
      supabase.functions.invoke("gsc-fetch", {
        body: {
          action: "query",
          projectId,
          siteUrl: sel.gsc_site_url,
          startDate: start,
          endDate: end,
          dimensions: ["date"],
          rowLimit: 1,
        },
      }).catch(() => null),
    );
  }

  if (sel.ads_customer_id) {
    tasks.push(
      supabase.functions
        .invoke("ads-diagnose", { body: { project_id: projectId, force: true } })
        .catch(() => null),
    );
  }

  await Promise.allSettled(tasks);
}

export function useAutoSync(projectId: string | undefined | null) {
  const lastRunRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const run = async (reason: string) => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (now - lastRunRef.current < MIN_GAP_MS) return;
      inFlightRef.current = true;
      lastRunRef.current = now;
      try {
        if (import.meta.env.DEV) console.debug(`[auto-sync] ${reason}`);
        await refreshAllSources(projectId);
      } finally {
        if (!cancelled) inFlightRef.current = false;
      }
    };

    // Initial run on mount / project switch
    run("mount");

    // Periodic refresh while tab open
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") run("interval");
    }, REFRESH_INTERVAL_MS);

    // Refresh when tab regains focus
    const onVisibility = () => {
      if (document.visibilityState === "visible") run("visibility");
    };
    const onFocus = () => run("focus");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [projectId]);
}
