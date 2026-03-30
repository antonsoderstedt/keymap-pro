import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, FileSpreadsheet } from "lucide-react";
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
  "domän": "domain", "domain": "domain", "hemsida": "domain", "website": "domain",
  "omsättning": "revenue", "revenue": "revenue",
  "orderfrekvens": "frequency", "frekvens": "frequency", "frequency": "frequency",
  "produkter": "products", "produkter köpta": "products", "products": "products",
};

function parseInput(raw: string): CustomerRow[] {
  const lines = raw.trim().split("\n");
  if (lines.length < 2) return [];

  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());

  const mapping: (keyof CustomerRow | null)[] = headers.map((h) => COLUMN_MAP[h] || null);

  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(sep).map((c) => c.trim());
    const row: CustomerRow = { name: "", industry: "", sni: "", domain: "", revenue: "", frequency: "", products: "" };
    mapping.forEach((key, i) => {
      if (key && cols[i]) row[key] = cols[i];
    });
    return row;
  }).filter((r) => r.name);
}

export default function StepImport({ customers, setCustomers }: StepImportProps) {
  const [rawInput, setRawInput] = useState("");

  const handleParse = () => {
    const parsed = parseInput(rawInput);
    if (parsed.length > 0) {
      setCustomers([...customers, ...parsed]);
      setRawInput("");
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
        <p className="text-sm text-muted-foreground">Klistra in kunddata från Google Sheets eller Excel (tab- eller kommaseparerat)</p>
      </div>

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

      {customers.length > 0 && (
        <div className="space-y-2">
          <Label>{customers.length} kunder importerade</Label>
          <div className="rounded-md border border-border overflow-auto max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Företag</TableHead>
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
