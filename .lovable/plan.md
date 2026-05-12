## Problem

Kopplingen är inte trasig — `keyword-universe`-funktionen kör faktiskt klart även på "Maximalt" enligt loggarna (genererar 1212 sökord, berikar med Semrush). Men eftersom `analyse` väntar synkront på svaret och max-skalan tar för lång tid, stängs HTTP-anslutningen ("Http: connection closed before message completed") innan resultatet hinner sparas till `analyses`-raden. UI visar då att max "inte fungerar".

Det är ett **timeout-problem**, inte en datakälls-koppling som tappats.

## Mål: maximalt med data, inga genvägar

Vi bygger om till en bakgrundsjobb-modell där universumet får så lång tid det behöver, och vi **höjer taken** istället för att sänka dem.

### 1. Kör `keyword-universe` som bakgrundsjobb
- `analyse` triggar `keyword-universe` fire-and-forget (via `EdgeRuntime.waitUntil`) och returnerar direkt med `universe_pending: true`.
- `keyword-universe` skriver själv `keyword_universe_json` + `universe_scale` till `analyses`-raden när den är klar — ingen risk för avbruten anslutning.
- Frontend pollar var 5:e sekund (eller via Supabase realtime) och visar "Bygger universum… X sökord hittills" tills datan är skriven.

### 2. Höj taken på max-skalan (mer data)
Nuvarande `max`: 4000 kw, semrushCap 1500. Höjs till:
- `maxKeywords`: 4000 → **8000**
- `aiCities`: 15 → **25** (fler geo-kombinationer)
- `geoPerProduct`: 12 → **20**
- `problemPairs`: 8 → **12**
- `segmentPairs`: 8 → **12**
- `semrushCap`: 1500 → **3000** (KD + SERP features på dubbelt så många)

### 3. Berika allt, parallellt och i batchar
- DataForSEO och Semrush körs i parallell med `Promise.all` istället för sekventiellt.
- Båda batchar i grupper om 500 kw så vi inte träffar API-gränser.
- **Inga timeouts som droppar data** — om Semrush är långsam väntar vi klart. Eftersom det är ett bakgrundsjobb spelar väntetiden ingen roll.
- Retry med backoff per batch om DataForSEO/Semrush returnerar 429/5xx.

### 4. Lägg till en ny "Ultra"-skala (valfritt extra)
Om du vill ha ännu mer data på vissa projekt: `ultra` = 15 000 kw, semrushCap 5000. Tar 5–10 min men ger maximal täckning.

### Tekniska detaljer

**Filer som ändras:**
- `supabase/functions/analyse/index.ts` — för `scale ∈ {max, ultra}`: trigga `keyword-universe` med `EdgeRuntime.waitUntil`, returnera direkt utan att vänta.
- `supabase/functions/keyword-universe/index.ts` — höj `SCALE_CONFIG.max`, lägg till `SCALE_CONFIG.ultra`, kör DataForSEO + Semrush i `Promise.all`, batcha i 500-grupper med retry, skriv resultat direkt till `analyses` om `analysis_id` skickas med, lagra progress (`universe_progress: { stage, count }`) löpande.
- `supabase/functions/enrich-keywords/index.ts` + `enrich-semrush/index.ts` — säkerställ batch-stöd och 3x retry vid 429.
- `src/pages/KeywordUniverse.tsx` + `src/pages/workspace/WorkspaceKeywordUniverse.tsx` — poll-loop var 5:e sek, visa "Bygger… {progress.count} sökord" tills `keyword_universe_json` finns. Knappen "Generera om" disablad medan jobb pågår.
- `src/components/wizard/StepAnalyse.tsx` — uppdatera beskrivningar:
  - Maximalt: "5000–8000 sökord, 2–4 min, körs i bakgrunden"
  - (om ultra) Ultra: "10000–15000 sökord, 5–10 min, körs i bakgrunden"

**Migration:**
- Lägg till kolumn `analyses.universe_progress jsonb` så frontend kan visa "X sökord genererade hittills".

**Vad som inte ändras:**
- Inga datakälls-kopplingar (GA4/GSC/Ads). De fungerar oberoende av detta.
- "Focused" och "Broad" fortsätter köras synkront — de hinner klart.

## Resultat

Du kan välja Maximalt (eller Ultra) och få **dubbelt så mycket data** som idag, utan att UI:t verkar tappa kopplingen. Du ser progress i realtid och universumet sparas korrekt även om det tar 5+ min.