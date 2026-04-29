import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatMoney, type Currency, isSupportedCurrency } from "@/lib/revenue";
import { Calculator, Database, Settings2, ArrowRight } from "lucide-react";

interface ItemDetails {
  method?: string;
  inputs?: Record<string, any>;
  steps?: { label: string; value: number }[];
  settings?: { avg_order_value: number; conversion_rate_pct: number; gross_margin_pct: number; currency?: string };
  source_table?: string;
  source_id?: string | null;
  source_snapshot?: any;
  measured_at?: string;
}

export interface DrillDownItem {
  title: string;
  value_sek: number;
  source?: string;
  why?: string;
  details?: ItemDetails;
}

const SOURCE_LABELS: Record<string, string> = {
  action_outcomes: "Action-outcome (mätning)",
  gsc_opportunity: "GSC — låg-hängande sökord",
  position_drop: "GSC — positionstapp (snapshot-jämförelse)",
  audit: "Site audit-fynd",
  alert: "Alert",
};

const fmtNum = (v: any) =>
  typeof v === "number"
    ? Number.isInteger(v) ? v.toLocaleString("sv-SE") : v.toFixed(2).replace(".", ",")
    : v == null ? "—" : String(v);

const isMoneyLabel = (label: string) => /värde|sek|kr/i.test(label);

export default function BriefingDrillDown({
  item, kind, open, onOpenChange, currency = "SEK",
}: {
  item: DrillDownItem | null;
  kind: "win" | "risk" | "action";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currency?: Currency;
}) {
  if (!item) return null;
  const d = item.details || {};
  // Item-specifik valuta vinner (för historiska briefingar genererade i annan valuta)
  const itemCurrency: Currency =
    isSupportedCurrency(d.settings?.currency) ? (d.settings!.currency as Currency) : currency;
  const valueLabel = kind === "risk" ? "Värde i risk" : kind === "win" ? "Hämtat värde" : "Potentiellt värde";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl pr-6 leading-snug">{item.title}</DialogTitle>
          {item.why && <DialogDescription className="text-xs">{item.why}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-5">
          {/* Värdeband */}
          <div className="p-4 rounded-md border border-primary/30 bg-primary/5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{valueLabel}</div>
            <div className="font-serif text-3xl text-primary mt-1">
              {item.value_sek > 0 ? formatMoney(item.value_sek, itemCurrency, { compact: false }) : "—"}
            </div>
            {item.source && (
              <Badge variant="outline" className="mt-2 text-[10px]">
                {SOURCE_LABELS[item.source] || item.source}
              </Badge>
            )}
          </div>

          {/* Beräkningsmetod */}
          {d.method && (
            <Section icon={<Calculator className="h-3.5 w-3.5" />} title="Beräkningsmetod">
              <p className="text-sm text-foreground/90 leading-relaxed">{d.method}</p>
            </Section>
          )}

          {/* Inputs */}
          {d.inputs && Object.keys(d.inputs).length > 0 && (
            <Section icon={<Database className="h-3.5 w-3.5" />} title="Indata">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm font-mono">
                {Object.entries(d.inputs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-border/50 py-1">
                    <dt className="text-muted-foreground text-xs">{k}</dt>
                    <dd className="text-right truncate">{fmtNum(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {/* Mellansteg / formel-trace */}
          {d.steps && d.steps.length > 0 && (
            <Section icon={<ArrowRight className="h-3.5 w-3.5" />} title="Beräkningssteg">
              <div className="space-y-1.5">
                {d.steps.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30">
                    <span className="text-muted-foreground text-xs">{i + 1}. {s.label}</span>
                    <span className={`font-mono ${isMoneyLabel(s.label) ? "text-primary font-medium" : ""}`}>
                      {isMoneyLabel(s.label) ? formatMoney(s.value, itemCurrency, { compact: false }) : fmtNum(s.value)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Revenue-settings använda */}
          {d.settings && (
            <Section icon={<Settings2 className="h-3.5 w-3.5" />} title="Revenue-inställningar (vid körning)">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Setting label="AOV" value={`${formatMoney(d.settings.avg_order_value, itemCurrency)}`} />
                <Setting label="CR" value={`${d.settings.conversion_rate_pct}%`} />
                <Setting label="Marginal" value={`${d.settings.gross_margin_pct}%`} />
              </div>
            </Section>
          )}

          {/* Källa / snapshot-meta */}
          {(d.source_table || d.source_snapshot || d.measured_at) && (
            <>
              <Separator />
              <div className="text-[11px] text-muted-foreground space-y-1 font-mono">
                {d.source_table && <div>Källa: <span className="text-foreground/70">{d.source_table}</span></div>}
                {d.source_id && <div>ID: <span className="text-foreground/70">{d.source_id}</span></div>}
                {d.measured_at && <div>Mätt: <span className="text-foreground/70">{new Date(d.measured_at).toLocaleString("sv-SE")}</span></div>}
                {d.source_snapshot && (
                  <div className="pt-1">
                    Snapshot: <span className="text-foreground/70">{JSON.stringify(d.source_snapshot)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {!d.method && !d.inputs && !d.steps?.length && (
            <p className="text-sm text-muted-foreground italic">
              Ingen beräkningsdetalj sparad för detta item — generera om briefingen för att få drill-down.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded border border-border">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-mono mt-0.5">{value}</div>
    </div>
  );
}
