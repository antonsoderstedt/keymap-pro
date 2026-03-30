import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MARKET_OPTIONS } from "@/lib/types";

interface StepContextProps {
  company: string;
  setCompany: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  market: string;
  setMarket: (v: string) => void;
  products: string;
  setProducts: (v: string) => void;
  knownSegments: string;
  setKnownSegments: (v: string) => void;
}

export default function StepContext({
  company, setCompany, domain, setDomain, market, setMarket,
  products, setProducts, knownSegments, setKnownSegments,
}: StepContextProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl mb-1">Företagskontext</h2>
        <p className="text-sm text-muted-foreground">Beskriv företaget som ska analyseras</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company">Företagsnamn *</Label>
          <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex: TPO Teknik AB" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="domain">Domän</Label>
          <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Ex: tpo.se" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Marknad *</Label>
        <Select value={market} onValueChange={setMarket}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MARKET_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="products">Produkter / Tjänster *</Label>
        <Textarea
          id="products"
          value={products}
          onChange={(e) => setProducts(e.target.value)}
          placeholder="Beskriv era produkter och tjänster, t.ex: Plåtbearbetning, kabelgenomföringar, DIN-skenor, distanshylsor..."
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="segments">Kända kundsegment (valfritt)</Label>
        <Textarea
          id="segments"
          value={knownSegments}
          onChange={(e) => setKnownSegments(e.target.value)}
          placeholder="Ex: Tillverkningsindustri, Bygg, Energi, Marin..."
          rows={3}
        />
      </div>
    </div>
  );
}
