import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from "recharts";
import { buildDailyTrend, summarizePeriod, lastNDays, type GscRow } from "@/lib/performance";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";
import DiagnosisPanel from "@/components/workspace/DiagnosisPanel";
import AuctionInsights from "./AuctionInsights";
import { CampaignTree } from "@/components/workspace/CampaignTree";
import { AdsResultsTab } from "@/components/workspace/AdsResultsTab";

type Range = "7" | "28" | "90";

interface ChangeEvent {
  ts: string;
  kind: "ads_change" | "action_done";
  label: string;
}

interface PerfData {
  gsc: { rows: GscRow[]; createdAt: string | null } | null;
  ga4: { totals: any; createdAt: string | null } | null;
  changes: ChangeEvent[];
  loading: boolean;
  error: string | null;
}

const ADS_ACTION_LABEL: Record<string, string> = {
  pause_keyword: "Pausade sökord",
  resume_keyword: "Återupptog sökord",
  pause_ad: "Pausade annons",
  add_negative_keyword: "La till negativt sökord",
  replace_rsa_asset: "Ersatte RSA-text",
  rsa_batch: "RSA-batchändring",
  create_rsa: "Skapade RSA-annons",
  create_ad_group: "Skapade annonsgrupp",
  add_keyword: "La till sökord",
};

