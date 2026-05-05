import type { SeoRule } from "../types.ts";

// REGEL 15: missing_faq_schema_on_question_keywords
export const missingFaqSchema: SeoRule = {
  id: "missing_faq_schema_on_question_keywords",
  category: "ai_llm",
  scope: "site",
  requires: ["universe", "audit"],
  evaluate(snapshot) {
    if (!snapshot.universe || !snapshot.audit) return null;

    const questionKws = snapshot.universe.keywords.filter((k) => {
      const lower = k.keyword.toLowerCase();
      return (
        (lower.startsWith("hur") ||
          lower.startsWith("vad") ||
          lower.startsWith("varför") ||
          lower.startsWith("how") ||
          lower.startsWith("what") ||
          lower.startsWith("why") ||
          lower.includes("?")) &&
        !k.isNegative &&
        (k.searchVolume ?? 0) > 50
      );
    });

    if (questionKws.length < 5) return null;

    const hasSchema = snapshot.audit.onPage.issues.some((i) =>
      i.title.toLowerCase().includes("schema")
    );

    if (hasSchema) return null;

    return {
      fires: true,
      confidence: 0.75,
      severity: questionKws.length > 20 ? "critical" : "warn",
      title: `${questionKws.length} frågesökord utan FAQ-schema — missar AI Overview`,
      what_happens: `${questionKws.length} sökord börjar med "hur/vad/varför" men sidorna verkar sakna FAQ-schema. Google använder FAQ-schema för AI Overview-citeringar.`,
      why: "FAQ-schema tredubblar sannolikheten för AI Overview-inkludering. Är en <1h fix men har enorm AI-synlighet-impact.",
      scope_ref: questionKws.slice(0, 5).map((k) => ({ id: k.keyword, name: k.keyword })),
      evidence: [
        { source: "universe", metric: "question_keywords", value: questionKws.length, period: "28d" },
        { source: "audit", metric: "schema_status", value: "saknas", period: "28d" },
        {
          source: "universe",
          metric: "top_question",
          value:
            questionKws.slice().sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))[0]
              ?.keyword ?? "",
          period: "28d",
        },
      ],
      expected_impact: {
        metric: "ai_citations",
        direction: "up",
        low: 2,
        mid: 8,
        high: 20,
        horizon_days: 30,
        reasoning: "FAQ-schema ger 3× fler AI Overview-citeringar för frågesökord enligt Google-dokumentation.",
      },
      proposed_actions: [
        {
          kind: "add_schema",
          label: "Lägg till FAQ-schema på alla frågesidor",
          detail: "Lägg till JSON-LD FAQ-schema på sidor som rankar för hur/vad/varför-sökord.",
          effort: "låg",
          steps: [
            "Identifiera alla sidor med frågesökord i GSC",
            "Lägg till FAQ JSON-LD med 4-6 frågor och svar per sida",
            "Validera med Google Rich Results Test",
            "Begär indexering via Google Search Console",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 16: answer_buried_too_deep
export const answerBuriedTooDeep: SeoRule = {
  id: "answer_buried_too_deep",
  category: "ai_llm",
  scope: "site",
  requires: ["audit", "gsc"],
  evaluate(snapshot) {
    if (!snapshot.audit || !snapshot.gsc) return null;

    const questionGsc = snapshot.gsc.rows_28d.filter((r) => {
      const lower = r.keyword.toLowerCase();
      return (
        lower.startsWith("hur") ||
        lower.startsWith("vad") ||
        lower.startsWith("how") ||
        lower.startsWith("what")
      );
    });

    if (questionGsc.length < 3) return null;
    if (snapshot.audit.onPage.htmlSize < 50000) return null;

    return {
      fires: true,
      confidence: 0.55,
      severity: "warn",
      title: `${questionGsc.length} frågesökord på sidor med troligen begravda svar`,
      what_happens:
        "Sidor med frågesökord är troligen långa utan tydlig answer-first-struktur. LLM:er citerar de 30% av texten som kommer först.",
      why: "44% av alla LLM-citeringar kommer från texten i de första 30% av en artikel. Börja med svaret.",
      scope_ref: questionGsc.slice(0, 3).map((r) => ({ id: r.keyword, name: r.keyword })),
      evidence: [
        { source: "gsc", metric: "question_keywords", value: questionGsc.length, period: "28d" },
        { source: "audit", metric: "html_size_kb", value: Math.round(snapshot.audit.onPage.htmlSize / 1000), period: "28d" },
      ],
      expected_impact: {
        metric: "ai_citations",
        direction: "up",
        low: 1,
        mid: 5,
        high: 12,
        horizon_days: 60,
        reasoning: "Answer-first-omstrukturering ökar LLM-citeringsfrekvens med 2-4× för frågesökord.",
      },
      proposed_actions: [
        {
          kind: "update_content",
          label: "Omstrukturera till answer-first-format",
          detail: "Börja varje frågeartikel med ett 2-3 menings direkt svar, sedan djupare förklaring.",
          effort: "medel",
          steps: [
            "Identifiera frågesidor med långa intro-sektioner",
            "Lägg direkt svar i första 100 ord (TL;DR-format)",
            "Strukturera resten som fördjupning",
            "Lägg till FAQ-sektion i slutet med relaterade frågor",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 17: ai_overview_competitor_citation
export const aiOverviewCompetitorCitation: SeoRule = {
  id: "ai_overview_competitor_citation",
  category: "ai_llm",
  scope: "site",
  requires: ["universe", "backlinks"],
  evaluate(snapshot) {
    if (!snapshot.backlinks || !snapshot.universe) return null;

    const ownAs = snapshot.backlinks.ownOverview?.authorityScore ?? 0;
    const competitorWithHigherAs = snapshot.backlinks.competitors.filter(
      (c) => (c.overview?.authorityScore ?? 0) > ownAs * 1.3
    );

    if (competitorWithHigherAs.length === 0) return null;

    const gapKwsWithHighIntent = snapshot.universe.keywords.filter(
      (k) =>
        k.competitorGap &&
        (k.intent === "commercial" || k.intent === "transactional") &&
        (k.searchVolume ?? 0) > 100
    ).length;

    if (gapKwsWithHighIntent < 3) return null;

    return {
      fires: true,
      confidence: 0.6,
      severity: "warn",
      title: `Konkurrenter med ${competitorWithHigherAs.length > 1 ? "högt" : "30%+ högre"} auktoritet dominerar troligen AI Overview`,
      what_happens: `${competitorWithHigherAs.length} konkurrenter har 30%+ högre authority score + ${gapKwsWithHighIntent} gap-sökord med kommersiell intent. De citeras troligen av ChatGPT/Gemini istället för dig.`,
      why: "AI Overview-citeringar korrelerar starkt med domain authority + brand mentions. Du behöver bygga upp båda.",
      scope_ref: competitorWithHigherAs.slice(0, 2).map((c) => ({ id: c.domain, name: c.domain })),
      evidence: [
        { source: "backlinks", metric: "own_authority_score", value: ownAs, period: "28d" },
        { source: "backlinks", metric: "competitor_count_higher_as", value: competitorWithHigherAs.length, period: "28d" },
        { source: "universe", metric: "high_intent_gaps", value: gapKwsWithHighIntent, period: "28d" },
      ],
      expected_impact: {
        metric: "ai_citations",
        direction: "up",
        low: 2,
        mid: 8,
        high: 25,
        horizon_days: 120,
        reasoning: "Authority-gap stängs med backlink-kampanj + brand mention-strategi under 90-120d.",
      },
      proposed_actions: [
        {
          kind: "build_links",
          label: "Bygg authority-gap mot konkurrenter",
          detail: "Kombinera backlink-outreach + brand mention-strategi för att öka AI-synlighet.",
          effort: "hög",
          steps: [
            "Analysera vilka sidor konkurrenterna har för gap-sökorden",
            "Bygg 3-5 backlinks från branschpublikationer",
            "Bidra med expertcitat till relevanta artiklar (brand mentions)",
            "Optimera befintliga sidor för AI-ready-format (FAQ, answer-first)",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 18: content_freshness_for_llm_citation
export const contentFreshnessForLlm: SeoRule = {
  id: "content_freshness_for_llm_citation",
  category: "ai_llm",
  scope: "cluster",
  requires: ["universe", "audit"],
  evaluate(snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c || !snapshot.audit) return null;

    const auditAge =
      (Date.now() - new Date(snapshot.audit.generatedAt).getTime()) /
      (1000 * 60 * 60 * 24);

    const highValueKws = c.keywords.filter(
      (k) =>
        (k.intent === "informational" || k.intent === "commercial") &&
        (k.searchVolume ?? 0) > 100
    );

    if (highValueKws.length < 3 || auditAge < 90) return null;

    return {
      fires: true,
      confidence: 0.55,
      severity: "info",
      title: `"${c.name}" har ${highValueKws.length} LLM-citerbara sökord på troligen inaktuellt innehåll`,
      what_happens: `Klustret har värdefulla informational/commercial-sökord men innehållet är troligen >90 dagar gammalt — LLM:er har stark freshness-bias.`,
      why: "Content äldre än 3 månader tappar AI-citeringar kraftigt. LLM:er prioriterar färsk information.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "universe", metric: "llm_citable_keywords", value: highValueKws.length, period: "28d" },
        { source: "audit", metric: "last_audit_days", value: Math.round(auditAge), period: "28d" },
      ],
      expected_impact: {
        metric: "ai_citations",
        direction: "up",
        low: 1,
        mid: 4,
        high: 10,
        horizon_days: 45,
        reasoning: "Content refresh med aktuell data och nytt publiceringsdatum ökar LLM-citations med 2-3×.",
      },
      proposed_actions: [
        {
          kind: "update_content",
          label: `Frescha upp "${c.name}"-innehållet för LLM-synlighet`,
          detail: "Uppdatera med 2026-data, ny statistik och aktuella exempel. Uppdatera publiceringsdatumet.",
          effort: "låg",
          steps: [
            "Lägg till 2026 statistik och aktuella exempel",
            "Uppdatera alla faktapåståenden och siffror",
            "Lägg till ett 'Senast uppdaterat' datum synligt för LLM:er",
            "Schemalägg kvartalsvis refresh framöver",
          ],
          creates_action_item: false,
        },
      ],
    };
  },
};

export const aiLlmRules: SeoRule[] = [
  missingFaqSchema,
  answerBuriedTooDeep,
  aiOverviewCompetitorCitation,
  contentFreshnessForLlm,
];
