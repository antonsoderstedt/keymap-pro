// R5 — Account Intelligence-vy. Tre stackade paneler: hälsa, jämförelse, tidslinje.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSourceFallback } from "@/components/workspace/SourceFallback";
import { AccountHealthCard } from "@/components/workspace/AccountHealthCard";
import { CampaignComparisonMatrix } from "@/components/workspace/CampaignComparisonMatrix";
import { ChangeTimeline } from "@/components/workspace/ChangeTimeline";
import type { CampaignTreeShape } from "@/components/workspace/accountIntelligenceTypes";

export default function AccountIntelligence() {
  const { id: projectId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [tree, setTree] = useState<CampaignTreeShape | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (force = false) => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ads-fetch-account-tree", {
      body: { project_id: projectId, force },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({
        title: "Kunde inte hämta kontostruktur",
        description: data?.error || error?.message,
        variant: "destructive",
      });
      return;
    }
    setTree((data?.tree as CampaignTreeShape) || null);
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const adsFallback = useSourceFallback({
    projectId: projectId ?? "",
    source: "ads",
    hasData: !!tree && (tree.campaigns?.length ?? 0) > 0,
  });

  if (!projectId) {
    return <Skeleton className="h-64 m-6" />;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:py-14 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Account Intelligence</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Strategisk översikt över kontot — hälsa, kampanjjämförelse och ändringshistorik.
          </p>
          {tree?.fetched_at && (
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
              Hämtat: {new Date(tree.fetched_at).toLocaleString("sv-SE")}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Uppdatera
        </Button>
      </header>

      {adsFallback.state === "block" ? (
        adsFallback.node
      ) : (
        <>
          {adsFallback.node}
          <AccountHealthCard projectId={projectId} tree={tree} treeLoading={loading} />
          <CampaignComparisonMatrix projectId={projectId} tree={tree} treeLoading={loading} />
          <ChangeTimeline projectId={projectId} />
        </>
      )}
    </div>
  );
}
