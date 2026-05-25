// Situationsspecifik: Ads-historik. Tunn route som endast nås via Command Bar.
import { useParams } from "react-router-dom";
import { AdsHistoryTab } from "@/components/workspace/AdsHistoryTab";

export default function AdsHistory() {
  const { id: projectId = "" } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:py-14 space-y-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight">Ads-historik</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Audit-trail över pushade ändringar. Situationsspecifik vy.
        </p>
      </header>
      <AdsHistoryTab projectId={projectId} />
    </div>
  );
}
