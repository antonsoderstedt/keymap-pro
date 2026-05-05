import type { SeoRule } from "../types.ts";
import { ctrAtPosition } from "../utils.ts";

// REGEL 11: page_underperforming_for_keywords
export const pageUnderperforming: SeoRule = {
  id: "page_underperforming_for_keywords",
  category: "page",
  scope: "page",
  requires: ["gsc", "audit"],
  evaluate(snapshot) {
    if (!snapshot.gsc || !snapshot.audit) return null;

    const poorPages = snapshot.gsc.rows_28d
      .filter(
        (r) =>
          r.position > 20 &&
          r.impressions > 200 &&
          r.ctr < ctrAtPosition(r.position) * 0.5
      )
      .slice(0, 5);

    if (poorPages.length < 2) return null;

    const auditIssues = snapshot.audit.onPage.issues.filter((i) => i.severity === "high").length;

    return {
      fires: true,
      confidence: 0.6 + (auditIssues > 3 ? 0.15 : 0),
      severity: "warn",
      title: `${poorPages.length} sidor rankar dåligt trots högt sökintresse`,
      what_happens: `${poorPages.length} sidor har 200+ impressioner men CTR och position långt under förväntat — trolig orsak: intent-mismatch, tekniska issues eller thin content.`,
      why: "En sida som Google visar men ingen klickar på signalerar att sidan inte matchar sökarens förväntningar.",
      scope_ref: poorPages.slice(0, 3).map((r) => ({ id: r.keyword, name: r.keyword })),
      evidence: [
        { source: "gsc", metric: "underperforming_pages", value: poorPages.length, period: "28d" },
        { source: "audit", metric: "high_severity_issues", value: auditIssues, period: "28d" },
        { source: "gsc", metric: "worst_ctr", value: (poorPages[0].ctr * 100).toFixed(2) + "%", period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: 50,
        mid: 200,
        high: 600,
        horizon_days: 45,
        reasoning: "Att fixa intent-mismatch och tekniska issues brukar förbättra CTR med 50-200%.",
      },
      proposed_actions: [
        {
          kind: "investigate",
          label: "Analysera och fix intent-mismatch",
          detail: "Granska SERP för varje underpresterande sökord — matchar sidans innehåll exakt vad top-resultat erbjuder?",
          effort: "medel",
          steps: [
            "Sök på sökordet i incognito och kolla top-3",
            "Jämför format (guide vs produkt vs FAQ)",
            "Uppdatera sidan till rätt format och intent",
            "Optimera title/meta för CTR",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 12: content_decay_detected
export const contentDecayDetected: SeoRule = {
  id: "content_decay_detected",
  category: "page",
  scope: "page",
  requires: ["gsc"],
  evaluate(snapshot) {
    if (!snapshot.gsc) return null;

    const gscByKw28 = new Map(snapshot.gsc.rows_28d.map((r) => [r.keyword, r]));
    const gscByKw90 = new Map(snapshot.gsc.rows_90d.map((r) => [r.keyword, r]));

    const decayingKws: { keyword: string; drop: number; clicks28: number }[] = [];

    for (const [kw, row28] of gscByKw28) {
      const row90 = gscByKw90.get(kw);
      if (!row90) continue;

      const clicks28Norm = row28.clicks;
      const clicks90Norm = row90.clicks / (90 / 28);
      const drop = (clicks90Norm - clicks28Norm) / (clicks90Norm || 1);

      if (drop > 0.3 && clicks90Norm > 20) {
        decayingKws.push({ keyword: kw, drop, clicks28: row28.clicks });
      }
    }

    if (decayingKws.length < 2) return null;

    decayingKws.sort((a, b) => b.drop - a.drop);

    return {
      fires: true,
      confidence: 0.75,
      severity: decayingKws.length > 5 ? "critical" : "warn",
      title: `${decayingKws.length} sidor tappar trafik — content decay`,
      what_happens: `${decayingKws.length} sidor har tappat 30%+ klick jämfört med senaste 90-dagarsperioden.`,
      why: "Content decay = sidan är utdaterad. Google prioriterar färskt, aktuellt innehåll — särskilt för LLM-citeringar.",
      scope_ref: decayingKws.slice(0, 3).map((r) => ({ id: r.keyword, name: r.keyword })),
      evidence: [
        { source: "gsc", metric: "decaying_pages", value: decayingKws.length, period: "90d" },
        { source: "gsc", metric: "top_decay_keyword", value: decayingKws[0].keyword, period: "90d" },
        { source: "gsc", metric: "top_decay_drop", value: (decayingKws[0].drop * 100).toFixed(0) + "%", period: "90d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: 50,
        mid: 200,
        high: 800,
        horizon_days: 60,
        reasoning: "Content refresh återställer ranking inom 30-60d om decay beror på utdaterat innehåll.",
      },
      proposed_actions: [
        {
          kind: "update_content",
          label: "Uppdatera de tappande sidorna",
          detail: `Börja med "${decayingKws[0].keyword}" (${(decayingKws[0].drop * 100).toFixed(0)}% tapp) — uppdatera fakta, lägg till nytt, förbättra struktur.`,
          effort: "medel",
          steps: [
            "Lägg till aktuell data och uppdaterade statistik",
            "Lägg till FAQ-sektion med frågor folk ställer 2026",
            "Uppdatera publicerings- och ändringsdatum",
            "Bygg 1-2 nya interna länkar från nyare sidor",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 13: high_traffic_page_no_conversion
export const highTrafficPageNoConversion: SeoRule = {
  id: "high_traffic_page_no_conversion",
  category: "page",
  scope: "page",
  requires: ["gsc", "universe"],
  evaluate(snapshot) {
    if (!snapshot.gsc || !snapshot.universe) return null;

    const gscKws = new Set(snapshot.gsc.rows_28d.map((r) => r.keyword.toLowerCase()));
    const infoKws = snapshot.universe.keywords.filter(
      (k) =>
        k.intent === "informational" &&
        gscKws.has(k.keyword.toLowerCase()) &&
        (k.searchVolume ?? 0) > 200 &&
        k.channel !== "Content"
    );

    if (infoKws.length < 3) return null;

    return {
      fires: true,
      confidence: 0.65,
      severity: "warn",
      title: `${infoKws.length} transactional-sidor rankar för informational-sökord`,
      what_happens:
        "Sidor som är tänkta som landningssidor rankar för 'hur/vad'-sökord utan köpintent. Google visar dem men de konverterar inte.",
      why: "Intent-mismatch är en av de vanligaste orsakerna till hög bounce rate på konverteringssidor.",
      scope_ref: infoKws.slice(0, 3).map((k) => ({ id: k.keyword, name: k.keyword })),
      evidence: [
        { source: "universe", metric: "intent_mismatch_count", value: infoKws.length, period: "28d" },
        {
          source: "universe",
          metric: "affected_keywords",
          value: infoKws.slice(0, 3).map((k) => k.keyword).join(", "),
          period: "28d",
        },
      ],
      expected_impact: {
        metric: "conversions",
        direction: "up",
        low: 2,
        mid: 8,
        high: 20,
        horizon_days: 45,
        reasoning: "Att skapa dedikerade informational-sidor frigör konverteringssidorna för rätt intent.",
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: "Skapa separata informational-sidor",
          detail: "Flytta informational-innehållet till egna guider/artiklar så landningssidorna kan fokusera på konvertering.",
          effort: "medel",
          steps: [
            "Identifiera informational-sökord på transactional-sidor",
            "Skapa dedikerade guide-/FAQ-sidor för dessa sökord",
            "Länka guide → landningssida med tydlig CTA",
            "Uppdatera interna signaler",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 14: page_targets_too_many_intents
export const pageTooManyIntents: SeoRule = {
  id: "page_targets_too_many_intents",
  category: "page",
  scope: "cluster",
  requires: ["universe"],
  evaluate(_snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c || c.keywords.length < 6) return null;

    const intentCounts = c.keywords.reduce((acc, k) => {
      const i = k.intent || "unknown";
      acc[i] = (acc[i] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const significantIntents = Object.entries(intentCounts).filter(
      ([, count]) => count >= 3
    ).length;

    if (significantIntents < 3) return null;

    return {
      fires: true,
      confidence: 0.6,
      severity: "warn",
      title: `"${c.name}" täcker ${significantIntents} olika sökintenter — dela upp`,
      what_happens:
        "Klustret blandar informational, commercial och transactional intent. Ingen enskild sida kan optimeras för alla tre.",
      why: "Google kan inte ranka en sida högt för motstridiga intenter. Dela = bättre ranking för alla delar.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "universe", metric: "intent_types", value: significantIntents, period: "28d" },
        ...Object.entries(intentCounts).slice(0, 3).map(([intent, count]) => ({
          source: "universe" as const,
          metric: `intent_${intent}`,
          value: count,
          period: "28d" as const,
        })),
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: 100,
        mid: 400,
        high: 1000,
        horizon_days: 90,
        reasoning: "Att dela upp ett kluster per intent förbättrar ranking för alla intenter med 20-50%.",
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: "Dela klustret i intent-specifika undersektioner",
          detail: `Skapa separata sidor för: guide (informational), jämförelse (commercial), och köp/kontakt (transactional) inom "${c.name}".`,
          effort: "hög",
          steps: [
            "Identifiera 3 intent-grupper med 3+ sökord var",
            "Bygg en sida per intent med rätt format",
            "Länka alla 3 från pillar-sidan",
            "301-redirecta ev. gammal blandsida till rätt ny sida",
          ],
          creates_action_item: false,
        },
      ],
    };
  },
};

export const pageRules: SeoRule[] = [
  pageUnderperforming,
  contentDecayDetected,
  highTrafficPageNoConversion,
  pageTooManyIntents,
];
