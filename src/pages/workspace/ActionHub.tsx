// Action Hub — Fas 1: Action Tracker, SEO Audit, Alerts, Workspace-översikt.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListChecks, ShieldCheck, Bell, ClipboardCheck } from "lucide-react";
import ActionTracker from "./ActionTracker";
import SeoAudit from "./SeoAudit";
import Alerts from "./Alerts";
import WorkspaceOverview from "./WorkspaceOverview";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";

export default function ActionHub() {
  const { id } = useParams<{ id: string }>();
  const caps = useProjectCapabilities(id);
  const [tab, setTab] = useState("tracker");

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-2">
          <ListChecks className="h-7 w-7 text-primary" /> Action
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Det som ska göras, granskas och larmas om — på ett ställe.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="tracker" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Tracker
          </TabsTrigger>
          <TabsTrigger value="audit" disabled={!caps.hasGSC && !caps.hasAnalysis} className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> SEO Audit
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Alerts
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> Workspace-översikt
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="tracker"><ActionTracker /></TabsContent>
          <TabsContent value="audit"><SeoAudit /></TabsContent>
          <TabsContent value="alerts"><Alerts /></TabsContent>
          <TabsContent value="overview"><WorkspaceOverview /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
