import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";

export default function SemrushWorkbench() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Semrush</h1>
        <p className="text-sm text-muted-foreground">
          Arbeta med de Semrush-delar som ger operativt varde utan att spegla hela native-plattformen.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sokyta</CardTitle>
          <CardDescription>Valj doman eller konkurrent och analysera gap, visibility och top pages.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input placeholder="Ange doman, t.ex. tryggaror.se" className="max-w-lg" />
          <Button>Analysera</Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capability matrix</CardTitle>
          <CardDescription>Visar vad som ar anslutet, stale eller otillgangligt i denna integration.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Keyword Gap: connected</Badge>
          <Badge variant="secondary">Competitors: connected</Badge>
          <Badge variant="outline">Top Pages: stale</Badge>
          <Badge variant="outline">Visibility: connected</Badge>
          <Badge variant="outline">Backlinks: unavailable</Badge>
          <Badge variant="outline">Changes: connected</Badge>
        </CardContent>
      </Card>

      <Tabs defaultValue="gap" className="space-y-4">
        <TabsList>
          <TabsTrigger value="gap">Keyword Gap</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="top-pages">Top Pages</TabsTrigger>
          <TabsTrigger value="visibility">Visibility</TabsTrigger>
          <TabsTrigger value="backlinks">Backlinks</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
        </TabsList>

        <TabsContent value="gap">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Keyword Gap</CardTitle>
              <CardDescription>Sokord konkurrenter rankar for men ni saknar eller underpresterar pa.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Tabell med gap-lista, volym och opportunity-score renderas har.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="competitors">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competitors</CardTitle>
              <CardDescription>Jamnfor synlighet och overlap mot definierade konkurrenter.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Konkurrentjämförelse renderas har.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top-pages">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Pages</CardTitle>
              <CardDescription>Sidor med hogst organisk potential och forandringshastighet.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Top pages-tabell renderas har.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visibility">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visibility</CardTitle>
              <CardDescription>Trend for synlighet och rank-fordelning over tid.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Visibility-graf renderas har.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backlinks">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Backlinks</CardTitle>
              <CardDescription>Authority- och lanksignal om datan ar tillganglig.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Backlink-oversikt renderas har nar datan ar ansluten.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Changes</CardTitle>
              <CardDescription>Forandringar i ranking, synlighet och gap jamfort med foregaende period.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Changes-feed renderas har.</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
