// Google Ads Hub — samlar Auction Insights, Audit, Annonsförslag och Chat.
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone, LayoutDashboard, ShieldCheck, MessageSquare, Sparkles } from "lucide-react";
import AuctionInsights from "./AuctionInsights";
import AdsAudit from "./AdsAudit";
import AdsChat from "./AdsChat";

export default function GoogleAdsHub() {
  const [tab, setTab] = useState("overview");

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

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" /> Översikt
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Audit
          </TabsTrigger>
          <TabsTrigger value="ads" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Annonsförslag
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="overview"><AuctionInsights /></TabsContent>
          <TabsContent value="audit"><AdsAudit /></TabsContent>
          <TabsContent value="ads">
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-serif text-xl mb-2">Kommer i nästa version</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  AI-genererade RSA-annonser med push direkt till ditt Google Ads-konto. Vi förbereder funktionen nu.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="chat"><AdsChat /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
