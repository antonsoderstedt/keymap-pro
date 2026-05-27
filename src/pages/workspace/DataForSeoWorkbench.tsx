import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Search } from "lucide-react";

const SAMPLE = {
  keyword: "rormokare stockholm",
  volume: 2900,
  cpc: 28.5,
  kd: 42,
  competition: "medium",
  trend: "+14% vs foregaende period",
  serp: "Local Pack, Ads, Organisk topp 10",
};

export default function DataForSeoWorkbench() {
  const [keyword, setKeyword] = useState("");
  const [batchValue, setBatchValue] = useState("stambyte pris\nrormokare sodermalm");

  const activeKeyword = useMemo(() => keyword.trim() || SAMPLE.keyword, [keyword]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">DataForSEO</h1>
        <p className="text-sm text-muted-foreground">
          Gor manuell lookup for enskilda sokord eller batch-berikning med exportbar output.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Single lookup</CardTitle>
          <CardDescription>Skriv in ett sokord och hamta volym, CPC, KD, trend och SERP-insikter.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Ange sokord"
            className="max-w-lg"
          />
          <Button>
            <Search className="mr-2 h-4 w-4" />
            Lookup
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultat: {activeKeyword}</CardTitle>
          <CardDescription>
            <Badge variant="outline" className="mr-2">cache</Badge>
            <Badge variant="outline">senast uppdaterad: idag 07:40</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="volume" className="space-y-4">
            <TabsList>
              <TabsTrigger value="volume">Volym</TabsTrigger>
              <TabsTrigger value="trend">Trend</TabsTrigger>
              <TabsTrigger value="serp">SERP</TabsTrigger>
              <TabsTrigger value="kd">KD</TabsTrigger>
              <TabsTrigger value="competition">Konkurrens</TabsTrigger>
            </TabsList>

            <TabsContent value="volume" className="text-sm">
              Sokkvolym: <strong>{SAMPLE.volume.toLocaleString("sv-SE")}</strong> / manad
            </TabsContent>
            <TabsContent value="trend" className="text-sm">Trend: <strong>{SAMPLE.trend}</strong></TabsContent>
            <TabsContent value="serp" className="text-sm">SERP: <strong>{SAMPLE.serp}</strong></TabsContent>
            <TabsContent value="kd" className="text-sm">Keyword difficulty: <strong>{SAMPLE.kd}</strong></TabsContent>
            <TabsContent value="competition" className="text-sm">Konkurrens: <strong>{SAMPLE.competition}</strong>, CPC: <strong>{SAMPLE.cpc} SEK</strong></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch lookup</CardTitle>
          <CardDescription>Klistra in ett sokord per rad for bulk-berikning.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={batchValue}
            onChange={(e) => setBatchValue(e.target.value)}
            className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button>Kor batch</Button>
            <Button variant="outline">Export batch-resultat</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
