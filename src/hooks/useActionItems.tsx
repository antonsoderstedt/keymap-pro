import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActionItem {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  source_type: string | null;
  source_id: string | null;
  source_payload: any;
  expected_impact: string | null;
  baseline_metrics: any;
  implemented_at: string | null;
  implementation_notes: string | null;
  due_date: string | null;
  notes?: any;
  created_at: string;
  updated_at: string;
}

export function useActionItems(projectId: string | undefined) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data } = await supabase
      .from("action_items")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    setItems((data as ActionItem[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async (payload: Partial<ActionItem>) => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from("action_items")
      .insert({ ...payload, project_id: projectId, title: payload.title || "Ny åtgärd" } as any)
      .select()
      .single();
    if (!error && data) setItems((p) => [data as ActionItem, ...p]);
    return { data, error };
  };

  const update = async (id: string, patch: Partial<ActionItem>) => {
    const { data, error } = await supabase
      .from("action_items")
      .update(patch as any)
      .eq("id", id)
      .select()
      .single();
    if (!error && data) {
      setItems((prev) => prev.map((i) => (i.id === id ? (data as ActionItem) : i)));
    }
    return { data, error };
  };

  const remove = async (id: string) => {
    await supabase.from("action_items").delete().eq("id", id);
    setItems((p) => p.filter((i) => i.id !== id));
  };

  const markImplemented = async (id: string, notes?: string) => {
    return update(id, {
      status: "done",
      implemented_at: new Date().toISOString(),
      implementation_notes: notes ?? null,
    });
  };

  return { items, loading, reload, create, update, remove, markImplemented };
}
