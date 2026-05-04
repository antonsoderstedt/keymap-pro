// Sökord & innehåll Hub — Fas 1
// Sökordsuniversum, segment/paket, pre-launch, artefakter, brand kit i flikar.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Layers, Rocket, ClipboardCheck, Palette } from "lucide-react";
import WorkspaceKeywordUniverse from "./WorkspaceKeywordUniverse";
import WorkspaceSegments from "./WorkspaceSegments";
import PrelaunchBlueprint from "./PrelaunchBlueprint";
import WorkspaceArtifacts from "./WorkspaceArtifacts";
import BrandKit from "./BrandKit";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";

export default function KeywordsHub() {
  const { id } = useParams<{ id: string }>();
  const caps = useProjectCapabilities(id);
  const [tab, setTab] = useState(caps.hasKeywordUniverse ? "universe" : "prelaunch");

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-3xl flex items-center gap-2">
          <Search className="h-7 w-7 text-primary" /> Sökord & innehåll
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sökordsuniversum, segmentering, pre-launch, artefakter och varumärkesmaterial.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="universe" className="gap-1.5">
            <Search className="h-3.5 w-3.5" /> Universum
          </TabsTrigger>
          <TabsTrigger value="segments" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Segment
          </TabsTrigger>
          <TabsTrigger value="prelaunch" className="gap-1.5">
            <Rocket className="h-3.5 w-3.5" /> Pre-launch
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> Artefakter
          </TabsTrigger>
          <TabsTrigger value="brand-kit" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" /> Brand Kit
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="universe"><WorkspaceKeywordUniverse /></TabsContent>
          <TabsContent value="segments"><WorkspaceSegments /></TabsContent>
          <TabsContent value="prelaunch"><PrelaunchBlueprint /></TabsContent>
          <TabsContent value="artifacts"><WorkspaceArtifacts /></TabsContent>
          <TabsContent value="brand-kit"><BrandKit /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
