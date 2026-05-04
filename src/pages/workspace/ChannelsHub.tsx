// Channels Hub — Fas 1: samlar alla kanal-vyer i flikar.
// SEO, Google Ads, GA4, Paid vs Organic, Ads Audit, PPC-chat, Veckans briefing.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, TrendingUp, LayoutDashboard, Layers, ShieldCheck, MessageSquare, Sparkles } from "lucide-react";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";
import SeoDashboard from "./SeoDashboard";
import AuctionInsights from "./AuctionInsights";
import Ga4Dashboard from "./Ga4Dashboard";
import PaidVsOrganic from "./PaidVsOrganic";
import AdsAudit from "./AdsAudit";
import AdsChat from "./AdsChat";
import WeeklyBriefing from "./WeeklyBriefing";

export default function ChannelsHub() {
  const { id } = useParams<{ id: string }>();
  const caps = useProjectCapabilities(id);
  const [tab, setTab] = useState("seo");

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-2">
          <Megaphone className="h-7 w-7 text-primary" /> Kanaler
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Allt om SEO, Google Ads, GA4 och korsanalys på ett ställe.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="seo" disabled={!caps.hasGSC} className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> SEO
          </TabsTrigger>
          <TabsTrigger value="ads" disabled={!caps.hasAds} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Google Ads
          </TabsTrigger>
          <TabsTrigger value="ga4" disabled={!caps.hasGA4} className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" /> GA4
          </TabsTrigger>
          <TabsTrigger value="paid-vs-organic" disabled={!caps.hasGA4 || !caps.hasAds} className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Paid vs Organic
          </TabsTrigger>
          <TabsTrigger value="ads-audit" disabled={!caps.hasAds} className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Ads Audit
          </TabsTrigger>
          <TabsTrigger value="ppc-chat" disabled={!caps.hasAds} className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> PPC-chat
          </TabsTrigger>
          <TabsTrigger value="briefing" disabled={!caps.hasGA4 && !caps.hasGSC} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Veckans briefing
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="seo"><SeoDashboard /></TabsContent>
          <TabsContent value="ads"><AuctionInsights /></TabsContent>
          <TabsContent value="ga4"><Ga4Dashboard /></TabsContent>
          <TabsContent value="paid-vs-organic"><PaidVsOrganic /></TabsContent>
          <TabsContent value="ads-audit"><AdsAudit /></TabsContent>
          <TabsContent value="ppc-chat"><AdsChat /></TabsContent>
          <TabsContent value="briefing"><WeeklyBriefing /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
