# Keyword Research-modul i KEYMAP Pro

## 1. Datamodell — `src/lib/types.ts`

Lägg till `keywordResearch: boolean` i `AnalysisOptions`. Lägg till nya typer:

```ts
export type ResearchCategory = "Produkt" | "Tjänst" | "Geo" | "Pris" | "Fråga";
export type ResearchChannel = "SEO" | "Ads" | "Båda";
export type ResearchVolume = "<100" | "100-500" | "500-2000" | "2000+";
export type ResearchCpc = "Låg" | "Medium" | "Hög";
export type ResearchIntent = "Köp" | "Info" | "Nav";
export type ResearchUsage = "Landningssida" | "Blogg" | "Ads-grupp";

export interface ResearchKeyword {
  keyword: string;
  category: ResearchCategory;
  channel: ResearchChannel;
  volume: ResearchVolume;
  cpc: ResearchCpc;
  intent: ResearchIntent;
  usage: ResearchUsage;
}

export interface ResearchCluster {
  cluster: string;          // t.ex. "Laserskärning — pris & offert"
  segment: string;          // tillhör vilket segment
  recommendedH1: string;
  metaDescription: string;
  urlSlug: string;
  keywords: ResearchKeyword[];
}
```

Lägg till `keywordResearch?: ResearchCluster[]` i `AnalysisResult`.

## 2. Edge function — `supabase/functions/analyse/index.ts`

När `options.keywordResearch === true`, kör en separat AI-pass **per segment** (efter att huvudanalysen är klar) som genererar 40–60 sökord i tre logiska steg i en enda prompt:

- **Pass 1 — Kärnsökord** (8–12 termer): tjänstenamn, produktnamn, branschtermer från segmentets `primaryKeywords` + `languagePatterns`.
- **Pass 2 — Matrisexpansion** (20–30 termer): kombinera kärntermer med modifiers:
  - **Pris/offert**: pris, kostnad, offert, prisförslag
  - **Leverans**: snabb, express, online, leveranstid
  - **Geo**: Stockholm, Göteborg, Malmö, Sverige (eller marknadsspecifikt)
  - **Intent**: köpa, beställa, hitta leverantör, jämför
  - **Format**: liten serie, prototyp, engångsbeställning, volym
- **Pass 3 — Long-tail/frågor** (10–15 termer): "hur [verb] [tjänst]", "var köper man [produkt]", "bästa [tjänst] för [bransch]".

Använd **tool calling** (structured output) med Gemini 2.5 Flash för att garantera korrekt JSON-format. Schema: array av `ResearchKeyword` + en clustering-pass som grupperar dem semantiskt och genererar `cluster`-namn, `recommendedH1`, `metaDescription`, `urlSlug`.

För att hålla kostnaden nere körs alla tre passen i **samma prompt** per segment, inte tre separata API-calls. Clustering kan också göras i samma pass.

Spara `keywordResearch` som array av `ResearchCluster` i `result_json`.

## 3. Wizard — `src/components/wizard/StepAnalyse.tsx`

Lägg till ny modul i `modules`-arrayen:
```ts
{ key: "keywordResearch", label: "Keyword Research (40–60/segment)",
  desc: "Djup sökordsforskning med matrisexpansion och long-tail per segment", icon: Search }
```

Default-aktiverad i `ProjectWizard.tsx` initial state.

## 4. UI-komponent — `src/components/results/KeywordResearchSection.tsx` (ny)

Renderas i `Results.tsx` under tab "Segments" (eller egen tab). Funktioner:

- **Header**: "Keyword Research" + "Visa alla sökord (X st)"-knapp som expanderar/kollapsar sektionen
- **Filterpanel** (badges/selects): Segment, Kanal, Intent, Kategori, Användning
- **Sortering** på alla kolumner (klickbar TableHead med pil-ikon)
- **Klustergruppering**: varje kluster är en kollapsbar rad (Collapsible) med kluster-namn + antal sökord + score
- **Checkbox per rad** för att markera enskilda sökord — markerade sparas i state och kan exporteras separat
- Kolumner: ☐ | Sökord | Kategori | Kanal | Volym | CPC | Intent | Användning
- Mörkt tema, mono-font för sökord, lime-accent på markerade rader

## 5. Tre nya export-knappar — `src/pages/Results.tsx`

Ersätt nuvarande "Keywords CSV" med en dropdown eller tre knappar:

- **SEO Export** (`keymap-seo.csv`): Sökord, Kluster, Kategori, Intent, Volym, Rekommenderad sidtitel (= cluster.recommendedH1)
- **Google Ads Export** (`keymap-ads.csv`): Kampanj (= segment), Annonsgrupp (= cluster.cluster), Sökord, Match Type ("Phrase" default), Max CPC-rekommendation (mappad från cpc-nivå: Låg=10 SEK, Medium=25 SEK, Hög=50 SEK)
- **Landningssidor Export** (`keymap-landing.csv`): Kluster, H1, Meta description, URL-slug, Antal sökord

Om användaren har valt sökord via checkboxarna → exportera bara markerade.

## 6. Teknik & QA

- Behåll mörkt tema (`bg-card`, `border-border`, `text-primary` lime).
- Använd befintliga shadcn-komponenter: `Table`, `Collapsible`, `Checkbox`, `Select`, `Badge`, `Button`.
- Ingen DB-migration behövs — `result_json` är jsonb och rymmer det nya fältet.
- Bakåtkompatibilitet: gamla analyser utan `keywordResearch` ska fortsatt fungera (rendera tomt om `undefined`).
