// ContextSheet UI tests — deterministic rendering rules.
//
// Verifies the contract that downstream surfaces (Today, Actions, Performance,
// ASK) can rely on: empty sections hidden, max-3 footer, evidence-first order,
// narrative gated by status, collapses default closed, no charts/no theatrics.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ContextSheet, splitNarrativeCitations } from "../components/context/ContextSheet";
import type { DecisionContext } from "../lib/types";

// ---------------------------------------------------------------------------
// Mock the supabase client used by useDecisionContext
// ---------------------------------------------------------------------------

const mockMaybeSingle = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => mockMaybeSingle(),
          }),
        }),
      }),
    }),
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fullDc(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    id: "dc-1",
    project_id: "p1",
    action_item_id: "a1",
    scope: { kind: "page", ids: ["page:/foo"] },
    why_this_matters: null,
    narrative_status: "skipped",
    what_changed: [
      {
        metric: "ctr",
        delta_pct: 0.32,
        delta: 0.012,
        unit: "ratio",
        window_days: 14,
        source: "gsc",
      },
    ],
    causal_signals: [
      {
        id: "c1",
        label: "Position-förbättring efter publicering",
        description: "Snittposition från 14.2 → 8.7",
        strength: 0.8,
        evidence: [],
      },
    ],
    related_signals: [
      { id: "r1", label: "Snarlik intent på klusternivå", source: "gsc", relevance: 0.7, evidence: [] },
    ],
    recent_changes: [
      {
        id: "rc1",
        kind: "operator_action",
        label: "Tidigare åtgärd implementerad",
        occurred_at: "2026-05-10T00:00:00.000Z",
        actor: "operator",
      },
    ],
    historical_analogs: [
      {
        id: "h1",
        label: "Tidigare kluster av samma typ",
        n: 4,
        mean_uplift_pct: 0.18,
        scope: "project_only",
      },
    ],
    expected_impact: { p10: 1000, p50: 4000, p90: 9000, currency: "SEK", horizon_days: 30 },
    risk: { band: "low", drivers: ["Stabil trafikmix"] },
    confidence: { value: 0.72, band: "high", gate_triggers: [] },
    evidence: [
      {
        id: "ev-1",
        source: "gsc",
        source_id: "gsc:14d:/foo",
        observed_at: "2026-05-20T00:00:00.000Z",
        excerpt: "CTR +32% senaste 14 dagarna.",
      },
    ],
    recommended_next_step: "Förstärk landningssidans CTA-block.",
    inputs_hash: "deadbeef",
    model_version: "decision-context-v1.0.0",
    signals_version: "signals-v1.0.0",
    generated_at: "2026-05-25T12:00:00.000Z",
    ...overrides,
  };
}

async function flush() {
  // Allow the useEffect chain in useDecisionContext to settle.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  mockMaybeSingle.mockReset();
  mockInvoke.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContextSheet — states", () => {
  it("renders loading skeleton while fetching", async () => {
    let resolveFetch: (v: any) => void = () => {};
    mockMaybeSingle.mockImplementation(
      () => new Promise((res) => (resolveFetch = res)),
    );

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    expect(await screen.findByTestId("context-loading")).toBeInTheDocument();
    resolveFetch({ data: null, error: null });
    await flush();
  });

  it("renders empty state with build CTA when no DC exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.getByTestId("context-empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bygg kontext/i })).toBeEnabled();
  });

  it("clicking Bygg kontext calls decision-context-build with correct scope", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockInvoke.mockResolvedValue({ data: null, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    fireEvent.click(screen.getByRole("button", { name: /bygg kontext/i }));
    await flush();

    expect(mockInvoke).toHaveBeenCalledWith(
      "decision-context-build",
      expect.objectContaining({
        body: expect.objectContaining({
          project_id: "p1",
          scopes: [{ kind: "action_item", id: "a1" }],
          force: false,
        }),
      }),
    );
  });

  it("renders invariant error when no id provided", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.getByTestId("context-invariant")).toBeInTheDocument();
  });

  it("does not fetch while closed", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(
      <ContextSheet
        open={false}
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("renders schema-missing notice on PGRST205 and hides Bygg-CTA", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST205",
        message: "Could not find the table public.decision_context in the schema cache",
      },
    });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.getByTestId("context-schema-missing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bygg kontext/i })).not.toBeInTheDocument();
  });

  it("renders retry button with error code on other postgres errors", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: "42P01", message: "network blip" },
    });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.getByTestId("context-error")).toBeInTheDocument();
    expect(screen.getByText(/\[42P01\]/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /försök igen/i })).toBeInTheDocument();
  });
});


