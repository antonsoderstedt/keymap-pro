import type { SeoRule } from "../types.ts";
import { monthlyUplift, matchGscToCluster } from "../utils.ts";

// REGEL 1: missing_pillar_for_cluster
export const missingPillarForCluster: SeoRule = {
  id: "missing_pillar_for_cluster",
  category: "architecture",
  scope: "cluster",
  requires: ["universe"],
  evaluate(snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c || c.keywords.length < 8) return null;
    if (c.has_brief) return null;

    const highVolKws = c.keywords.filter((k) => (k.searchVolume ?? 0) > 100);
    if (highVolKws.length < 3) return null;

    const uplift = monthlyUplift(c.total_volume, c.best_position ?? 25, 5, snapshot.goals);
    const confidence =
      0.5 +
      (c.keywords.length > 15 ? 0.2 : 0) +
      (c.competitor_gap_count > 3 ? 0.15 : 0);

    return {
      fires: true,
      confidence,
      severity: c.keywords.length > 20 ? "critical" : "warn",
      title: `"${c.name}" saknar pillar-sida`,
      what_happens: `${c.keywords.length} sökord i klustret utan central sida — sökautoriteten sprids och ingen enskild sida når topposition.`,
      why: `Sajter som bygger pillar + ${Math.min(c.keywords.length, 5)} cluster-artiklar rankar 3× snabbare. Utan pillar kannibaliserar sidorna varandra.`,
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "universe", metric: "keyword_count", value: c.keywords.length, period: "28d" },
        { source: "universe", metric: "total_volume", value: c.total_volume, period: "28d" },
        { source: "universe", metric: "competitor_gap", value: c.competitor_gap_count, period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: Math.round(uplift * 0.3),
        mid: Math.round(uplift * 0.6),
        high: uplift,
        horizon_days: 90,
        reasoning: `Baserat på volym ${c.total_volume}/mån och estimerad förbättring från position ${c.best_position ?? 25} till topp 5.`,
      },
      proposed_actions: [
        {
          kind: "create_content",
          label: "Skapa pillar-sida för klustret",
          detail: `Bygg en 2000+ ords pillar för "${c.name}" som täcker alla subtopiker och länkas av ${c.keywords.length} cluster-artiklar.`,
          effort: "hög",
          steps: [
            `Välj primärt sökord: "${c.keywords.slice().sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))[0]?.keyword}"`,
            "Skriv pillar (H2 per subtopik) med internt länkat kluster",
            "Generera content brief via Briefs-fliken",
            "Länka från alla befintliga cluster-sidor till pillarn",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 2: cluster_self_cannibalization
export const clusterSelfCannibalization: SeoRule = {
  id: "cluster_self_cannibalization",
  category: "architecture",
  scope: "cluster",
  requires: ["universe", "gsc"],
  evaluate(snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c || !snapshot.gsc) return null;

    const gscForCluster = matchGscToCluster(c, snapshot.gsc.rows_28d);
    const kwPositions: Record<string, number[]> = {};
    for (const r of gscForCluster) {
      if (!kwPositions[r.keyword]) kwPositions[r.keyword] = [];
      kwPositions[r.keyword].push(r.position);
    }
    const cannibalKws = Object.entries(kwPositions)
      .filter(([, positions]) => positions.length > 1)
      .map(([kw]) => kw);

    if (cannibalKws.length < 2) return null;

    return {
      fires: true,
      confidence: 0.75,
      severity: cannibalKws.length > 4 ? "critical" : "warn",
      title: `Kannibalisering i "${c.name}" — ${cannibalKws.length} sökord konkurrerar`,
      what_happens:
        "Flera av dina egna sidor konkurrerar om samma sökord. Google delar auktoritet istället för att satsa på en sida.",
      why: "Självkannibalisering halverar ranking-potentialen. Merge eller differentiering löser det.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "gsc", metric: "cannibalized_keywords", value: cannibalKws.length, period: "28d" },
        { source: "gsc", metric: "affected_keywords", value: cannibalKws.slice(0, 5).join(", "), period: "28d" },
      ],
      expected_impact: {
        metric: "position",
        direction: "up",
        low: 2,
        mid: 5,
        high: 10,
        horizon_days: 60,
        reasoning: "Att konsolidera till en URL brukar förbättra position med 3-8 steg inom 60d.",
      },
      proposed_actions: [
        {
          kind: "fix_technical",
          label: "Konsolidera kannibaliserade sidor",
          detail: `Avgör vilken sida som ska vara primär för "${cannibalKws[0]}", 301-redirecta de andra, och flytta all länkauktoritet dit.`,
          effort: "medel",
          steps: [
            "Identifiera starkaste sidan (flest klick i GSC) för varje sökord",
            "301-redirecta övriga sidor till den primära",
            "Uppdatera interna länkar till ny URL",
            "Kontrollera i GSC efter 2-3 veckor",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 3: thin_cluster_pages
export const thinClusterPages: SeoRule = {
  id: "thin_cluster_pages",
  category: "architecture",
  scope: "cluster",
  requires: ["universe", "gsc"],
  evaluate(snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c || !snapshot.gsc || !c.has_brief) return null;

    const gscForCluster = matchGscToCluster(c, snapshot.gsc.rows_28d);
    const weakPages = gscForCluster.filter((r) => r.clicks < 5 && r.position > 30);

    if (weakPages.length < 2) return null;

    return {
      fires: true,
      confidence: 0.6,
      severity: "warn",
      title: `${weakPages.length} tunna sidor i "${c.name}"`,
      what_happens: `${weakPages.length} sidor i klustret har <5 klick/mån och rankar >30. De dränerar crawl-budget och skadar klustrets topical authority.`,
      why: "Tunna cluster-sidor är värre än inga cluster-sidor. De signalerar låg expertise till Google.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "gsc", metric: "weak_pages", value: weakPages.length, period: "28d" },
        {
          source: "gsc",
          metric: "avg_position_weak",
          value: Math.round(weakPages.reduce((s, r) => s + r.position, 0) / weakPages.length),
          period: "28d",
        },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: 50,
        mid: 150,
        high: 400,
        horizon_days: 60,
        reasoning: "Att ta bort eller uppgradera tunna sidor förbättrar klustrets genomsnittliga position.",
      },
      proposed_actions: [
        {
          kind: "update_content",
          label: "Uppgradera eller konsolidera tunna sidor",
          detail: "Utvärdera varje svag sida: antingen fördjupa innehållet markant eller merge:a med en starkare sida via 301.",
          effort: "medel",
          steps: [
            "Exportera alla sidor med <5 klick och position >30",
            "Avgör per sida: uppgradera (800→2000 ord) eller merge",
            "Om merge: 301-redirect till närmaste starka sida",
            "Om uppgradera: skapa content brief och implementera",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 4: orphan_high_potential_page
export const orphanHighPotentialPage: SeoRule = {
  id: "orphan_high_potential_page",
  category: "architecture",
  scope: "page",
  requires: ["gsc"],
  evaluate(snapshot) {
    if (!snapshot.gsc) return null;

    const orphanCandidates = snapshot.gsc.rows_28d.filter(
      (r) => r.impressions > 500 && r.ctr < 0.005 && r.position > 15
    );

    if (orphanCandidates.length < 2) return null;

    const topOrphan = orphanCandidates.slice().sort((a, b) => b.impressions - a.impressions)[0];
    const uplift = monthlyUplift(
      topOrphan.impressions / 30,
      topOrphan.position,
      topOrphan.position * 0.6,
      snapshot.goals
    );

    return {
      fires: true,
      confidence: 0.65,
      severity: orphanCandidates.length > 5 ? "critical" : "warn",
      title: `${orphanCandidates.length} sidor med hög synlighet men inga interna länkar`,
      what_happens: `${orphanCandidates.length} sidor har 500+ impressioner/mån men extremt låg CTR — trolig orsak: få/inga interna länkar gör att Google inte litar på sidorna.`,
      why: "Intern länkning är det billigaste sättet att höja ranking. Sidor utan interna länkar rankar 9× sämre än sidor med djuplänkar.",
      scope_ref: orphanCandidates.slice(0, 3).map((r) => ({ id: r.keyword, name: r.keyword })),
      evidence: [
        { source: "gsc", metric: "orphan_pages_count", value: orphanCandidates.length, period: "28d" },
        { source: "gsc", metric: "top_orphan_impressions", value: topOrphan.impressions, period: "28d" },
        { source: "gsc", metric: "top_orphan_ctr", value: (topOrphan.ctr * 100).toFixed(2) + "%", period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: Math.round(uplift * 0.3),
        mid: Math.round(uplift * 0.6),
        high: uplift,
        horizon_days: 45,
        reasoning: "Att lägga 3-5 interna länkar till varje orphan-sida höjer position med 3-8 steg inom 45d.",
      },
      proposed_actions: [
        {
          kind: "internal_link",
          label: "Bygg interna länkar till orphan-sidorna",
          detail: `Lägg till 3-5 kontextuella interna länkar till "${topOrphan.keyword}"-sidan från relaterade sidor med hög auktoritet.`,
          effort: "låg",
          steps: [
            "Identifiera topp 3 orphan-sidor (hög impressions, låg CTR)",
            "Hitta 3-5 befintliga sidor med relevans som kan länka dit",
            "Lägg in kontextuella ankarlänkar med matchande anchor text",
            "Upprepa för alla orphan-sidor",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

// REGEL 5: cluster_without_internal_linking
export const clusterWithoutInternalLinking: SeoRule = {
  id: "cluster_without_internal_linking",
  category: "architecture",
  scope: "cluster",
  requires: ["universe", "gsc"],
  evaluate(snapshot, ctx) {
    const c = ctx?.cluster;
    if (!c || !c.has_brief || c.keywords.length < 5) return null;
    if (!snapshot.gsc) return null;

    const gscForCluster = matchGscToCluster(c, snapshot.gsc.rows_28d);
    if (gscForCluster.length < 3) return null;

    const avgCtr = gscForCluster.reduce((s, r) => s + r.ctr, 0) / gscForCluster.length;
    if (avgCtr > 0.03) return null;

    return {
      fires: true,
      confidence: 0.55,
      severity: "warn",
      title: `"${c.name}" verkar sakna intern länkstruktur`,
      what_happens: `Klustret har ${gscForCluster.length} sidor i GSC men genomsnittlig CTR är ${(avgCtr * 100).toFixed(1)}% — indikerar att sidor inte stödjer varandra.`,
      why: "Topical authority kräver tät intern länkning. Google behöver se att sidorna hänger ihop.",
      scope_ref: [{ id: c.name, name: c.name }],
      evidence: [
        { source: "gsc", metric: "avg_ctr_cluster", value: (avgCtr * 100).toFixed(1) + "%", period: "28d" },
        { source: "gsc", metric: "pages_in_gsc", value: gscForCluster.length, period: "28d" },
      ],
      expected_impact: {
        metric: "clicks",
        direction: "up",
        low: 50,
        mid: 200,
        high: 600,
        horizon_days: 60,
        reasoning: "Intern länkning inom kluster förbättrar topical authority och CTR för alla sidor.",
      },
      proposed_actions: [
        {
          kind: "internal_link",
          label: "Bygg länknät inom klustret",
          detail: `Länka alla sidor i "${c.name}" till varandra och till pillarsidan med relevanta anchor texts.`,
          effort: "låg",
          steps: [
            "Lista alla sidor i klustret",
            "Pillar → alla cluster-sidor (med sökordsmatchande anchor)",
            "Varje cluster-sida → pillar + 2 syskonsidor",
            "Kontrollera coverage i GSC efter 30d",
          ],
          creates_action_item: true,
        },
      ],
    };
  },
};

export const architectureRules: SeoRule[] = [
  missingPillarForCluster,
  clusterSelfCannibalization,
  thinClusterPages,
  orphanHighPotentialPage,
  clusterWithoutInternalLinking,
];
