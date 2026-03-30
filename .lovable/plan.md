
# KEYMAP — AI-drivet B2B Keyword Research-verktyg

## Design
- **Mörkt tema**: Bakgrund `#0d0d0f`, ytor `#1a1a1e`, borders `#2a2a2e`
- **Accentfärg**: Lime/grön `#b8f542`
- **Typsnitt**: Monospace (JetBrains Mono) för labels/data, serif (Playfair Display) för rubriker
- **Professionell, minimal UI**

## Backend (Lovable Cloud / Supabase)
- **Auth**: Email/lösenord (ingen profiltabell)
- **Tabeller**:
  - `projects` — id, user_id, name, company, domain, market, products, known_segments, created_at
  - `customers` — id, project_id, name, industry, sni, domain, revenue, frequency, products
  - `analyses` — id, project_id, options (jsonb), result_json (jsonb), scan_data_json (jsonb), created_at
- **RLS**: Användare ser bara sina egna projekt/kunder/analyser

## Edge Functions
1. **`analyse`** — Tar project_id + valda moduler, hämtar kunddata, anropar Lovable AI (Gemini), sparar & returnerar resultat-JSON
2. **`webscan`** — Tar lista med domäner, använder Firecrawl för att scrapa dom, sedan AI-analys av innehållet (whatTheyDo, languageTheyUse, likelyNeeds, searchIntentHints)

## Sidor & flöde

### 1. Login/Register
- Email/lösenord via Supabase Auth

### 2. Dashboard (`/dashboard`)
- Lista alla projekt med namn, datum, status
- Knapp: Skapa nytt projekt

### 3. Nytt projekt — Steg-wizard (`/project/:id`)
**Steg 1 — Företagskontext**
- Formulär: Företagsnamn, domän, marknad (dropdown), produkter/tjänster, kända segment
- Validering innan vidare

**Steg 2 — Kunddata Import**
- Textarea för bulk-paste (tab/komma-separerat)
- Auto-kolumndetektering med mappning (Företag, Bransch, SNI, Domän, Omsättning, Frekvens, Produkter)
- Visar importerad lista, möjlighet ta bort rader
- "Ladda exempeldata"-knapp
- Sparar till `customers`-tabellen

**Steg 3 — Analysval & Kör**
- Checkboxar: Segmentanalys, Keyword Clusters, Expansion, Ads-struktur, Quick Wins, Webbscan
- Kör-knapp → loading med progress-steg

### 4. Resultat (`/project/:id/results`)
**Tabs:**
- **Segment** — Kort per segment med opportunityScore, howTheySearch, languagePatterns, useCases, primaryKeywords
- **Keywords** — Tabell per kluster med keyword, typ, kanal, volym, svårighet, CPC
- **Expansion** — Kort med nya segment, motivering, topKeywords
- **Google Ads** — Kampanjer → annonsgrupper med broad/phrase/exact/negativa
- **Quick Wins** — Grid med sökord, motivering, åtgärd
- **Webbscan** — Kort per skannat företag (om vald)

### 5. Export
- CSV-export av alla keywords (Kategori, Sökord, Kanal, Intent, Volym)
- Kopiera JSON
- CSV-export av Ads-struktur

## Firecrawl-integration
- Connector kopplas för webbscan-funktionen
- Edge function scrapar kunddomäner via Firecrawl, skickar scrapad data till AI för analys

## UX-detaljer
- Steg-navigation med statusindikator (1/2/3)
- localStorage backup av formulärdata
- Animerad loading med realistiska progress-meddelanden
- Tydliga felmeddelanden med åtgärdsförslag
- Resultat sparas automatiskt, kan laddas från dashboard
