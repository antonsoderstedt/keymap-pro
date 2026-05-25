// Pure normalization layer: merges action_items + ads_change_proposals
// into a single visual pipeline. No DB changes — UI mapping only.

import type { ActionItem } from "@/hooks/useActionItems";

export type PipelineStage = "proposed" | "approved" | "implemented" | "measured";
export type PipelineOrigin = "action" | "ads_proposal";

export interface AdsProposalRow {
  id: string;
  source: string;
  action_type: string;
  scope_label: string | null;
  payload: any;
  estimated_impact_sek: number | null;
  rationale: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  rule_id?: string | null;
}

export interface PipelineItem {
  id: string;            // "a:<uuid>" | "p:<uuid>"
  rawId: string;
  origin: PipelineOrigin;
  stage: PipelineStage;
  title: string;
  description?: string | null;
  category: string;
  impactSek: number | null;
  createdAt: string;
  raw: ActionItem | AdsProposalRow;
  flags: { failed?: boolean; queued?: boolean; pushable?: boolean; hidden?: boolean };
  ruleId: string | null;
  actionType: string;
}

const STAGE_ORDER: Record<PipelineStage, number> = {
  proposed: 0,
  approved: 1,
  implemented: 2,
  measured: 3,
};

function stageForAction(a: ActionItem): PipelineStage | "hidden" {
  if (a.status === "archived") return "hidden";
  if (a.status === "todo") return "proposed";
  if (a.status === "in_progress") return "approved";
  if (a.status === "done") {
    const meta = (a.metadata as any) ?? {};
    if (meta?.measured_at || meta?.measurement) return "measured";
    return "implemented";
  }
  return "proposed";
}

function stageForProposal(p: AdsProposalRow): PipelineStage | "hidden" {
  switch (p.status) {
    case "draft": return "proposed";
    case "approved":
    case "queued": return "approved";
    case "pushed":
    case "failed": return "implemented";
    case "rejected": return "hidden";
    default: return "proposed";
  }
}

function actionTitleFromProposal(p: AdsProposalRow): string {
  const labelMap: Record<string, string> = {
    pause_keyword: "Pausa sökord",
    resume_keyword: "Återuppta sökord",
    pause_ad: "Pausa annons",
    add_negative_keyword: "Lägg till negativt sökord",
    replace_rsa_asset: "Ersätt RSA-text",
    rsa_batch: "RSA-batchändring",
    create_rsa: "Skapa RSA-annons",
    create_ad_group: "Skapa annonsgrupp",
    add_keyword: "Lägg till sökord",
  };
  const base = labelMap[p.action_type] ?? p.action_type;
  return p.scope_label ? `${base} — ${p.scope_label}` : base;
}

const ADS_PUSHABLE_SOURCES = new Set([
  "ads_wasted",
  "ads_negatives",
  "ads_pacing",
  "ads_rsa",
]);

export function mergeIntoPipeline(
  items: ActionItem[],
  proposals: AdsProposalRow[],
): PipelineItem[] {
  const out: PipelineItem[] = [];

  for (const a of items) {
    const stage = stageForAction(a);
    if (stage === "hidden") continue;
    out.push({
      id: `a:${a.id}`,
      rawId: a.id,
      origin: "action",
      stage,
      title: a.title,
      description: a.description,
      category: a.category || "general",
      impactSek: a.expected_impact_sek ?? null,
      createdAt: a.created_at,
      raw: a,
      flags: {
        pushable: ADS_PUSHABLE_SOURCES.has(a.source_type || ""),
      },
      ruleId: a.source_type || null,
      actionType: a.source_type || a.category || "manual",
    });
  }

  for (const p of proposals) {
    const stage = stageForProposal(p);
    if (stage === "hidden") continue;
    out.push({
      id: `p:${p.id}`,
      rawId: p.id,
      origin: "ads_proposal",
      stage,
      title: actionTitleFromProposal(p),
      description: p.rationale,
      category: "ads",
      impactSek: p.estimated_impact_sek ?? null,
      createdAt: p.created_at,
      raw: p,
      flags: {
        failed: p.status === "failed",
        queued: p.status === "queued",
      },
      ruleId: p.rule_id ?? null,
      actionType: p.action_type,
    });
  }

  out.sort((a, b) => {
    const sa = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
    if (sa !== 0) return sa;
    const ia = a.impactSek ?? 0;
    const ib = b.impactSek ?? 0;
    if (ib !== ia) return ib - ia;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return out;
}

export const STAGE_LABEL: Record<PipelineStage, string> = {
  proposed: "Föreslagen",
  approved: "Godkänd",
  implemented: "Implementerad",
  measured: "Mätt",
};

export function countByStage(items: PipelineItem[]): Record<PipelineStage, number> {
  return items.reduce(
    (acc, i) => {
      acc[i.stage]++;
      return acc;
    },
    { proposed: 0, approved: 0, implemented: 0, measured: 0 } as Record<PipelineStage, number>,
  );
}

export function categoryLabel(c: string): string {
  switch (c) {
    case "seo": return "SEO";
    case "ads": return "Google Ads";
    case "content": return "Innehåll";
    case "technical": return "Teknisk";
    default: return "Övrigt";
  }
}

export const RULE_LABELS: Record<string, string> = {
  wasted_keyword_no_conversions: "Bortkastat sökord (inga konverteringar)",
  negative_keyword_candidate: "Negativt sökord (kandidat)",
  ad_strength_poor: "Svag annonsstyrka",
  rsa_draft: "RSA-utkast",
  ads_wasted: "Bortkastad annonsbudget",
  ads_negatives: "Negativ sökordsmining",
  ads_pacing: "Budget-pacing",
  ads_rsa: "RSA-optimering",
};

export const ACTION_TYPE_LABELS: Record<string, string> = {
  pause_keyword: "Pausa sökord",
  resume_keyword: "Återuppta sökord",
  pause_ad: "Pausa annons",
  add_negative_keyword: "Lägg till negativt sökord",
  replace_rsa_asset: "Ersätt RSA-text",
  rsa_batch: "RSA-batchändring",
  create_rsa: "Skapa RSA-annons",
  create_rsa_pending_adgroup: "Nytt RSA-utkast",
  create_ad_group: "Skapa annonsgrupp",
  add_keyword: "Lägg till sökord",
};

export function ruleLabel(id: string | null | undefined): string {
  if (!id) return "Övrigt";
  return RULE_LABELS[id] ?? id;
}

export function actionTypeLabel(t: string | null | undefined): string {
  if (!t) return "Övrigt";
  return ACTION_TYPE_LABELS[t] ?? t;
}

export type GroupKey = "rule_id" | "action_type";

export function groupItemsBy(
  items: PipelineItem[],
  by: GroupKey,
): Record<string, PipelineItem[]> {
  const out: Record<string, PipelineItem[]> = {};
  for (const it of items) {
    const key = by === "rule_id" ? (it.ruleId ?? "_none") : (it.actionType ?? "_none");
    if (!out[key]) out[key] = [];
    out[key].push(it);
  }
  return out;
}

export function sumImpact(items: PipelineItem[]): number {
  return items.reduce((s, i) => s + (i.impactSek ?? 0), 0);
}

export function groupKeyLabel(key: string, by: GroupKey): string {
  if (key === "_none") return "Övrigt";
  return by === "rule_id" ? ruleLabel(key) : actionTypeLabel(key);
}
