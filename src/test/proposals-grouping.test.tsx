// Group-by + bulk actions UI test for ActionsPipeline.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---- Mocks ----------------------------------------------------------------

const proposals = [
  // 3 sharing rule_id="wasted_spend"
  { id: "p1", source: "diagnosis", action_type: "pause_keyword", scope_label: "A › B › kw1", payload: {}, estimated_impact_sek: 100, rationale: null, status: "draft", error_message: null, created_at: "2026-01-01", rule_id: "wasted_spend" },
  { id: "p2", source: "diagnosis", action_type: "pause_keyword", scope_label: "A › B › kw2", payload: {}, estimated_impact_sek: 200, rationale: null, status: "draft", error_message: null, created_at: "2026-01-01", rule_id: "wasted_spend" },
  { id: "p3", source: "diagnosis", action_type: "pause_ad",      scope_label: "A › B › ad1", payload: {}, estimated_impact_sek: 50,  rationale: null, status: "draft", error_message: null, created_at: "2026-01-01", rule_id: "wasted_spend" },
  // 2 sharing action_type="pause_keyword" with another rule
  { id: "p4", source: "diagnosis", action_type: "pause_keyword", scope_label: "X › Y › kw9", payload: {}, estimated_impact_sek: 300, rationale: null, status: "draft", error_message: null, created_at: "2026-01-01", rule_id: "negative_keyword_candidate" },
  { id: "p5", source: "diagnosis", action_type: "add_negative_keyword", scope_label: "X", payload: {}, estimated_impact_sek: 25, rationale: null, status: "draft", error_message: null, created_at: "2026-01-01", rule_id: "negative_keyword_candidate" },
];

vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn().mockResolvedValue({ data: proposals, error: null }),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  };
  return {
    supabase: {
      from: vi.fn(() => builder),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ error: null }) },
    },
  };
});

vi.mock("@/hooks/useActionItems", () => ({
  useActionItems: () => ({
    items: [],
    loading: false,
    error: null,
    update: vi.fn().mockResolvedValue({ error: null }),
    markImplemented: vi.fn().mockResolvedValue({ error: null }),
    reload: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProjectCapabilities", () => ({
  useProjectCapabilities: () => ({ hasAds: false }),
}));

vi.mock("@/components/context", () => ({ ContextSheet: () => null }));
vi.mock("@/components/workspace/ProposalsTab", () => ({ ProposalsTab: () => null }));
vi.mock("./AdsAudit", () => ({ default: () => null }));
vi.mock("./AdsAuditPlan", () => ({ default: () => null }));

import ActionsPipeline from "@/pages/workspace/ActionsPipeline";

function renderPage(initial = "/clients/proj1/actions?groupBy=rule_id") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/clients/:id/actions" element={<ActionsPipeline />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActionsPipeline grouping + bulk actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders accordion headers when grouped by rule", async () => {
    renderPage();
    // Group headers
    expect(await screen.findByText(/Bortkastad annonsbudget/i)).toBeInTheDocument();
    expect(await screen.findByText(/Negativt sökord/i)).toBeInTheDocument();
  });

  it("selecting a group toggles its rows and shows bulk bar with summed impact", async () => {
    renderPage();
    const header = (await screen.findByText(/Bortkastad annonsbudget/i)).closest("div")!;
    const groupCb = within(header).getByLabelText("Välj grupp");
    fireEvent.click(groupCb);
    const bar = await screen.findByTestId("bulk-action-bar");
    expect(within(bar).getByText(/3 valda/)).toBeInTheDocument();
    // 100 + 200 + 50 = 350
    expect(within(bar).getByText(/350/)).toBeInTheDocument();
  });
});
