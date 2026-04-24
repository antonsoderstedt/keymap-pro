import JSZip from "jszip";
import type { KeywordUniverse, UniverseKeyword, AdDraft } from "./types";

export interface ExportConfig {
  dailyBudgetSek: number;
  bidStrategy: "Manual CPC" | "Maximize Clicks" | "Maximize Conversions" | "Target CPA";
  targetCpaSek?: number;
  includeBroadMatch: boolean;
  groupBy: "intent" | "cluster";
  includeAds: boolean;
  locations: string[];          // e.g. ["Sweden"]
  language: "Swedish" | "English";
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  dailyBudgetSek: 100,
  bidStrategy: "Manual CPC",
  includeBroadMatch: false,
  groupBy: "cluster",
  includeAds: true,
  locations: ["Sweden"],
  language: "Swedish",
};

const csvEscape = (v: string | number | undefined | null) => {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};

const toRow = (cols: (string | number | undefined | null)[]) =>
  cols.map(csvEscape).join(",");

const sanitizeCampaign = (s: string) =>
  s.replace(/[|]/g, " ").trim();

interface CampaignBuild {
  name: string;
  keywords: UniverseKeyword[];
  negatives: UniverseKeyword[];
}

function buildCampaigns(universe: KeywordUniverse, cfg: ExportConfig): CampaignBuild[] {
  const eligible = universe.keywords.filter((k) =>
    !k.isNegative && (k.searchVolume ?? 0) > 0 && k.channel === "Google Ads"
  );
  const negatives = universe.keywords.filter((k) => k.isNegative);

  const groups = new Map<string, UniverseKeyword[]>();
  for (const k of eligible) {
    const key = cfg.groupBy === "intent"
      ? `${k.intent === "transactional" ? "Transactional" : k.intent === "commercial" ? "Commercial" : "Other"}-SE`
      : sanitizeCampaign(`${k.cluster}-SE`);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(k);
  }

  const campaigns: CampaignBuild[] = [];
  for (const [name, kws] of groups.entries()) {
    if (kws.length === 0) continue;
    campaigns.push({ name, keywords: kws, negatives });
  }
  return campaigns;
}

function adGroupName(k: UniverseKeyword) {
  return sanitizeCampaign(k.recommendedAdGroup || k.cluster);
}

function maxCpc(k: UniverseKeyword) {
  const base = k.cpc ?? 0;
  const bid = Math.max(base * 1.2, 5);
  return Math.round(bid * 100) / 100;
}

