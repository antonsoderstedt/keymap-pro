import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/types";

export function useWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) setError(error.message);
      setWorkspace((data as Project) ?? null);
      setLoading(false);

      // Touch last_active_at
      if (data) {
        await supabase
          .from("projects")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", id);
      }
    })();
  }, [id]);

  return { workspace, loading, error, workspaceId: id };
}
