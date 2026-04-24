import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Megaphone, FileText, MapPin, BookOpen, Sparkles } from "lucide-react";
import { SectionHeader } from "../SectionHeader";
import { KeywordTable } from "../KeywordTable";
import { AdsExportModal } from "@/components/universe/AdsExportModal";
import type { KeywordUniverse } from "@/lib/types";

interface Props {
  universe: KeywordUniverse;
  projectId: string;
  analysisId: string | null;
}

export function ChannelsSection({ universe, projectId, analysisId }: Props) {
  const [adsOpen, setAdsOpen] = useState(false);

  const seo = useMemo(() => universe.keywords.filter((k) => (k.channel === "SEO" || k.channel === "Landing Page") && !k.isNegative).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const ads = useMemo(() => universe.keywords.filter((k) => k.channel === "Google Ads" && !k.isNegative && k.intent === "transactional").sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const content = useMemo(() => universe.keywords.filter((k) => k.channel === "Content" && !k.isNegative).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const local = useMemo(() => universe.keywords.filter((k) => k.channel === "Lokal SEO" && !k.isNegative).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)), [universe]);
  const negatives = useMemo(() => universe.keywords.filter((k) => k.isNegative), [universe]);

  return (
    <section id="channels" className="scroll-mt-6 space-y-6">
      <SectionHeader
        number={4}
        title="Kanaler"
        description="Sökorden uppdelade efter rätt kanal. Varje flik visar de sökord som passar bäst för respektive insats."
        action={
          analysisId && (
            <Button onClick={() => setAdsOpen(true)} className="gap-2">
              <Megaphone className="h-4 w-4" /> Google Ads Editor
            </Button>
          )
        }
      />

      {analysisId && (
        <AdsExportModal open={adsOpen} onClose={() => setAdsOpen(false)} universe={universe} projectId={projectId} analysisId={analysisId} />
      )}

      <Tabs defaultValue="seo">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="seo" className="gap-1.5"><FileText className="h-3.5 w-3.5" />SEO ({seo.length})</TabsTrigger>
          <TabsTrigger value="ads" className="gap-1.5"><Megaphone className="h-3.5 w-3.5" />Google Ads ({ads.length})</TabsTrigger>
          <TabsTrigger value="content" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Content ({content.length})</TabsTrigger>
          <TabsTrigger value="local" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />Lokal ({local.length})</TabsTrigger>
          <TabsTrigger value="negatives" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Negativa ({negatives.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="seo" className="mt-4"><KeywordTable items={seo} /></TabsContent>
        <TabsContent value="ads" className="mt-4"><KeywordTable items={ads} /></TabsContent>
        <TabsContent value="content" className="mt-4"><KeywordTable items={content} /></TabsContent>
        <TabsContent value="local" className="mt-4"><KeywordTable items={local} /></TabsContent>
        <TabsContent value="negatives" className="mt-4"><KeywordTable items={negatives} /></TabsContent>
      </Tabs>
    </section>
  );
}
