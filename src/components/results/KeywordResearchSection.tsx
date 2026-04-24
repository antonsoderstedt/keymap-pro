import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown, Sparkles, X } from "lucide-react";
import type { ResearchCluster, ResearchKeyword } from "@/lib/types";

type FlatKeyword = ResearchKeyword & { cluster: string; segment: string; clusterIdx: number; rowIdx: number };

interface Props {
  clusters: ResearchCluster[];
  selectedKeywords: Set<string>;
  setSelectedKeywords: (s: Set<string>) => void;
}

type SortKey = keyof ResearchKeyword | "cluster" | "segment" | null;

const VOLUME_ORDER = ["<100", "100-500", "500-2000", "2000+"];
const CPC_ORDER = ["Låg", "Medium", "Hög"];

export default function KeywordResearchSection({ clusters, selectedKeywords, setSelectedKeywords }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [openClusters, setOpenClusters] = useState<Set<number>>(new Set());

  const [search, setSearch] = useState("");
  const [filterSegment, setFilterSegment] = useState("all");
  const [filterChannel, setFilterChannel] = useState("all");
  const [filterIntent, setFilterIntent] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterUsage, setFilterUsage] = useState("all");
  const [hideZero, setHideZero] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const hasRealData = useMemo(
    () => clusters.some((c) => c.keywords?.some((k) => k.dataSource === "real")),
    [clusters],
  );

  const totalKeywords = useMemo(
    () => clusters.reduce((s, c) => s + (c.keywords?.length || 0), 0),
    [clusters],
  );

  const segments = useMemo(
    () => Array.from(new Set(clusters.map((c) => c.segment))),
    [clusters],
  );

  // Flatten all keywords with cluster ref
  const flat: FlatKeyword[] = useMemo(() => {
    const out: FlatKeyword[] = [];
    clusters.forEach((c, ci) => {
      c.keywords?.forEach((k, ki) => {
        out.push({ ...k, cluster: c.cluster, segment: c.segment, clusterIdx: ci, rowIdx: ki });
      });
    });
    return out;
  }, [clusters]);

  // Apply filters
  const filtered = useMemo(() => {
    return flat.filter((k) => {
      if (filterSegment !== "all" && k.segment !== filterSegment) return false;
      if (filterChannel !== "all" && k.channel !== filterChannel) return false;
      if (filterIntent !== "all" && k.intent !== filterIntent) return false;
      if (filterCategory !== "all" && k.category !== filterCategory) return false;
      if (filterUsage !== "all" && k.usage !== filterUsage) return false;
      if (hideZero && k.dataSource === "real" && (k.realVolume || 0) === 0) return false;
      if (search && !k.keyword.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [flat, filterSegment, filterChannel, filterIntent, filterCategory, filterUsage, search, hideZero]);

  // Group filtered by cluster
  const groupedByCluster = useMemo(() => {
    const map = new Map<string, { cluster: ResearchCluster; clusterIdx: number; keywords: FlatKeyword[] }>();
    filtered.forEach((k) => {
      const key = `${k.clusterIdx}`;
      if (!map.has(key)) {
        map.set(key, { cluster: clusters[k.clusterIdx], clusterIdx: k.clusterIdx, keywords: [] });
      }
      map.get(key)!.keywords.push(k);
    });
    // Sort within cluster
    if (sortKey) {
      map.forEach((g) => {
        g.keywords.sort((a, b) => {
          let av: any = (a as any)[sortKey];
          let bv: any = (b as any)[sortKey];
          if (sortKey === "volume") {
            // Prefer real volume when available
            av = a.dataSource === "real" ? (a.realVolume ?? -1) : VOLUME_ORDER.indexOf(a.volume);
            bv = b.dataSource === "real" ? (b.realVolume ?? -1) : VOLUME_ORDER.indexOf(b.volume);
          } else if (sortKey === "cpc") {
            av = a.realCpc ?? CPC_ORDER.indexOf(a.cpc);
            bv = b.realCpc ?? CPC_ORDER.indexOf(b.cpc);
          }
          if (av == null) av = "";
          if (bv == null) bv = "";
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      });
    }
    return Array.from(map.values());
  }, [filtered, clusters, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const kwId = (k: FlatKeyword) => `${k.clusterIdx}::${k.rowIdx}`;

  const toggleKeyword = (k: FlatKeyword) => {
    const id = kwId(k);
    const next = new Set(selectedKeywords);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedKeywords(next);
  };

  const toggleClusterAll = (clusterIdx: number, keywords: FlatKeyword[]) => {
    const ids = keywords.map(kwId);
    const allSelected = ids.every((id) => selectedKeywords.has(id));
    const next = new Set(selectedKeywords);
    if (allSelected) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelectedKeywords(next);
  };

  const toggleCluster = (idx: number) => {
    const next = new Set(openClusters);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setOpenClusters(next);
  };

  const expandAllClusters = () => setOpenClusters(new Set(groupedByCluster.map((g) => g.clusterIdx)));
  const collapseAllClusters = () => setOpenClusters(new Set());

  const clearFilters = () => {
    setSearch(""); setFilterSegment("all"); setFilterChannel("all");
    setFilterIntent("all"); setFilterCategory("all"); setFilterUsage("all");
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ChevronsUpDown className="ml-1 h-3 w-3 inline opacity-50" /> :
    sortDir === "asc" ? <ArrowUp className="ml-1 h-3 w-3 inline text-primary" /> :
    <ArrowDown className="ml-1 h-3 w-3 inline text-primary" />;

  if (!clusters.length) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="font-serif text-xl">Keyword Research</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {clusters.length} kluster · {totalKeywords} sökord · {segments.length} segment
                {selectedKeywords.size > 0 && (
                  <span className="ml-2 text-primary">· {selectedKeywords.size} markerade</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedKeywords.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedKeywords(new Set())} className="gap-1">
                <X className="h-3 w-3" />Avmarkera
              </Button>
            )}
            <Button onClick={() => setExpanded(!expanded)} variant={expanded ? "outline" : "default"} size="sm">
              {expanded ? "Dölj" : `Visa alla sökord (${totalKeywords} st)`}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Filter panel */}
          <div className="grid gap-2 md:grid-cols-6 lg:grid-cols-7">
            <Input
              placeholder="Sök sökord..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:col-span-2 font-mono text-xs"
            />
            <Select value={filterSegment} onValueChange={setFilterSegment}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Segment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla segment</SelectItem>
                {segments.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Kanal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla kanaler</SelectItem>
                <SelectItem value="SEO">SEO</SelectItem>
                <SelectItem value="Ads">Ads</SelectItem>
                <SelectItem value="Båda">Båda</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterIntent} onValueChange={setFilterIntent}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Intent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla intent</SelectItem>
                <SelectItem value="Köp">Köp</SelectItem>
                <SelectItem value="Info">Info</SelectItem>
                <SelectItem value="Nav">Nav</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla kategorier</SelectItem>
                <SelectItem value="Produkt">Produkt</SelectItem>
                <SelectItem value="Tjänst">Tjänst</SelectItem>
                <SelectItem value="Geo">Geo</SelectItem>
                <SelectItem value="Pris">Pris</SelectItem>
                <SelectItem value="Fråga">Fråga</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterUsage} onValueChange={setFilterUsage}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Användning" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All användning</SelectItem>
                <SelectItem value="Landningssida">Landningssida</SelectItem>
                <SelectItem value="Blogg">Blogg</SelectItem>
                <SelectItem value="Ads-grupp">Ads-grupp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
            <span>{filtered.length} av {totalKeywords} sökord visas{hasRealData && " · verklig data från Google Sverige"}</span>
            <div className="flex items-center gap-3 flex-wrap">
              {hasRealData && (
                <div className="flex items-center gap-2">
                  <Switch id="hide-zero" checked={hideZero} onCheckedChange={setHideZero} />
                  <Label htmlFor="hide-zero" className="text-xs cursor-pointer">Dölj 0-volym</Label>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">Rensa filter</Button>
              <Button variant="ghost" size="sm" onClick={expandAllClusters} className="h-7 text-xs">Expandera alla</Button>
              <Button variant="ghost" size="sm" onClick={collapseAllClusters} className="h-7 text-xs">Kollapsa alla</Button>
            </div>
          </div>

          {/* Cluster groups */}
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("keyword")}>Sökord<SortIcon k="keyword" /></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("volume")}>Volym/mån<SortIcon k="volume" /></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("cpc")}>CPC<SortIcon k="cpc" /></TableHead>
                  {hasRealData && (
                    <TableHead className="cursor-pointer" onClick={() => handleSort("competition" as SortKey)}>Konkurrens<SortIcon k={"competition" as SortKey} /></TableHead>
                  )}
                  <TableHead className="cursor-pointer" onClick={() => handleSort("category")}>Kategori<SortIcon k="category" /></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("intent")}>Intent<SortIcon k="intent" /></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("usage")}>Användning<SortIcon k="usage" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByCluster.map((g) => {
                  const isOpen = openClusters.has(g.clusterIdx);
                  const ids = g.keywords.map(kwId);
                  const allSelected = ids.length > 0 && ids.every((id) => selectedKeywords.has(id));
                  const someSelected = ids.some((id) => selectedKeywords.has(id));
                  const totalVolume = g.keywords.reduce((s, k) => s + (k.realVolume || 0), 0);
                  const headerColSpan = hasRealData ? 8 : 7;
                  return (
                    <Collapsible key={g.clusterIdx} open={isOpen} onOpenChange={() => toggleCluster(g.clusterIdx)} asChild>
                      <>
                        <TableRow className="bg-primary/5 hover:bg-primary/10 border-y border-primary/20">
                          <TableCell className="py-2">
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={() => toggleClusterAll(g.clusterIdx, g.keywords)}
                              aria-label="Markera kluster"
                            />
                          </TableCell>
                          <TableCell colSpan={headerColSpan} className="py-2">
                            <CollapsibleTrigger asChild>
                              <button className="flex items-center gap-2 w-full text-left flex-wrap">
                                {isOpen ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                                <span className="font-serif text-sm font-medium">{g.cluster.cluster}</span>
                                <Badge variant="outline" className="font-mono text-xs">{g.keywords.length} sökord</Badge>
                                <Badge variant="secondary" className="text-xs">{g.cluster.segment}</Badge>
                                {hasRealData && totalVolume > 0 && (
                                  <Badge variant="outline" className="font-mono text-xs text-primary border-primary/40">{totalVolume.toLocaleString("sv-SE")}/mån</Badge>
                                )}
                                {someSelected && !allSelected && (
                                  <Badge className="text-xs">{ids.filter((id) => selectedKeywords.has(id)).length} valda</Badge>
                                )}
                              </button>
                            </CollapsibleTrigger>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <>
                            {g.keywords.map((k) => {
                              const id = kwId(k);
                              const sel = selectedKeywords.has(id);
                              const isReal = k.dataSource === "real";
                              const volDisplay = isReal
                                ? `${(k.realVolume || 0).toLocaleString("sv-SE")}`
                                : k.volume;
                              const cpcDisplay = isReal && k.realCpc != null
                                ? `${k.realCpc.toFixed(2).replace(".", ",")} kr`
                                : k.cpc;
                              const compLabel = k.competition == null ? "—"
                                : k.competition < 0.34 ? "Låg"
                                : k.competition < 0.67 ? "Medel" : "Hög";
                              return (
                                <TableRow key={id} className={sel ? "bg-primary/5" : ""}>
                                  <TableCell><Checkbox checked={sel} onCheckedChange={() => toggleKeyword(k)} /></TableCell>
                                  <TableCell className="font-mono text-xs">
                                    <div className="flex items-center gap-2">
                                      <span>{k.keyword}</span>
                                      {!isReal && hasRealData && (
                                        <Badge variant="outline" className="text-[10px] py-0 px-1 opacity-60">Uppskattad</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{volDisplay}</TableCell>
                                  <TableCell className="font-mono text-xs">{cpcDisplay}</TableCell>
                                  {hasRealData && (
                                    <TableCell className="text-xs">{compLabel}</TableCell>
                                  )}
                                  <TableCell><Badge variant="outline" className="text-xs">{k.category}</Badge></TableCell>
                                  <TableCell><Badge variant="secondary" className="text-xs">{k.intent}</Badge></TableCell>
                                  <TableCell className="text-xs">{k.usage}</TableCell>
                                </TableRow>
                              );
                            })}
                          </>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
                {groupedByCluster.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={hasRealData ? 9 : 8} className="text-center text-muted-foreground py-8">Inga sökord matchar filtret</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
