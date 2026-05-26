import { useParams, Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowRight } from "lucide-react";

import { usePerformanceData } from "@/hooks/usePerformanceData";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";
import { useSourceFallback } from "@/components/workspace/SourceFallback";

import { PerformanceHeader } from "@/components/workspace/performance/PerformanceHeader";
import { ExecutiveSummary } from "@/components/workspace/performance/ExecutiveSummary";
import { PrioritizedActions } from "@/components/workspace/performance/PrioritizedActions";
import { SeoOpportunities } from "@/components/workspace/performance/SeoOpportunities";

import { PerformanceKpis } from "@/components/workspace/PerformanceKpis";
import { PerformanceTrendChart } from "@/components/workspace/PerformanceTrendChart";
import DiagnosisPanel from "@/components/workspace/DiagnosisPanel";

function fmt(n: number | null | undefined, opts?: { pct?: boolean; decimals?: number }) {
  if (n == null || !isFinite(n)) return "—";
  if (opts?.pct) return (n * 100).toFixed(opts.decimals ?? 1) + "%";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "k";
  return Math.round(n).toLocaleString("sv-SE");
}

export default function Performance() {
  const { id: projectId } = useParams<{ id: string }>();
  const caps = useProjectCapabilities(projectId);
  const bundle = usePerformanceData(projectId);

  const seoFallback = useSourceFallback({
    projectId: projectId ?? "",
    source: "gsc",
    hasData: bundle.seo.hasData,
  });
  const ga4Fallback = useSourceFallback({
    projectId: projectId ?? "",
    source: "ga4",
    hasData: bundle.ga4.hasData,
  });
  const adsFallback = useSourceFallback({
    projectId: projectId ?? "",
    source: "ads",
    hasData: true,
  });

  if (!projectId) return <Skeleton className="m-6 h-64" />;

  // Senast uppdaterad = nyaste av snapshotsen
  const lastUpdated = [bundle.seo.snapshotAt, bundle.ga4.snapshotAt, bundle.ads.auditAt]
    .filter(Boolean)
    .sort()
    .reverse()[0] as string | null;

  const ga4 = bundle.ga4.totals as any;
  const ga4Items = ga4
    ? [
        { label: "Sessioner", value: fmt(Number(ga4.sessions)) },
        { label: "Användare", value: fmt(Number(ga4.totalUsers ?? ga4.users)) },
        { label: "Konv.", value: fmt(Number(ga4.conversions)) },
        { label: "Sidvisningar", value: fmt(Number(ga4.screenPageViews ?? ga4.pageviews)) },
      ]
    : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:py-10 space-y-8">
      <PerformanceHeader
        projectId={projectId}
        projectName={bundle.projectName}
        range={bundle.range}
        onRangeChange={bundle.setRange}
        rangeDays={bundle.rangeDays}
        lastUpdatedIso={lastUpdated}
      />

      {bundle.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* Executive summary */}
          <ExecutiveSummary
            current={bundle.seo.kpisCurrent}
            previous={bundle.seo.kpisPrevious}
            adsHealth={bundle.ads.healthScore}
            ga4HasData={bundle.ga4.hasData}
            rangeDays={bundle.rangeDays}
          />

          {/* Prioriterade åtgärder högt upp */}
          <PrioritizedActions projectId={projectId} actions={bundle.priorityActions} />

          {/* SEO KPI-rad med delta */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-medium tracking-tight">SEO — nyckeltal</h2>
              {bundle.seo.snapshotAt && (
                <span className="text-xs text-muted-foreground">
                  vs föregående {bundle.rangeDays} dagar
                </span>
              )}
            </div>
            {seoFallback.state === "block" ? (
              seoFallback.node
            ) : !bundle.seo.hasData ? (
              seoFallback.node
            ) : (
              <>
                {seoFallback.node}
                <PerformanceKpis
                  current={bundle.seo.kpisCurrent}
                  previous={bundle.seo.kpisPrevious}
                />
              </>
            )}
          </section>

          {/* Trendgraf med metric-toggle + annotations */}
          {bundle.seo.hasData && bundle.seo.trendFull.length > 0 && (
            <PerformanceTrendChart
              trend={bundle.seo.trendFull}
              annotations={bundle.seo.annotations}
            />
          )}

          {/* SEO-möjligheter */}
          {bundle.seo.rankings.length > 0 && (
            <SeoOpportunities projectId={projectId} rankings={bundle.seo.rankings} />
          )}

          {/* Google Ads — diagnos + länk till Account Intelligence */}
          {caps.hasAds && (
            <section className="space-y-4 border-t border-border/40 pt-8">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-medium tracking-tight">Google Ads</h2>
                  {bundle.ads.healthScore != null && (
                    <span className="text-xs text-muted-foreground">
                      Hälsa: {bundle.ads.healthScore} %
                    </span>
                  )}
                </div>
                <Link
                  to={`/clients/${projectId}/account-intelligence`}
                  className="text-xs text-primary underline-offset-4 hover:underline flex items-center gap-1"
                >
                  Öppna Account Intelligence <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {adsFallback.state === "block" ? (
                adsFallback.node
              ) : (
                <>
                  {adsFallback.node}
                  <DiagnosisPanel projectId={projectId} />
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Audit, kampanjstruktur och budgetfördelning finns i{" "}
                <Link
                  to={`/clients/${projectId}/account-intelligence`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Account Intelligence
                </Link>
                . Förslag hanteras i{" "}
                <Link
                  to={`/clients/${projectId}/actions`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Åtgärder
                </Link>
                .
              </p>
            </section>
          )}

          {/* GA4 */}
          <section className="space-y-3 border-t border-border/40 pt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-medium tracking-tight">GA4</h2>
            </div>
            {ga4Fallback.state === "block" ? (
              ga4Fallback.node
            ) : (
              <>
                {ga4Fallback.node}
                {ga4Items && (
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                    {ga4Items.map((m) => (
                      <div key={m.label}>
                        <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {m.label}
                        </dt>
                        <dd className="text-xl tabular-nums tracking-tight">{m.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
