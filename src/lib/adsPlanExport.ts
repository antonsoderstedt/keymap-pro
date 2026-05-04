// Pre-launch ads-plan exporter — Fas 5
// Konverterar prelaunch_blueprints.ads_plan till Google Ads Editor CSV.

export interface AdsPlanCampaign {
  name: string;
  type?: string;
  daily_budget_sek?: number;
  ad_groups: Array<{
    name: string;
    match_type?: string;
    keywords: Array<string | { text: string; match_type?: string; max_cpc?: number }>;
    headlines?: string[];
    descriptions?: string[];
    landing_slug?: string;
    final_url?: string;
  }>;
  negatives?: string[];
}

export interface AdsPlan {
  campaigns: AdsPlanCampaign[];
  default_daily_budget?: number;
  negative_keywords?: string[];
  recommended_total_daily_sek?: number;
}

const esc = (v: string | number | undefined | null) => {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};
const row = (cols: (string | number | undefined | null)[]) => cols.map(esc).join(",");

interface NormalizedKw { text: string; match_type: string; max_cpc?: number; }
function normalizeKw(kw: string | { text: string; match_type?: string; max_cpc?: number }, agMatchType?: string): NormalizedKw {
  if (typeof kw === "string") return { text: kw, match_type: agMatchType || "BROAD" };
  return { text: kw.text, match_type: (kw.match_type || agMatchType || "BROAD").toUpperCase(), max_cpc: kw.max_cpc };
}

export function adsPlanToCsv(plan: AdsPlan): string {
  const lines: string[] = [];
  lines.push(row([
    "Campaign", "Campaign Type", "Budget", "Bid Strategy Type",
    "Ad Group", "Keyword", "Match Type", "Max CPC",
    "Headline 1", "Headline 2", "Headline 3",
    "Description 1", "Description 2",
    "Final URL", "Status",
  ]));

  for (const camp of plan.campaigns || []) {
    const budget = camp.daily_budget_sek ?? plan.default_daily_budget ?? 100;
    for (const ag of camp.ad_groups || []) {
      const [h1, h2, h3] = ag.headlines || [];
      const [d1, d2] = ag.descriptions || [];

      for (const rawKw of ag.keywords || []) {
        const kw = normalizeKw(rawKw, ag.match_type);
        const text =
          kw.match_type === "EXACT" ? `[${kw.text}]` :
          kw.match_type === "PHRASE" ? `"${kw.text}"` :
          kw.text;
        const finalUrl = ag.final_url || (ag.landing_slug ? `/${ag.landing_slug}` : "");
        lines.push(row([
          camp.name, "Search", budget, "Manual CPC",
          ag.name, text, kw.match_type, kw.max_cpc ?? "",
          h1 ?? "", h2 ?? "", h3 ?? "",
          d1 ?? "", d2 ?? "",
          finalUrl, "Paused",
        ]));
      }
    }

    for (const neg of camp.negatives || []) {
      lines.push(row([
        camp.name, "Search", budget, "Manual CPC",
        "", `-${neg}`, "BROAD", "", "", "", "", "", "", "", "Paused",
      ]));
    }
  }

  // Plan-level negativa sökord (delade)
  if (plan.negative_keywords?.length) {
    for (const neg of plan.negative_keywords) {
      lines.push(row([
        "_shared", "Search", plan.default_daily_budget ?? 0, "Manual CPC",
        "", `-${neg}`, "BROAD", "", "", "", "", "", "", "", "Paused",
      ]));
    }
  }

  return lines.join("\n");
}

export function downloadAdsPlanCsv(plan: AdsPlan, filename = "ads-plan.csv") {
  const csv = adsPlanToCsv(plan);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