export async function buildGoogleAdsEditorZip(
  universe: KeywordUniverse,
  cfg: ExportConfig,
  ads: AdDraft[] = [],
): Promise<Blob> {
  const campaigns = buildCampaigns(universe, cfg);
  const zip = new JSZip();

  // 1. campaigns.csv
  const campaignRows: string[] = [
    toRow(["Campaign", "Budget", "Bid Strategy Type", "Campaign Type", "Networks", "Languages", "Locations", "Status"]),
  ];
  for (const c of campaigns) {
    campaignRows.push(toRow([
      c.name,
      cfg.dailyBudgetSek.toFixed(2),
      cfg.bidStrategy,
      "Search",
      "Google search",
      cfg.language,
      cfg.locations.join("; "),
      "Paused",
    ]));
  }
  zip.file("campaigns.csv", "\uFEFF" + campaignRows.join("\n"));

  // 2. ad_groups.csv
  const adGroupRows: string[] = [toRow(["Campaign", "Ad Group", "Max CPC", "Status"])];
  const seenAg = new Set<string>();
  for (const c of campaigns) {
    for (const k of c.keywords) {
      const ag = adGroupName(k);
      const key = `${c.name}|${ag}`;
      if (seenAg.has(key)) continue;
      seenAg.add(key);
      const adGroupKws = c.keywords.filter((x) => adGroupName(x) === ag);
      const avgCpc = adGroupKws.reduce((s, x) => s + maxCpc(x), 0) / Math.max(adGroupKws.length, 1);
      adGroupRows.push(toRow([c.name, ag, avgCpc.toFixed(2), "Paused"]));
    }
  }
  zip.file("ad_groups.csv", "\uFEFF" + adGroupRows.join("\n"));

  // 3. keywords.csv
  const keywordRows: string[] = [
    toRow(["Campaign", "Ad Group", "Keyword", "Match Type", "Max CPC", "Final URL", "Status"]),
  ];
  for (const c of campaigns) {
    for (const k of c.keywords) {
      const ag = adGroupName(k);
      const url = k.recommendedLandingPage
        ? (k.recommendedLandingPage.startsWith("http") ? k.recommendedLandingPage : `https://example.com${k.recommendedLandingPage}`)
        : "";
      const cpcStr = maxCpc(k).toFixed(2);
      keywordRows.push(toRow([c.name, ag, k.keyword, "Exact", cpcStr, url, "Paused"]));
      keywordRows.push(toRow([c.name, ag, k.keyword, "Phrase", cpcStr, url, "Paused"]));
      if (cfg.includeBroadMatch) {
        keywordRows.push(toRow([c.name, ag, k.keyword, "Broad", cpcStr, url, "Paused"]));
      }
    }
  }
  zip.file("keywords.csv", "\uFEFF" + keywordRows.join("\n"));

  // 4. negative_keywords.csv (campaign-level)
  const negRows: string[] = [
    toRow(["Campaign", "Ad Group", "Keyword", "Match Type", "Status"]),
  ];
  for (const c of campaigns) {
    for (const n of c.negatives) {
      negRows.push(toRow([c.name, "", n.keyword, "Phrase", "Enabled"]));
    }
  }
  zip.file("negative_keywords.csv", "\uFEFF" + negRows.join("\n"));

  // 5. responsive_search_ads.csv
  if (cfg.includeAds && ads.length > 0) {
    const adsByGroup = new Map<string, AdDraft>();
    ads.forEach((a) => adsByGroup.set(a.ad_group, a));

    const headers = ["Campaign", "Ad Group"];
    for (let i = 1; i <= 15; i++) headers.push(`Headline ${i}`);
    for (let i = 1; i <= 4; i++) headers.push(`Description ${i}`);
    headers.push("Final URL", "Path 1", "Path 2", "Status");

    const adRows: string[] = [toRow(headers)];
    for (const c of campaigns) {
      const groupSet = new Set(c.keywords.map(adGroupName));
      for (const ag of groupSet) {
        const ad = adsByGroup.get(ag);
        if (!ad) continue;
        const cols: (string | number)[] = [c.name, ag];
        for (let i = 0; i < 15; i++) cols.push(ad.payload.headlines[i] || "");
        for (let i = 0; i < 4; i++) cols.push(ad.payload.descriptions[i] || "");
        cols.push(ad.payload.final_url, ad.payload.path1 || "", ad.payload.path2 || "", "Paused");
        adRows.push(toRow(cols));
      }
    }
    zip.file("responsive_search_ads.csv", "\uFEFF" + adRows.join("\n"));

    // 6. sitelinks.csv (extension)
    const sitelinkRows: string[] = [toRow(["Campaign", "Ad Group", "Sitelink Text", "Description Line 1", "Description Line 2", "Final URL", "Status"])];
    for (const c of campaigns) {
      const groupSet = new Set(c.keywords.map(adGroupName));
      for (const ag of groupSet) {
        const ad = adsByGroup.get(ag);
        if (!ad) continue;
        for (const sl of ad.payload.sitelinks || []) {
          sitelinkRows.push(toRow([c.name, ag, sl.text, sl.description1, sl.description2, sl.final_url, "Enabled"]));
        }
      }
    }
    zip.file("sitelinks.csv", "\uFEFF" + sitelinkRows.join("\n"));

    // 7. callouts.csv
    const calloutRows: string[] = [toRow(["Campaign", "Ad Group", "Callout Text", "Status"])];
    for (const c of campaigns) {
      const groupSet = new Set(c.keywords.map(adGroupName));
      for (const ag of groupSet) {
        const ad = adsByGroup.get(ag);
        if (!ad) continue;
        for (const co of ad.payload.callouts || []) {
          calloutRows.push(toRow([c.name, ag, co, "Enabled"]));
        }
      }
    }
    zip.file("callouts.csv", "\uFEFF" + calloutRows.join("\n"));
  }

  // README
  zip.file("README.txt",
`KEYMAP Pro — Google Ads Editor Export
Genererad: ${new Date().toISOString()}

Hur du importerar:
1. Öppna Google Ads Editor.
2. File → Import → From file (välj varje CSV i ordning, eller använd "Make multiple changes" → välj filtyp).
3. Kontrollera ändringar i panelen "Pending changes".
4. Klicka "Post" för att publicera till ditt konto.

Status är satt till "Paused" som standard — granska innan du aktiverar.

Kampanjer: ${campaigns.length}
Sökord: ${campaigns.reduce((s, c) => s + c.keywords.length, 0)}
Negativa: ${campaigns[0]?.negatives.length || 0} (per kampanj)
Annonser: ${ads.length}
`);

  return await zip.generateAsync({ type: "blob" });
}

export function buildAdGroupsForGeneration(universe: KeywordUniverse, groupBy: "cluster" | "intent" = "cluster") {
  const eligible = universe.keywords.filter((k) =>
    !k.isNegative && (k.searchVolume ?? 0) > 0 && k.channel === "Google Ads"
  );
  const groups = new Map<string, UniverseKeyword[]>();
  for (const k of eligible) {
    const key = sanitizeCampaign(k.recommendedAdGroup || k.cluster);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(k);
  }
  return Array.from(groups.entries()).map(([ad_group, kws]) => ({
    ad_group,
    keywords: kws.slice(0, 10).map((k) => k.keyword),
    final_url: kws[0]?.recommendedLandingPage,
    intent: kws[0]?.intent,
    cluster: kws[0]?.cluster,
  }));
}
