// Pre-launch ads-plan exporter — Fas 5
// Konverterar prelaunch_blueprints.ads_plan till Google Ads Editor CSV.

export interface AdsPlanCampaign {
  name: string;
  daily_budget_sek?: number;
  ad_groups: Array<{
    name: string;
    keywords: Array<{ text: string; match_type?: "BROAD" | "PHRASE" | "EXACT"; max_cpc?: number }>;
    headlines?: string[];
    descriptions?: string[];
    final_url?: string;
  }>;
  negatives?: string[];
}

export interface AdsPlan {
  campaigns: AdsPlanCampaign[];
  default_daily_budget?: number;
}

const esc = (v: string | number | undefined | null) => {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};
const row = (cols: (string | number | undefined | null)[]) => cols.map(esc).join(",");

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

      for (const kw of ag.keywords || []) {
        const text =
          kw.match_type === "EXACT" ? `[${kw.text}]` :
          kw.match_type === "PHRASE" ? `"${kw.text}"` :
          kw.text;
        lines.push(row([
          camp.name,
          "Search",
          budget,
          "Manual CPC",
          ag.name,
          text,
          kw.match_type || "BROAD",
          kw.max_cpc ?? "",
          h1 ?? "", h2 ?? "", h3 ?? "",
          d1 ?? "", d2 ?? "",
          ag.final_url ?? "",
          "Paused",
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
