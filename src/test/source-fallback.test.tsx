// SourceFallback — degraded-mode rendering tests.
//
// Verifies the contract that the Performance dashboard (and any other surface
// consuming `useSourceFallback`) gets correct UX signals based on the
// per-source health from `useDataSourcesStatus`.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// Mock useDataSourcesStatus to control source status per test.
const mockUseSourceStatus = vi.fn();

vi.mock("@/hooks/useDataSourcesStatus", () => ({
  useSourceStatus: (projectId: string, source: string) => mockUseSourceStatus(projectId, source),
  // Re-export types as plain objects (not used at runtime in tests).
}));

// Mock googleOAuth so reconnectGoogle never tries to hit the network.
vi.mock("@/lib/googleOAuth", () => ({
  reconnectGoogle: vi.fn().mockResolvedValue(undefined),
}));

// Mock sonner toast.
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// Import AFTER mocks.
import { SourceFallback, useSourceFallback } from "../components/workspace/SourceFallback";

function wrap(node: ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

function stubStatus(status: string, extra: Record<string, unknown> = {}) {
  mockUseSourceStatus.mockReturnValue({
    info: {
      source: "gsc",
      status,
      last_synced_at: null,
      last_error: null,
      health_score: status === "ok" ? 100 : 0,
      age_seconds: null,
      ...extra,
    },
    loading: false,
    refresh: vi.fn(),
  });
}

describe("SourceFallback", () => {
  beforeEach(() => {
    mockUseSourceStatus.mockReset();
  });

  it("renders nothing when source is ok and data exists", () => {
    stubStatus("ok");
    const { container } = render(wrap(<SourceFallback projectId="p1" source="gsc" hasData={true} />));
    expect(container.textContent ?? "").toBe("");
  });

  it("renders block panel with reconnect CTA when reauth_required", () => {
    stubStatus("reauth_required");
    render(wrap(<SourceFallback projectId="p1" source="gsc" hasData={false} />));
    expect(screen.getByTestId("source-fallback-block-gsc")).toBeTruthy();
    expect(screen.getByText(/behöver kopplas om/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /koppla om google/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /öppna datakällor/i })).toBeTruthy();
  });

  it("renders block panel without reconnect CTA when not_connected", () => {
    stubStatus("not_connected");
    render(wrap(<SourceFallback projectId="p1" source="ga4" hasData={false} />));
    expect(screen.getByTestId("source-fallback-block-ga4")).toBeTruthy();
    expect(screen.getByText(/är inte ansluten/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /koppla om google/i })).toBeNull();
    expect(screen.getByRole("link", { name: /öppna datakällor/i })).toBeTruthy();
  });

  it("renders block panel with last_error when status is error", () => {
    stubStatus("error", { last_error: "BigQuery quota exceeded" });
    render(wrap(<SourceFallback projectId="p1" source="ads" hasData={false} />));
    expect(screen.getByTestId("source-fallback-block-ads")).toBeTruthy();
    expect(screen.getByText(/kunde inte synkas/i)).toBeTruthy();
    expect(screen.getByText(/bigquery quota exceeded/i)).toBeTruthy();
  });

  it("renders warn banner when status is stale", () => {
    stubStatus("stale", { age_seconds: 3 * 86400 });
    render(wrap(<SourceFallback projectId="p1" source="gsc" hasData={true} />));
    expect(screen.getByTestId("source-fallback-warn-gsc")).toBeTruthy();
    expect(screen.getByText(/kan vara inaktuell/i)).toBeTruthy();
    expect(screen.queryByTestId("source-fallback-block-gsc")).toBeNull();
  });

  it("renders warn banner when status is ok but no data", () => {
    stubStatus("ok");
    render(wrap(<SourceFallback projectId="p1" source="ga4" hasData={false} />));
    expect(screen.getByTestId("source-fallback-warn-ga4")).toBeTruthy();
    expect(screen.getByText(/snapshot är tom/i)).toBeTruthy();
  });

  it("treats missing info as not_connected (block)", () => {
    mockUseSourceStatus.mockReturnValue({ info: null, loading: false, refresh: vi.fn() });
    render(wrap(<SourceFallback projectId="p1" source="gsc" hasData={false} />));
    expect(screen.getByTestId("source-fallback-block-gsc")).toBeTruthy();
    expect(screen.getByText(/är inte ansluten/i)).toBeTruthy();
  });

  it("hook returns correct state for ok+data", () => {
    stubStatus("ok");
    function Probe() {
      const r = useSourceFallback({ projectId: "p1", source: "gsc", hasData: true });
      return <span data-testid="state">{r.state}</span>;
    }
    render(wrap(<Probe />));
    expect(screen.getByTestId("state").textContent).toBe("ok");
  });

  it("hook returns 'block' for not_connected", () => {
    stubStatus("not_connected");
    function Probe() {
      const r = useSourceFallback({ projectId: "p1", source: "gsc", hasData: false });
      return <span data-testid="state">{r.state}</span>;
    }
    render(wrap(<Probe />));
    expect(screen.getByTestId("state").textContent).toBe("block");
  });

  it("hook returns 'warn' for stale", () => {
    stubStatus("stale");
    function Probe() {
      const r = useSourceFallback({ projectId: "p1", source: "gsc", hasData: true });
      return <span data-testid="state">{r.state}</span>;
    }
    render(wrap(<Probe />));
    expect(screen.getByTestId("state").textContent).toBe("warn");
  });
});
