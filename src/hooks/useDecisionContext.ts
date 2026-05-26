import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DecisionContext } from "@/lib/types";
import { CURRENT_DECISION_CONTEXT_MODEL_VERSION } from "@/lib/decisionContextVersion";

type DcScopeRef =
  | { kind: "action_item"; id: string }
  | { kind: "ads_change_proposal"; id: string };

export type DecisionContextErrorKind = "schema_missing" | "other";

export interface DecisionContextError {
  kind: DecisionContextErrorKind;
  code: string | null;
  message: string;
}

type FetchState = {
  data: DecisionContext | null;
  loading: boolean;
  error: DecisionContextError | null;
};

function classifyError(error: { code?: string | null; message?: string | null }): DecisionContextError {
  const code = error.code ?? null;
  const message = error.message ?? "Okänt fel";
  const isSchemaMissing =
    code === "PGRST205" ||
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message);
  return {
    kind: isSchemaMissing ? "schema_missing" : "other",
    code,
    message,
  };
}

// Reads decision_context for a single action item OR ads change proposal.
// Returns null data (not error) when no row exists yet — caller renders an
// "empty" state with the build CTA.
export function useDecisionContext(
  projectId: string | undefined,
  ref: DcScopeRef | null,
) {
  const [state, setState] = useState<FetchState>({
    data: null,
    loading: false,
    error: null,
  });
  const [building, setBuilding] = useState(false);
  // Tracks which scope+version combos we've already auto-rebuilt so a stale
  // row (or a deploy that hasn't propagated) can't trigger an infinite loop.
  const autoRebuiltRef = useRef<Set<string>>(new Set());

  const fetchOnce = useCallback(async () => {
    if (!projectId || !ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const column =
      ref.kind === "action_item" ? "action_item_id" : "ads_change_proposal_id";
    const { data, error } = await (supabase as any)
      .from("decision_context")
      .select("*")
      .eq("project_id", projectId)
      .eq(column, ref.id)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      setState({ data: null, loading: false, error: classifyError(error) });
      return;
    }
    setState({ data: (data as DecisionContext | null) ?? null, loading: false, error: null });
  }, [projectId, ref?.kind, ref?.id]);


  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  const build = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!projectId || !ref) return { ok: false, error: "missing_scope" as const };
      setBuilding(true);
      try {
        const { error } = await supabase.functions.invoke("decision-context-build", {
          body: {
            project_id: projectId,
            scopes: [{ kind: ref.kind, id: ref.id }],
            force: opts?.force === true,
          },
        });
        if (error) {
          setBuilding(false);
          return { ok: false as const, error: error.message };
        }
        await fetchOnce();
        setBuilding(false);
        return { ok: true as const };
      } catch (e: any) {
        setBuilding(false);
        return { ok: false as const, error: e?.message ?? "unknown" };
      }
    },
    [projectId, ref?.kind, ref?.id, fetchOnce],
  );

  // Auto-rebuild stale rows: when a fetched decision_context was produced by
  // an older MODEL_VERSION, transparently force-rebuild it once. Guarded by
  // autoRebuiltRef so a deploy that hasn't propagated yet can't trigger a
  // rebuild loop on every fetch.
  const staleVersion =
    state.data && state.data.model_version !== CURRENT_DECISION_CONTEXT_MODEL_VERSION
      ? state.data.model_version
      : null;
  useEffect(() => {
    if (!staleVersion || !ref || building) return;
    const key = `${ref.kind}:${ref.id}:${staleVersion}`;
    if (autoRebuiltRef.current.has(key)) return;
    autoRebuiltRef.current.add(key);
    void build({ force: true });
  }, [staleVersion, ref?.kind, ref?.id, building, build]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    building,
    refresh: fetchOnce,
    build,
    isStale: staleVersion !== null,
  };
}
