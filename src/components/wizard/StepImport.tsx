import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, FileSpreadsheet, Hash } from "lucide-react";
import { SAMPLE_CUSTOMERS } from "@/lib/types";

export interface CustomerRow {
  name: string;
  industry: string;
  sni: string;
  domain: string;
  revenue: string;
  frequency: string;
  products: string;
}

interface StepImportProps {
  customers: CustomerRow[];
  setCustomers: (c: CustomerRow[]) => void;
}

const COLUMN_MAP: Record<string, keyof CustomerRow> = {
  "företag": "name", "company": "name", "namn": "name", "name": "name",
  "bransch": "industry", "industry": "industry",
  "sni": "sni", "sni-kod": "sni",
  "domän": "domain", "domain": "domain", "hemsida": "domain", "website": "domain", "url": "domain", "webbplats": "domain", "webb": "domain",
  "omsättning": "revenue", "revenue": "revenue",
  "orderfrekvens": "frequency", "frekvens": "frequency", "frequency": "frequency",
  "produkter": "products", "produkter köpta": "products", "products": "products",
};

function normalizeDomain(v: string): string {
  return v.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim().toLowerCase();
}

function parseInput(raw: string): CustomerRow[] {
  const lines = raw.trim().split("\n");
  if (lines.length < 2) return [];

  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  const mapping: (keyof CustomerRow | null)[] = headers.map((h) => COLUMN_MAP[h] || null);

  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(sep).map((c) => c.trim());
    const row: CustomerRow = { name: "", industry: "", sni: "", domain: "", revenue: "", frequency: "", products: "" };
    mapping.forEach((key, i) => {
      if (key && cols[i]) row[key] = cols[i];
    });
    if (row.domain) row.domain = normalizeDomain(row.domain);
    return row;
  }).filter((r) => r.name);
}

function parseSniInput(raw: string): CustomerRow[] {
  const lines = raw.trim().split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const match = line.match(/^(\d{2,5})\s*[-–—:]?\s*(.*)$/);
    if (!match) return null;
    const sni = match[1];
    const industry = match[2] || "";
    return {
      name: industry ? `${sni} – ${industry}` : `SNI ${sni}`,
      industry,
      sni,
      domain: "",
      revenue: "",
      frequency: "",
      products: "",
    } as CustomerRow;
  }).filter(Boolean) as CustomerRow[];
}

export default function StepImport({ customers, setCustomers }: StepImportProps) {
  const [rawInput, setRawInput] = useState("");
  const [sniInput, setSniInput] = useState("");
  const [mode, setMode] = useState<string>("customers");

  const handleParse = () => {
    const parsed = parseInput(rawInput);
    if (parsed.length > 0) {
      setCustomers([...customers, ...parsed]);
      setRawInput("");
    }
  };

  const handleSniParse = () => {
    const parsed = parseSniInput(sniInput);
    if (parsed.length > 0) {
      setCustomers([...customers, ...parsed]);
      setSniInput("");
    }
  };

  const loadSample = () => {
    const parsed = parseInput(SAMPLE_CUSTOMERS);
    setCustomers(parsed);
    setRawInput("");
  };

  const removeCustomer = (index: number) => {
    setCustomers(customers.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl mb-1">Importera kunddata</h2>
        <p className="text-sm text-muted-foreground">Lägg till kunddata eller SNI-koder för analys</p>
      </div>

      <Tabs value={mode} onValueChange={setMode}>
        <TabsList>
          <TabsTrigger value="customers" className="gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Kunddata
          </TabsTrigger>
          <TabsTrigger value="sni" className="gap-2">
            <Hash className="h-3.5 w-3.5" />
            Enbart SNI-koder
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          <div className="space-y-2">
            <Label>Klistra in kunddata</Label>
            <Textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={"Företag\tBransch\tSNI\tDomän\tOmsättning\tOrderfrekvens\tProdukter köpta\nAlfa Mekanik AB\tTillverkning\t25620\talfamekanik.se\t45 MSEK\tMånatlig\tKabelgenomföring plåt"}
              rows={6}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button onClick={handleParse} disabled={!rawInput.trim()}>Importera</Button>
              <Button variant="outline" onClick={loadSample} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Ladda exempeldata
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sni" className="space-y-4">
          <div className="space-y-2">
            <Label>SNI-koder</Label>
            <p className="text-xs text-muted-foreground">Ange en SNI-kod per rad, med valfri beskrivning. T.ex. "25620 - Tillverkning av lås"</p>
            <Textarea
              value={sniInput}
              onChange={(e) => setSniInput(e.target.value)}
              placeholder={"25620 - Tillverkning av lås\n41200 - Byggverksamhet\n62010 - Dataprogrammering"}
              rows={6}
              className="font-mono text-xs"
            />
            <Button onClick={handleSniParse} disabled={!sniInput.trim()}>Lägg till SNI-koder</Button>
          </div>
        </TabsContent>
      </Tabs>

      {customers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{customers.length} poster importerade</Label>
            <Button variant="destructive" size="sm" onClick={() => setCustomers([])} className="gap-2">
              <X className="h-3.5 w-3.5" />
              Rensa alla
            </Button>
          </div>
          <div className="rounded-md border border-border overflow-auto max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn / SNI</TableHead>
                  <TableHead>Bransch</TableHead>
                  <TableHead>SNI</TableHead>
                  <TableHead>Domän</TableHead>
                  <TableHead>Omsättning</TableHead>
                  <TableHead>Produkter</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.industry}</TableCell>
                    <TableCell className="font-mono text-xs">{c.sni}</TableCell>
                    <TableCell className="text-xs">{c.domain}</TableCell>
                    <TableCell className="text-xs">{c.revenue}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{c.products}</TableCell>
                    <TableCell>
                      <button onClick={() => removeCustomer(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
