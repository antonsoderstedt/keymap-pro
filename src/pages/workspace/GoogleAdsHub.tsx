// Google Ads Hub — samlar Auction Insights, Audit, Annonsförslag och Chat.
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, LayoutDashboard, ShieldCheck, MessageSquare, Sparkles, GitPullRequest } from "lucide-react";
import AuctionInsights from "./AuctionInsights";
import AdsAudit from "./AdsAudit";
import AdsChat from "./AdsChat";
import DiagnosisPanel from "@/components/workspace/DiagnosisPanel";
import { ProposalsTab } from "@/components/workspace/ProposalsTab";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";

export default function GoogleAdsHub() {
  const [tab, setTab] = useState("overview");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspaceId } = useWorkspace();
  const caps = useProjectCapabilities(id);

  if (caps.loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!caps.hasAds) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-primary" /> Google Ads
          </h1>
        </div>
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Megaphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">Koppla Google Ads för att låsa upp</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Diagnostikmotor med 15 regler, auction insights, wasted spend-analys och RSA-förslag.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate(`/clients/${id}/settings`)}>
              Koppla Google Ads (2 min)
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-2">
          <Megaphone className="h-7 w-7 text-primary" /> Google Ads
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Översikt, audit, annonsförslag och chat — allt om dina Google Ads-kampanjer.
        </p>
      </div>

      {workspaceId && <DiagnosisPanel projectId={workspaceId} />}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" /> Översikt
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Audit
          </TabsTrigger>
          <TabsTrigger value="proposals" className="gap-1.5">
            <GitPullRequest className="h-3.5 w-3.5" /> Förslag
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="overview"><AuctionInsights /></TabsContent>
          <TabsContent value="audit"><AdsAudit /></TabsContent>
          <TabsContent value="proposals"><ProposalsTab projectId={workspaceId} /></TabsContent>
          <TabsContent value="chat"><AdsChat /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