describe("ContextSheet — body", () => {
  it("renders all populated sections in deterministic order", async () => {
    mockMaybeSingle.mockResolvedValue({ data: fullDc(), error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    const body = screen.getByTestId("context-body");
    const ids = Array.from(body.querySelectorAll("[data-testid^='section-']")).map(
      (n) => n.getAttribute("data-testid"),
    );

    // Order check (evidence BEFORE narrative; analogs collapsed; confidence footer last).
    expect(ids).toEqual([
      "section-decision-card",
      "section-next-step",
      "section-expected-impact",
      "section-what-changed",
      "section-causal",
      "section-related",
      "section-recent-changes",
      "section-risk-drivers",
      "section-evidence",
      // narrative skipped because status='skipped'
      "section-analogs",
      "section-confidence-footer",
    ]);
  });

  it("hides empty sections entirely", async () => {
    const minimal = fullDc({
      what_changed: [],
      causal_signals: [],
      related_signals: [],
      recent_changes: [],
      historical_analogs: [],
      risk: undefined,
      expected_impact: undefined,
      evidence: [],
      recommended_next_step: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: minimal, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    const body = screen.getByTestId("context-body");
    const sections = body.querySelectorAll("[data-testid^='section-']");
    // Only the confidence footer remains.
    expect(sections.length).toBe(1);
    expect(sections[0].getAttribute("data-testid")).toBe("section-confidence-footer");
  });

  it("renders generic-context warning when RC_DC_PRIMARILY_GENERIC_CONTEXT gate is set", async () => {
    const dc = fullDc({
      confidence: {
        value: 0.47,
        band: "medium",
        gate_triggers: ["RC_DC_PRIMARILY_GENERIC_CONTEXT"],
      },
    });
    mockMaybeSingle.mockResolvedValue({ data: dc, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.getByTestId("decision-generic-warning")).toBeInTheDocument();
    expect(screen.getByText(/Primärt generell kontext/)).toBeInTheDocument();
  });

  it("renders narrative only when status='generated'", async () => {
    const withNarrative = fullDc({
      narrative_status: "generated",
      why_this_matters: "Förbättringen drivs av högre CTR [[ev:ev-1]].",
    });
    mockMaybeSingle.mockResolvedValue({ data: withNarrative, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.getByTestId("section-narrative")).toBeInTheDocument();
  });

  it("skipped narrative is not rendered even when text present", async () => {
    const skipped = fullDc({
      narrative_status: "skipped",
      why_this_matters: "Detta ska aldrig renderas.",
    });
    mockMaybeSingle.mockResolvedValue({ data: skipped, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.queryByTestId("section-narrative")).not.toBeInTheDocument();
  });

  it("analogs collapse is closed by default and toggles open", async () => {
    mockMaybeSingle.mockResolvedValue({ data: fullDc(), error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    const analogs = screen.getByTestId("section-analogs");
    // Collapsed: the label text is the only label-only element; the analog item
    // shouldn't be visible yet.
    expect(within(analogs).queryByText(/Tidigare kluster av samma typ/)).not.toBeInTheDocument();

    const toggle = within(analogs).getByRole("button");
    fireEvent.click(toggle);
    expect(within(analogs).getByText(/Tidigare kluster av samma typ/)).toBeInTheDocument();
  });

  it("score-breakdown collapse hidden when no contribution_trace provided", async () => {
    mockMaybeSingle.mockResolvedValue({ data: fullDc(), error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    expect(screen.queryByTestId("section-score-breakdown")).not.toBeInTheDocument();
  });

  it("score-breakdown collapse renders when contribution_trace provided", async () => {
    mockMaybeSingle.mockResolvedValue({ data: fullDc(), error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
        score={{
          value: 72,
          band: "high",
          contribution_trace: [
            {
              component: "buyer_intent",
              raw_value: 0.8,
              weight: 15,
              points_contributed: 12,
              rank: 1,
              reason_codes: [],
              supporting_signals: [],
            },
          ],
        }}
      />,
    );

    await flush();
    expect(screen.getByTestId("section-score-breakdown")).toBeInTheDocument();
  });

  it("confidence footer renders gate triggers in Swedish", async () => {
    const dc = fullDc({
      confidence: {
        value: 0.32,
        band: "low",
        gate_triggers: ["RC_DC_LOW_COVERAGE", "RC_DC_STALE_SIGNALS"],
      },
    });
    mockMaybeSingle.mockResolvedValue({ data: dc, error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
      />,
    );

    await flush();
    const footer = screen.getByTestId("section-confidence-footer");
    expect(within(footer).getByText(/Tillförlitlighet 32%/)).toBeInTheDocument();
    expect(within(footer).getByText(/Få signaler/)).toBeInTheDocument();
    expect(within(footer).getByText(/Inaktuella signaler/)).toBeInTheDocument();
  });
});

describe("ContextSheet — footer actions", () => {
  it("renders up to 3 actions and enforces max-3 invariant", async () => {
    mockMaybeSingle.mockResolvedValue({ data: fullDc(), error: null });

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
        actions={[
          { id: "a", label: "A", onClick: () => {}, variant: "primary" },
          { id: "b", label: "B", onClick: () => {} },
          { id: "c", label: "C", onClick: () => {} },
          { id: "d", label: "D (overflow)", onClick: () => {} },
        ]}
      />,
    );

    await flush();
    const footer = screen.getByTestId("context-footer");
    const buttons = within(footer).getAllByRole("button");
    expect(buttons.length).toBe(3);
    expect(within(footer).queryByText("D (overflow)")).not.toBeInTheDocument();
  });

  it("fires onClick for primary action", async () => {
    mockMaybeSingle.mockResolvedValue({ data: fullDc(), error: null });
    const handler = vi.fn();

    render(
      <ContextSheet
        open
        onOpenChange={() => {}}
        projectId="p1"
        actionItemId="a1"
        title="Test"
        actions={[
          { id: "approve", label: "Godkänn", onClick: handler, variant: "primary" },
        ]}
      />,
    );

    await flush();
    const footer = screen.getByTestId("context-footer");
    fireEvent.click(within(footer).getByText("Godkänn"));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("splitNarrativeCitations", () => {
  it("splits text and citation markers", () => {
    const segs = splitNarrativeCitations("CTR steg [[ev:ev-1]] i april [[ev:ev-2]].");
    expect(segs).toEqual([
      { kind: "text", value: "CTR steg " },
      { kind: "citation", value: "ev-1" },
      { kind: "text", value: " i april " },
      { kind: "citation", value: "ev-2" },
      { kind: "text", value: "." },
    ]);
  });

  it("returns single text segment when no citations", () => {
    expect(splitNarrativeCitations("ingen citation")).toEqual([
      { kind: "text", value: "ingen citation" },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(splitNarrativeCitations("")).toEqual([]);
  });
});
