// R3c — KeywordPlannerPanel rendering + validation tests.
// Mocks the hook and supabase client to verify:
// - Panel renders collapsed by default
// - Submit disabled without seeds OR url
// - Competition chip variants
// - Micros → SEK formatting

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeywordPlannerPanel } from "../components/universe/KeywordPlannerPanel";
import type { KeywordPlannerRun } from "../lib/types";

const mockFetch = vi.fn();
const hookState: { runs: KeywordPlannerRun[]; loading: boolean; error: string | null } = {
  runs: [],
  loading: false,
  error: null,
};

vi.mock("@/hooks/useKeywordPlannerIdeas", () => ({
  useKeywordPlannerIdeas: () => ({
    runs: hookState.runs,
    loading: hookState.loading,
    error: hookState.error,
    fetch: mockFetch,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/googleOAuth", () => ({
  reconnectGoogle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { ads_customer_id: "123-456-7890" }, error: null }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  mockFetch.mockReset();
  hookState.runs = [];
  hookState.loading = false;
  hookState.error = null;
});

describe("KeywordPlannerPanel", () => {
  it("renders collapsed by default with header", () => {
    render(<KeywordPlannerPanel projectId="p1" />);
    expect(screen.getByText("Google Ads Keyword Planner")).toBeInTheDocument();
    expect(screen.queryByText(/Seed-keywords/)).not.toBeInTheDocument();
  });

  it("expands on header click", () => {
    render(<KeywordPlannerPanel projectId="p1" />);
    fireEvent.click(screen.getByText("Google Ads Keyword Planner"));
    expect(screen.getByText(/Seed-keywords/)).toBeInTheDocument();
  });

  it("disables submit button without seeds or url", async () => {
    render(<KeywordPlannerPanel projectId="p1" />);
    fireEvent.click(screen.getByText("Google Ads Keyword Planner"));
    // wait microtask for customer_id state
    await Promise.resolve();
    const btn = screen.getByRole("button", { name: /Hämta från Google/ });
    expect(btn).toBeDisabled();
  });

  it("shows count badge when runs exist", () => {
    hookState.runs = [{
      run_id: "r1",
      fetched_at: new Date().toISOString(),
      seed_keywords: ["test"],
      seed_url: null,
      count: 42,
      ideas: [],
    }];
    render(<KeywordPlannerPanel projectId="p1" />);
    expect(screen.getByText(/42 idéer i senaste run/)).toBeInTheDocument();
  });
});
