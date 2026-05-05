import type { SeoRule } from "../types.ts";
import { monthlyKeywordValue } from "../utils.ts";

// REGEL 19: backlink_gap_high_authority
export const backlinkGapHighAuthority: SeoRule = {
  id: "backlink_gap_high_authority",
  category: "authority",
  scope: "site",
  requires: ["backlinks"],
  evaluate(snapshot) {
    if (!snapshot.backlinks) return null;

    const highValueGaps = snapshot.backlinks.gapDomains.filter(
      (d) => d.authority >= 40 && d.competitorCount >= 2
    );

    if (highValueGaps.length < 3) return null;

    return {
      fires: true,
      confidence: 0.8,
      severity: highValueGaps.length > 10 ? "critical" : "warn",
      title: `${highValueGaps.length} hög-auktoritets-sajter länkar till konkurrenter men inte dig`,
      what_happens: `${highValueGaps.length} domäner med AS 40+ länkar till minst 2 konkurrenter men inte till dig — direkt authority-gap.`,
      why: "Backlinks från DA40+ domäner är de viktigaste enskilda faktorn för både Google-ranking och AI Overview-citeringar.",
      scope_ref: highValueGaps.slice(0, 3).map((d) => ({ id: d.domain, name: d.domain })),
      evidence: [
        { source: "backlinks", metric: "high_value_gap_domains", value: highValueGaps.length, period: "28d" },
        { source: "backlinks", metric: "top_gap_domain", value: highValueGaps[0]?.domain ?? "", period: "28d" },
        { source: "backlinks", metric: "top_gap_authority", value: highValueGaps[0]?.authority ?? 0, period: "28d" },
      ],
      expected_impact: {
        metric: "authority",
        direction: "up",
        low: 2,
        mid: 5,
        high: 12,
        horizon_days: 90,
        reasoning: "5 backlinks från AS40+ domäner ökar domain authority med 3-8 poäng inom 90d.",
      },
      proposed_actions: [
        {
          kind: "build_links",
          label: `Kontakta topp ${Math.min(highValueGaps.length, 10)} gap-domäner`,
          detail: `Börja med "${highValueGaps[0]?.domain}" (AS ${highValueGaps[0]?.authority}, länkar till ${highValueGaps[0]?.competitorCount} konkurrenter).`,
          effort: "hög",
          steps: [
            "Exportera gap-domäner sorterade på authority",
            "Identifiera rätt kontaktperson på topp-10 domäner",
            "Skriv personaliserat outreach-mail med värdepropå",
            "Erbjud gästinlägg, citat eller datapunkt de kan citera",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 20: brand_mention_below_competitors
export const brandMentionBelowCompetitors: SeoRule = {
  id: "brand_mention_below_competitors",
  category: "authority",
  scope: "site",
  requires: ["backlinks"],
  evaluate(snapshot) {
    if (!snapshot.backlinks) return null;

    const ownAs = snapshot.backlinks.ownOverview?.authorityScore ?? 0;
    const ownRefDomains = snapshot.backlinks.ownOverview?.referringDomains ?? 0;

    const strongerCompetitors = snapshot.backlinks.competitors.filter((c) => {
      const compRefDomains = c.overview?.referringDomains ?? 0;
      return compRefDomains > ownRefDomains * 1.5;
    });

    if (strongerCompetitors.length === 0) return null;
    if (snapshot.competitors.length === 0) return null;

    return {
      fires: true,
      confidence: 0.65,
      severity: "warn",
      title: `Konkurrenter har 50%+ fler brand mentions — lägre AI-synlighet`,
      what_happens: `${strongerCompetitors.length} konkurrenter har 50%+ fler referring domains. Brand mentions är den starkaste faktorn för LLM-citeringar.`,
      why: "Ahrefs-studie: brand web mentions korrelerar starkare med AI-synlighet än backlinks, DA eller on-page-faktorer.",
      scope_ref: strongerCompetitors.slice(0, 2).map((c) => ({ id: c.domain, name: c.domain })),
      evidence: [
        { source: "backlinks", metric: "own_referring_domains", value: ownRefDomains, period: "28d" },
        { source: "backlinks", metric: "competitors_above", value: strongerCompetitors.length, period: "28d" },
        { source: "backlinks", metric: "own_authority_score", value: ownAs, period: "28d" },
      ],
      expected_impact: {
        metric: "ai_citations",
        direction: "up",
        low: 3,
        mid: 10,
        high: 30,
        horizon_days: 120,
        reasoning: "Brand mention-strategi tar 90-120d men ger exponentiell AI-synlighetsökning.",
      },
      proposed_actions: [
        {
          kind: "build_links",
          label: "Starta brand mention-kampanj",
          detail: "Fokusera på att få omnämnt på sajter som AI:er citerar: Reddit, branschpublikationer, nyhetssajter, forum.",
          effort: "hög",
          steps: [
            "Identifiera Reddit-trådar om din bransch — bidra med expertkunskap",
            "Skriv gästartiklar i branschpublikationer",
            "Svara på HARO/journalist-förfrågningar om din bransch",
            "Publicera data-driven innehåll som andra citerar",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 21: unlinked_brand_mentions
export const unlinkedBrandMentions: SeoRule = {
  id: "unlinked_brand_mentions",
  category: "authority",
  scope: "site",
  requires: ["backlinks"],
  evaluate(snapshot) {
    if (!snapshot.backlinks || !snapshot.goals) return null;

    const brandTerms = snapshot.goals.brand_terms;
    if (!brandTerms || brandTerms.length === 0) return null;

    const ownRefDomains = snapshot.backlinks.ownOverview?.referringDomains ?? 0;
    const ownAs = snapshot.backlinks.ownOverview?.authorityScore ?? 0;

    if (ownAs < 15 || ownRefDomains > 200) return null;

    return {
      fires: true,
      confidence: 0.5,
      severity: "info",
      title: `"${brandTerms[0]}" nämns troligen på sajter utan länk — be om dem`,
      what_happens: `Varumärket har ${ownAs} authority score men relativt få referring domains. Troligen finns unlinked brand mentions att konvertera till backlinks.`,
      why: "Unlinked mentions är den lättaste länken att få — sajten gillar redan dig. Ett mail konverterar 10-30%.",
      scope_ref: [{ id: brandTerms[0], name: brandTerms[0] }],
      evidence: [
        { source: "backlinks", metric: "referring_domains", value: ownRefDomains, period: "28d" },
        { source: "backlinks", metric: "authority_score", value: ownAs, period: "28d" },
        { source: "computed", metric: "brand_terms_tracked", value: brandTerms.length, period: "28d" },
      ],
      expected_impact: {
        metric: "authority",
        direction: "up",
        low: 1,
        mid: 4,
        high: 10,
        horizon_days: 60,
        reasoning: "Att konvertera 5-10 unlinked mentions till backlinks ökar authority med 2-5 poäng.",
      },
      proposed_actions: [
        {
          kind: "build_links",
          label: "Hitta och konvertera unlinked mentions",
          detail: `Sök efter "${brandTerms[0]}" på Google med -site:${snapshot.domain} för att hitta omnämnanden utan länk.`,
          effort: "låg",
          steps: [
            `Sök "site:reddit.com ${brandTerms[0]}" och liknande utan länk`,
            "Kontakta sajter med vänlig förfrågan om att lägga till länk",
            "Använd Ahrefs/Semrush 'Mentions'-funktion för systematisk sökning",
            "Följ upp efter 1-2 veckor om inget svar",
          ],
          creates_action_item: false,
        },
      ],
    };
  },
};

// REGEL 22: topical_authority_threshold_gap
export const topicalAuthorityThresholdGap: SeoRule = {
  id: "topical_authority_threshold_gap",
  category: "authority",
  scope: "cluster",
  requires: ["universe"],
  evaluate(snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c) return null;

    const THRESHOLD = 25;
    const currentPages = c.keywords.filter(
      (k) => k.channel === "SEO" || k.channel === "Landing Page" || k.channel === "Content"
    ).length;

    if (currentPages >= THRESHOLD) return null;
    if (currentPages < 3) return null;

    const gapToThreshold = THRESHOLD - currentPages;
    const uplift = monthlyKeywordValue(c.total_volume, c.best_position ?? 20, snapshot.goals);

    return {
      fires: true,
      confidence: 0.65,
      severity: gapToThreshold < 5 ? "warn" : "info",
      title: `"${c.name}" är ${gapToThreshold} sidor från competitive topical authority`,
      what_happens: `Klustret har ${currentPages} sidor men forskning visar att 25-30 sammanlänkade sidor krävs för att slå konkurrenter i topical authority.`,
      why: "Sajter som passerar 25-30-tröskeln rankar 3× snabbare på nya sökord i ämnet och citeras oftare av AI.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "universe", metric: "current_pages", value: currentPages, period: "28d" },
        { source: "universe", metric: "gap_to_threshold", value: gapToThreshold, period: "28d" },
        { source: "universe", metric: "total_volume", value: c.total_volume, period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: Math.round(uplift * 0.15),
        mid: Math.round(uplift * 0.35),
        high: Math.round(uplift * 0.6),
        horizon_days: 120,
        reasoning: `${gapToThreshold} nya välstrukturerade sidor ger compound topical authority som förstärker hela klustret.`,
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: `Bygg ${gapToThreshold} sidor till i "${c.name}"`,
          detail: `Identifiera de ${gapToThreshold} mest värdefulla subtopiker att täcka. Prioritera sökord med volym + låg KD.`,
          effort: "hög",
          steps: [
            `Välj ${gapToThreshold} sökord med volym>50 och KD<50 i klustret`,
            "Skapa content brief per sida (ett per vecka = hållbart tempo)",
            "Länka varje ny sida till pillar + 2 cluster-sidor",
            "Mät klustrets genomsnittliga position var 30d — bör klättra stadigt",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

export const authorityRules: SeoRule[] = [
  backlinkGapHighAuthority,
  brandMentionBelowCompetitors,
  unlinkedBrandMentions,
  topicalAuthorityThresholdGap,
];
