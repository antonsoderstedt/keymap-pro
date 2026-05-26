// R9 — Auto-rebuild stale decision_context rows.
//
// When the fetched row has a `model_version` that doesn't match the
// frontend-side CURRENT_DECISION_CONTEXT_MODEL_VERSION constant, the hook
// must transparently invoke decision-context-build with force:true exactly
// once, and the UI must hide the stale Body while the rebuild is in flight.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextSheet } from "../components/context/ContextSheet";
import type { DecisionContext } from "../lib/types";
import { CURRENT_DECISION_CONTEXT_MODEL_VERSION } from "../lib/decisionContextVersion";

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

function dc(modelVersion: string): DecisionContext {
  return {
    id: "dc-1",
    project_id: "p1",
    action_item_id: "a1",
    scope: { kind: "page", ids: ["page:/foo"] },
    why_this_matters: null,
    narrative_status: "skipped",
    what_changed: [],
    causal_signals: [],
    related_signals: [],
    recent_changes: [],
    historical_analogs: [],
    expected_impact: { p10: 0, p50: 0, p90: 0, currency: "SEK", horizon_days: 30 },
    risk: { band: "low", drivers: [] },
    confidence: { value: 0.5, band: "medium", gate_triggers: [] },
    evidence: [],
    recommended_next_step: "",
    inputs_hash: "abc",
    model_version: modelVersion,
    signals_version: "signals-v1.0.0",
    generated_at: "2026-05-26T12:00:00.000Z",
  };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  mockMaybeSingle.mockReset();
  mockInvoke.mockReset();
});

describe("useDecisionContext — auto-rebuild on stale model_version", () => {
  it("triggers force-rebuild when fetched row has older model_version", async () => {
    // First fetch: stale row. Rebuild call → resolves. Refetch: fresh row.
    mockMaybeSingle
      .mockResolvedValueOnce({ data: dc("decision-context-v1.0.0"), error: null })
      .mockResolvedValueOnce({
        data: dc(CURRENT_DECISION_CONTEXT_MODEL_VERSION),
        error: null,
      });
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

    expect(mockInvoke).toHaveBeenCalledWith(
      "decision-context-build",
      expect.objectContaining({
        body: expect.objectContaining({
          project_id: "p1",
          scopes: [{ kind: "action_item", id: "a1" }],
          force: true,
        }),
      }),
    );
  });

  it("does NOT trigger rebuild when fetched row matches current model_version", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: dc(CURRENT_DECISION_CONTEXT_MODEL_VERSION),
      error: null,
    });
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

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("does not loop when rebuild returns another stale row (guard via autoRebuiltRef)", async () => {
    // Both fetches return stale. Without the guard this would loop forever.
    mockMaybeSingle.mockResolvedValue({
      data: dc("decision-context-v1.0.0"),
      error: null,
    });
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
    await flush();
    await flush();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("hides Body and shows loading skeleton while auto-rebuilding stale row", async () => {
    let resolveInvoke: (v: any) => void = () => {};
    mockMaybeSingle.mockResolvedValueOnce({
      data: dc("decision-context-v1.0.0"),
      error: null,
    });
    // Hold the rebuild open so we can inspect the in-flight UI.
    mockInvoke.mockImplementation(
      () => new Promise((res) => (resolveInvoke = res)),
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

    await flush();

    // While building, the stale Body must NOT be visible.
    expect(screen.queryByTestId("context-body")).not.toBeInTheDocument();
    expect(screen.getByTestId("context-loading")).toBeInTheDocument();

    resolveInvoke({ data: null, error: null });
  });
});