function usePerformanceData(projectId: string | undefined): PerfData {
  const [data, setData] = useState<PerfData>({
    gsc: null, ga4: null, changes: [], loading: true, error: null,
  });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const [gscRes, ga4Res, mutsRes, actsRes] = await Promise.all([
        supabase.from("gsc_snapshots")
          .select("rows,created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle(),
        supabase.from("ga4_snapshots")
          .select("totals,created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle(),
        supabase.from("ads_mutations")
          .select("id,action_type,status,created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase.from("action_items")
          .select("id,title,implemented_at")
          .eq("project_id", projectId)
          .not("implemented_at", "is", null)
          .order("implemented_at", { ascending: false })
          .limit(12),
      ]);
      if (cancelled) return;

      const error =
        gscRes.error?.message || ga4Res.error?.message ||
        mutsRes.error?.message || actsRes.error?.message || null;

      const changes: ChangeEvent[] = [];
      for (const m of (mutsRes.data ?? [])) {
        if (m.status !== "success" && m.status !== "pushed") continue;
        changes.push({
          ts: m.created_at,
          kind: "ads_change",
          label: ADS_ACTION_LABEL[m.action_type] ?? m.action_type,
        });
      }
      for (const a of (actsRes.data ?? [])) {
        if (!a.implemented_at) continue;
        changes.push({
          ts: a.implemented_at,
          kind: "action_done",
          label: a.title,
        });
      }
      changes.sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());

      setData({
        gsc: gscRes.data ? { rows: (gscRes.data.rows as unknown as GscRow[]) ?? [], createdAt: gscRes.data.created_at } : null,
        ga4: ga4Res.data ? { totals: ga4Res.data.totals, createdAt: ga4Res.data.created_at } : null,
        changes: changes.slice(0, 8),
        loading: false,
        error,
      });
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  return data;
}

function fmt(n: number | null | undefined, opts?: { pct?: boolean; decimals?: number }) {
  if (n == null || !isFinite(n)) return "—";
  if (opts?.pct) return (n * 100).toFixed(opts.decimals ?? 1) + "%";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "k";
  return Math.round(n).toLocaleString("sv-SE");
}

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "nyss";
  if (d < 3600) return `${Math.round(d / 60)} min`;
  if (d < 86_400) return `${Math.round(d / 3600)} h`;
  return `${Math.round(d / 86_400)} d`;
}

function MetricStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-3">
      {items.map((m) => (
        <div key={m.label} className="space-y-0.5">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {m.label}
          </dt>
          <dd className="text-xl tabular-nums tracking-tight">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionHeader({
  title, status,
}: { title: string; status?: string | null }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="text-base font-medium tracking-tight">{title}</h2>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </div>
  );
}

function MutedNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Collapsible underavdelning — håller Performance läsbar när Ads är aktivt. */
function SubSection({
  title, defaultOpen = false, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border/40 pt-4">
      <CollapsibleTrigger className="flex w-full items-center justify-between text-left group">
        <span className="text-sm font-medium text-foreground/90 group-hover:text-foreground">
          {title}
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export default function Performance() {
  const { id: projectId } = useParams<{ id: string }>();
  const [range, setRange] = useState<Range>("28");
  const { gsc, ga4, changes, loading, error } = usePerformanceData(projectId);
  const caps = useProjectCapabilities(projectId);

  const seo = useMemo(() => {
    if (!gsc) return null;
    const trend = buildDailyTrend(gsc.rows);
    const windowed = lastNDays(trend, parseInt(range));
    const kpis = summarizePeriod(windowed, []);
    return { trend: windowed, kpis };
  }, [gsc, range]);

  const ga4Totals = (ga4?.totals ?? null) as any;
  const ga4Items = ga4Totals ? [
    { label: "Sessioner", value: fmt(Number(ga4Totals.sessions)) },
    { label: "Användare", value: fmt(Number(ga4Totals.totalUsers ?? ga4Totals.users)) },
    { label: "Konv.", value: fmt(Number(ga4Totals.conversions)) },
    { label: "Sidvisningar", value: fmt(Number(ga4Totals.screenPageViews ?? ga4Totals.pageviews)) },
  ] : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:py-14 space-y-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Performance</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            En läsbar översikt över SEO, Ads och GA4.
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {(["7", "28", "90"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full px-2.5 py-0.5 transition-colors",
                range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </header>

      {/* SEO */}
      <section className="space-y-5 border-b border-border/40 pb-10">
        <SectionHeader
          title="SEO"
          status={gsc?.createdAt ? `Uppdaterad ${relTime(gsc.createdAt)} sedan` : null}
        />
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : !gsc ? (
          <MutedNote>Google Search Console ej ansluten.</MutedNote>
        ) : (
          <>
            <MetricStrip items={[
              { label: "Klick", value: fmt(seo!.kpis.clicks) },
              { label: "Impressions", value: fmt(seo!.kpis.impressions) },
              { label: "CTR", value: fmt(seo!.kpis.ctr, { pct: true, decimals: 2 }) },
              { label: "Snittpos.", value: seo!.kpis.position ? seo!.kpis.position.toFixed(1) : "—" },
              { label: "Topp 10", value: fmt(seo!.kpis.topTenShare, { pct: true, decimals: 0 }) },
            ]} />
            {seo!.trend.length > 0 && (
              <div className="h-32 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={seo!.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="seoArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6, fontSize: 12,
                      }}
                      labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    />
                    <Area
                      type="monotone" dataKey="clicks"
                      stroke="hsl(var(--primary))" strokeWidth={1.5}
                      fill="url(#seoArea)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </section>

      {/* Ads — konsoliderad i Performance (Sprint 3) */}
      {caps.hasAds && projectId && (
        <section className="space-y-6 border-b border-border/40 pb-10">
          <SectionHeader title="Google Ads" />
          <DiagnosisPanel projectId={projectId} />
          <SubSection title="Auction Insights">
            <AuctionInsights />
          </SubSection>
          <SubSection title="Kampanjstruktur">
            <CampaignTree projectId={projectId} />
          </SubSection>
          <SubSection title="Senaste ändringars effekt">
            <AdsResultsTab projectId={projectId} />
          </SubSection>
          <p className="text-xs text-muted-foreground">
            Förslag och audit hanteras i{" "}
            <Link to={`/clients/${projectId}/actions`} className="underline-offset-4 hover:underline text-foreground">
              Åtgärder
            </Link>.
          </p>
        </section>
      )}

      {/* GA4 */}
      <section className="space-y-5 border-b border-border/40 pb-10">
        <SectionHeader
          title="GA4"
          status={ga4?.createdAt ? `Uppdaterad ${relTime(ga4.createdAt)} sedan` : null}
        />
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : !ga4Items ? (
          <MutedNote>GA4 ej ansluten.</MutedNote>
        ) : (
          <MetricStrip items={ga4Items} />
        )}
      </section>

      {/* Changes */}
      <section className="space-y-3">
        <SectionHeader title="Senaste ändringar" />
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : error && changes.length === 0 ? (
          <MutedNote>Kunde inte ladda ändringar.</MutedNote>
        ) : changes.length === 0 ? (
          <MutedNote>Inga registrerade ändringar ännu.</MutedNote>
        ) : (
          <ul className="divide-y divide-border/40">
            {changes.map((c, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-sm text-foreground/90 truncate">{c.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {relTime(c.ts)} sedan
                </span>
              </li>
            ))}
            <li className="pt-3">
              <Link
                to={`/clients/${projectId}/actions`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Visa alla åtgärder →
              </Link>
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}
