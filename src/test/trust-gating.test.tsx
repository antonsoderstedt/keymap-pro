// R7 — trust gating UI tests för AdsExportModal + ContentBriefsTab.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdsExportModal } from "@/components/universe/AdsExportModal";
import { ContentBriefsTab } from "@/components/universe/ContentBriefsTab";
import type { KeywordUniverse, UniverseKeyword } from "@/lib/types";

// ---- Supabase mock (chainable + thenable) ---------------------------------
vi.mock("@/integrations/supabase/client", () => {
  const result = { data: [], error: null };
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return {
    supabase: {
      from: vi.fn(() => chain),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function kw(partial: Partial<UniverseKeyword>): UniverseKeyword {
  return {
    keyword: "kw",
    cluster: "C1",
    intent: "transactional",
    channel: "Google Ads",
    priority: "medium",
    searchVolume: 100,
    cpc: 0,
    kd: 0,
    isNegative: false,
    dataSource: "real",
    ...partial,
  } as UniverseKeyword;
}

function makeUniverse(keywords: UniverseKeyword[]): KeywordUniverse {
  return {
    summary: "",
    keywords,
    clusters: [],
    pillarPages: [],
    negativeKeywords: [],
  } as unknown as KeywordUniverse;
}

describe("AdsExportModal trust gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("excludes unverified ideas and shows warning banner", () => {
    const universe = makeUniverse([
      kw({ keyword: "v1", dataSource: "real" }),
      kw({ keyword: "v2", dataSource: "real" }),
      kw({ keyword: "v3", dataSource: "real" }),
      kw({ keyword: "u1", dataSource: "estimated" }),
      kw({ keyword: "u2", dataSource: "estimated" }),
    ]);
    render(
      <AdsExportModal
        open
        onClose={() => {}}
        universe={universe}
        projectId="p1"
        analysisId="a1"
      />,
    );
    expect(screen.getByText(/2 overifierade idéer exkluderas/i)).toBeInTheDocument();
    // Verified count badge shows 3
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("disables export and shows blocking message when 0 verified", () => {
    const universe = makeUniverse([
      kw({ keyword: "u1", dataSource: "estimated" }),
      kw({ keyword: "u2", dataSource: "estimated" }),
      kw({ keyword: "u3", dataSource: "estimated" }),
    ]);
    render(
      <AdsExportModal
        open
        onClose={() => {}}
        universe={universe}
        projectId="p1"
        analysisId="a1"
      />,
    );
    expect(screen.getByText(/Inga verifierade sökord att exportera/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Exportera ZIP/i });
    expect(btn).toBeDisabled();
  });
});

describe("ContentBriefsTab trust gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables generate-knappen och visar inline-text när klustret saknar verifierade sökord", () => {
    const universe = makeUniverse([
      kw({ keyword: "u1", cluster: "C1", dataSource: "estimated" }),
      kw({ keyword: "u2", cluster: "C1", dataSource: "estimated" }),
    ]);
    render(<ContentBriefsTab analysisId="a1" universe={universe} />);
    expect(
      screen.getByText(/Inga verifierade sökord i klustret/i),
    ).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Generera brief/i });
    expect(btn).toBeDisabled();
  });
});
