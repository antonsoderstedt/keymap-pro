
# Verklig sökvolymdata via DataForSEO

## Problem
AI:n gissar sökvolymer — den har ingen tillgång till Googles verkliga data. För svensk B2B är de flesta nischade sökord faktiskt under 100/månad, så AI:n sätter konservativt "<100" på allt. Resultatet: bara 9 av 182 sökord verkar ha volym, exporten blir oanvändbar för prioritering.

## Lösning: DataForSEO Keyword Data API
REST-API som ger:
- Exakt månatlig sökvolym (Google Sverige, location_code 2752, language "sv")
- CPC i SEK
- Konkurrensnivå (0–1)
- 12-månaders trend
- Kostnad: ~$0.05 per 1000 sökord (~5 öre per analys). Gratis $1 vid signup räcker till ~20 analyser.

## Tekniska ändringar

### 1. Secrets
- `DATAFORSEO_LOGIN` och `DATAFORSEO_PASSWORD` läggs till som Lovable Cloud secrets
- Användaren skapar konto på dataforseo.com och hämtar credentials

### 2. Ny tabell: `keyword_metrics` (cache)
```
keyword text PK
location_code int
search_volume int
cpc_sek numeric
competition numeric
trend_json jsonb
updated_at timestamptz default now()
```
Cache i 30 dagar — om sökord finns och är färskt, hoppa över API-anrop. Sparar pengar och tid.

### 3. Ny edge function: `enrich-keywords`
- Tar `{ keywords: string[] }` (max 1000)
- Slår upp i `keyword_metrics` först
- För missade/utgångna: anropar `POST https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live`
  - Body: `[{ keywords, location_code: 2752, language_code: "sv" }]`
  - Auth: Basic auth med login/password
- Skriver tillbaka till cache-tabellen
- Returnerar `Record<string, { volume, cpc, competition, trend }>`

### 4. Uppdatera `analyse` edge function
- Efter AI-genereringen → samla alla unika sökord från alla kluster
- Anropa `enrich-keywords` med listan
- Slå ihop verklig data med AI-data:
  - `volume` ersätts från intervall → exakt tal
  - `cpc` blir riktig SEK-siffra
  - Lägg till `competition` och `dataSource: "real" | "estimated"`
- Sortera kluster efter total volym desc

### 5. Typer (`src/lib/types.ts`)
`ResearchKeyword` får nya fält:
```ts
realVolume?: number;       // exakt månatlig volym
realCpc?: number;          // SEK
competition?: number;      // 0-1
dataSource: "real" | "estimated";
```

### 6. UI (`KeywordResearchSection.tsx`)
- Visa exakt volym ("320/mån") istället för intervall
- CPC i SEK ("12,40 kr")
- Ny kolumn: Konkurrens (Låg/Medel/Hög)
- Default-sortering: volym desc
- Default-filter: dölj sökord med 0 volym (toggle för att visa alla)
- Badge "Uppskattad" på sökord utan verklig data

### 7. Loading state (`StepAnalyse.tsx`)
- Nytt progress-steg: "Hämtar verkliga sökvolymer från Google…" (~10 sek för 200 sökord)

## UX-flöde
1. Användaren startar analys
2. AI genererar 40–60 sökord per segment (~30 sek)
3. **Nytt:** edge function skickar alla sökord till DataForSEO (~10 sek, cachas)
4. Resultattabell visar verkliga volymer + CPC i SEK, sorterat på volym
5. Default: dölj sökord med 0 volym → exporten blir bara användbara sökord

## Vad du behöver göra
1. Skapa konto på [dataforseo.com](https://dataforseo.com) (gratis $1 credit)
2. Hämta API-credentials från deras dashboard → Settings → API
3. Jag ber om `DATAFORSEO_LOGIN` och `DATAFORSEO_PASSWORD` via secrets-prompten när vi börjar

## Alternativ
**Google Ads Keyword Planner** (gratis men krångligt): kräver eget Google Ads-konto, OAuth per användare, 1–2 dagars setup, ger bara intervall-volymer. Inte värt det här.

**Semrush/Ahrefs API**: bättre svensk data men 10–100x dyrare. Overkill för KEYMAP.

DataForSEO är rätt val: billigt, snabbt att integrera, exakta tal.

---

**Säg "Approved" så bygger jag det.** Jag ber om DataForSEO-credentials i första steget.
