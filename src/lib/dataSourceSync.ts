import { supabase } from "@/integrations/supabase/client";
import type { SourceInfo } from "@/hooks/useDataSourcesStatus";

type SyncLabel = "GA4" | "Search Console" | "Google Ads";

export interface DataSourceSyncResult {
  synced: SyncLabel[];
  skipped: string[];
  failed: string[];
}

function rangeDates(days = 28) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function hasSource(sources: SourceInfo[], key: SourceInfo["source"]) {
  const source = sources.find((s) => s.source === key);
  return !!source?.selection?.id;
}

export async function syncProjectDataSources(
  projectId: string,
  sources: SourceInfo[],
): Promise<DataSourceSyncResult> {
  const result: DataSourceSyncResult = { synced: [], skipped: [], failed: [] };
  const { startDate, endDate } = rangeDates(28);

  const { data: settings, error: settingsError } = await supabase
    .from("project_google_settings")
    .select("ga4_property_id, gsc_site_url, ads_customer_id")
    .eq("project_id", projectId)
    .maybeSingle();

  if (settingsError) throw settingsError;

  const ga4PropertyId = (settings as any)?.ga4_property_id as string | undefined;
  if (ga4PropertyId && hasSource(sources, "ga4")) {
    const propertyId = ga4PropertyId.replace("properties/", "");
    const { data, error } = await supabase.functions.invoke("ga4-fetch", {
      body: {
        action: "report",
        projectId,
        propertyId,
        startDate,
        endDate,
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "conversions" },
        ],
        limit: 365,
        persist: true,
      },
    });
    if (error || (data as any)?.error) result.failed.push(`GA4: ${(data as any)?.error || error?.message}`);
    else result.synced.push("GA4");
  } else {
    result.skipped.push("GA4 saknar vald property");
  }

  const gscSiteUrl = (settings as any)?.gsc_site_url as string | undefined;
  if (gscSiteUrl && hasSource(sources, "gsc")) {
    const { data, error } = await supabase.functions.invoke("gsc-fetch", {
      body: {
        action: "query",
        projectId,
        siteUrl: gscSiteUrl,
        startDate,
        endDate,
        dimensions: ["date", "query"],
        rowLimit: 5000,
      },
    });
    if (error || (data as any)?.error) {
      result.failed.push(`Search Console: ${(data as any)?.error || error?.message}`);
    } else {
      const rawRows = ((data as any)?.rows || []) as any[];
      if (rawRows.length) {
        const rows = rawRows.map((r) => ({
          date: r.keys?.[0],
          query: r.keys?.[1],
          keys: r.keys,
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          ctr: r.ctr || 0,
          position: r.position || 0,
        }));
        const totals = rows.reduce(
          (acc, r) => ({ clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions }),
          { clicks: 0, impressions: 0 },
        );
        await supabase.from("gsc_snapshots").insert({
          project_id: projectId,
          site_url: gscSiteUrl,
          start_date: startDate,
          end_date: endDate,
          rows,
          totals,
        });
      }
      result.synced.push("Search Console");
    }
  } else {
    result.skipped.push("Search Console saknar vald site");
  }

  const adsCustomerId = (settings as any)?.ads_customer_id as string | undefined;
  if (adsCustomerId && hasSource(sources, "ads")) {
    const { data, error } = await supabase.functions.invoke("ads-fetch-account-tree", {
      body: { project_id: projectId, force: true },
    });
    if (error || (data as any)?.error) result.failed.push(`Google Ads: ${(data as any)?.error || error?.message}`);
    else result.synced.push("Google Ads");
  } else {
    result.skipped.push("Google Ads saknar valt konto");
  }

  return result;
}