/**
 * Scope resolution — pure adapter per action source kind.
 *
 * Every action gets exactly one resolved `DcScope`. Wrong scope = wrong
 * signals, so this is the most upstream invariant.
 *
 * Input shape is a small projection of action_items / ads_change_proposals
 * to keep this module bundling-free.
 */

import type { DcScope } from "./types.ts";

export interface ActionItemLite {
  id: string;
  category?: string | null;       // "seo" | "ads" | "content" | "technical" | "general"
  source_type?: string | null;    // "audit" | "analysis" | "ads_alert" | "manual"
  source_id?: string | null;
  source_payload?: Record<string, unknown> | null;
  title?: string | null;
}

export interface AdsProposalLite {
  id: string;
  source?: string | null;
  action_type?: string | null;
  scope_label?: string | null;
  rule_id?: string | null;
  payload?: Record<string, unknown> | null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Resolve scope for an `action_item`. Pure.
 *
 * Resolution rules (canonical, deterministic):
 *   ads_alert + ads action category   → { kind: "ads", ids:[campaign_id?, ad_group_id?, ...keyword_ids?] }
 *   audit|analysis + cluster hints    → { kind: "cluster", ids:[cluster_id|opportunity_id] }
 *   seo (page hint)                   → { kind: "page", ids:[url] }
 *   technical                         → { kind: "site", ids:[] }
 *   manual / unknown                  → { kind: "open", ids:[], hints }
 */
export function resolveScopeForActionItem(a: ActionItemLite): DcScope {
  const p = a.source_payload ?? {};
  const category = (a.category ?? "").toLowerCase();
  const source = (a.source_type ?? "").toLowerCase();

  // ads
  if (category === "ads" || source === "ads_alert") {
    const ids: string[] = [];
    const campaign = asString(p["campaign_id"]);
    const adGroup = asString(p["ad_group_id"]);
    if (campaign) ids.push(`campaign:${campaign}`);
    if (adGroup) ids.push(`ad_group:${adGroup}`);
    for (const k of asStringArray(p["keyword_ids"])) ids.push(`keyword:${k}`);
    return {
      kind: "ads",
      ids,
      hints: { rule_id: asString(p["rule_id"]), category },
    };
  }

  // seo (page level)
  if (category === "seo") {
    const url = asString(p["url"]);
    const cluster = asString(p["cluster_id"]);
    const ids: string[] = [];
    if (url) ids.push(`url:${url}`);
    if (cluster) ids.push(`cluster:${cluster}`);
    return {
      kind: url ? "page" : "cluster",
      ids,
      hints: { category, cluster_id: cluster },
    };
  }

  // technical
  if (category === "technical") {
    return { kind: "site", ids: [], hints: { category } };
  }

  // audit/analysis (cluster/opportunity)
  if (source === "audit" || source === "analysis") {
    const cluster = asString(p["cluster_id"]);
    const opp = asString(p["opportunity_id"]);
    const ids: string[] = [];
    if (cluster) ids.push(`cluster:${cluster}`);
    if (opp) ids.push(`opportunity:${opp}`);
    return {
      kind: "cluster",
      ids,
      hints: { category, cluster_id: cluster, opportunity_id: opp },
    };
  }

  // manual / unknown — minimum-scope fallback
  const tags = asStringArray(p["tags"]);
  return {
    kind: "open",
    ids: tags.map((t) => `tag:${t}`),
    hints: { category, source },
  };
}

/**
 * Resolve scope for an `ads_change_proposal`. Pure.
 * Always kind="ads".
 */
export function resolveScopeForAdsProposal(p: AdsProposalLite): DcScope {
  const payload = p.payload ?? {};
  const ids: string[] = [];
  const campaign = asString(payload["campaign_id"]);
  const adGroup = asString(payload["ad_group_id"]);
  const keywordId = asString(payload["keyword_id"]);
  if (campaign) ids.push(`campaign:${campaign}`);
  if (adGroup) ids.push(`ad_group:${adGroup}`);
  if (keywordId) ids.push(`keyword:${keywordId}`);
  for (const k of asStringArray(payload["keyword_ids"])) {
    const id = `keyword:${k}`;
    if (!ids.includes(id)) ids.push(id);
  }
  return {
    kind: "ads",
    ids,
    hints: {
      rule_id: p.rule_id ?? undefined,
      action_type: p.action_type ?? undefined,
      scope_label: p.scope_label ?? undefined,
      source: p.source ?? undefined,
    },
  };
}
