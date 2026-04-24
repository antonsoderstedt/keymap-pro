import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, TrendingDown, Eye } from "lucide-react";

// Mock data — becomes live when Google Ads developer token is connected (Phase 3 live).
const MOCK_COMPETITORS = [
  { domain: "competitor-a.se", impressionShare: 0.42, overlapRate: 0.31, positionAbove: 0.18, topOfPage: 0.65, trend: "up" },
  { domain: "competitor-b.se", impressionShare: 0.28, overlapRate: 0.22, positionAbove: 0.12, topOfPage: 0.51, trend: "stable" },
  { domain: "competitor-c.se", impressionShare: 0.21, overlapRate: 0.19, positionAbove: 0.08, topOfPage: 0.43, trend: "down" },
  { domain: "competitor-d.se", impressionShare: 0.15, overlapRate: 0.11, positionAbove: 0.05, topOfPage: 0.38, trend: "up" },
];

export default function AuctionInsights() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="font-serif text-3xl">Auction Insights</h1>
          <Badge variant="outline">Förhandsvisning</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Konkurrent-data från Google Ads: Impression Share, Overlap, Position Above. Aktiveras live när Google Ads-token är på plats.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Live-läge inaktiverat</p>
            <p className="text-muted-foreground mt-1">
              Datan nedan är exempel. När du lägger till Google Ads developer token aktiveras live-fetch automatiskt
              och tabellen fylls med dina riktiga konkurrenter.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> Konkurrenter (senaste 30 dagar)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Domän</th>
                <th className="py-2 pr-4">Impr. Share</th>
                <th className="py-2 pr-4">Overlap</th>
                <th className="py-2 pr-4">Pos. above</th>
                <th className="py-2 pr-4">Top of page</th>
                <th className="py-2 pr-4">Trend</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_COMPETITORS.map(c => (
                <tr key={c.domain} className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">{c.domain}</td>
                  <td className="py-3 pr-4">{(c.impressionShare * 100).toFixed(0)}%</td>
                  <td className="py-3 pr-4">{(c.overlapRate * 100).toFixed(0)}%</td>
                  <td className="py-3 pr-4">{(c.positionAbove * 100).toFixed(0)}%</td>
                  <td className="py-3 pr-4">{(c.topOfPage * 100).toFixed(0)}%</td>
                  <td className="py-3 pr-4">
                    {c.trend === "up" && <TrendingUp className="h-4 w-4 text-destructive" />}
                    {c.trend === "down" && <TrendingDown className="h-4 w-4 text-green-500" />}
                    {c.trend === "stable" && <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">AI-insikter (exempel)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="p-3 rounded-md border border-border">
            <strong>competitor-a.se</strong> ökar Impression Share kraftigt — möjligt nytt offensivt drag.
            Förslag: kolla om ni tappar specifika sökord och justera bud / annonstext.
          </div>
          <div className="p-3 rounded-md border border-border">
            Du tappar 18% av visningar pga budget på Kampanj X (ROAS 4.2). Förslag: höj budget med 20%.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
