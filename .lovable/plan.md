## Mål

Applicera de fyra korrigeringarna från `prompt-9b-keyword-intelligence-patch.md` så att de redan ligger inne när Keyword Intelligence v2 byggs. Patchen rör endast backend (edge functions + en ny tabell) — ingen UI-ändring.

## Ordning

Eftersom filerna som patchen redigerar (`_shared/keyword-intel/scoring.ts`, `opportunities.ts`, samt nya block i `keyword-universe/index.ts`) ännu inte finns, gör vi så här:

1. **Skapa cache-tabellen nu** (kan stå själv, blockerar inget).
2. **Baka in fyra fixarna direkt** när v2-motorn implementeras i nästa steg — patch-dokumentet blir då en kravspec, inte en separat redigeringsomgång.

## Steg 1 — Migration: `keyword_serp_cache`

Ny global cache-tabell för DataForSEO SERP-svar (PAA + related searches), 14 dagars TTL, ingen RLS (publik sökmotor-data, service-role only).

```sql
CREATE TABLE public.keyword_serp_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword       text NOT NULL,
  location_code integer NOT NULL DEFAULT 2752,
  result_json   jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);
CREATE UNIQUE INDEX idx_kw_serp_cache_kw ON public.keyword_serp_cache(keyword, location_code);
CREATE INDEX idx_kw_serp_cache_expires ON public.keyword_serp_cache(expires_at);
```

## Steg 2 — Fyra fixar (appliceras när v2 byggs)

**Fix 1 — `businessRelevanceScore` i `scoring.ts`:** Token/ordgräns istället för naken `includes()`. Min 3 tecken; "stark match" = helt ord/ordstart, "medium match" = prefix ≥5 tecken inuti token. Eliminerar falskt positiva som "stålsättning katt" från en `productTerms`=["stål"].

**Fix 2 — Negativa sökord:** I `keyword-universe/index.ts` PASS 4: skippa scoring för `isNegative` ELLER negativa-kluster, tvinga `priority = "skip"`. I `opportunities.ts`: lägg till `!kw.isNegative && kw.priority !== "skip"` i alla `universe.filter()`-anrop (`quick_dominance`, `service_gap`, `striking_distance_cluster`, `geo_opportunity`).

**Fix 3 — `payback_weeks`:** Ny hjälpfunktion `contentCostByWorkspaceType()` i `scoring.ts` (b2b_manufacturer 12000, b2b_service 10000, d2c_brand 6000, local_service 4000, ecommerce 5000, default 8000). `calcRevenue` använder denna istället för hardcoded 8000.

**Fix 4 — SERP-expansion med cache + cap:** I `keyword-universe/index.ts` PASS 3b — ersätt befintligt SERP-block med:
- `MAX_SERP_CALLS = 10` per körning
- `fetchSerpForSeed()` läser cache först (`expires_at > now()`); cache miss → live-anrop bara om under cap → upsert till cache
- Sekventiell körning av seeds (sparar pengar vid cache-missar)
- Loggar `live_calls` + `cache_hits` i progress-meta

## Filer

| Fil | Åtgärd |
|---|---|
| `supabase/migrations/<ts>_keyword_serp_cache.sql` | NY (Steg 1) |
| `_shared/keyword-intel/scoring.ts` | Skapas i v2 med Fix 1 + Fix 3 inbakat |
| `_shared/keyword-intel/opportunities.ts` | Skapas i v2 med Fix 2 inbakat |
| `keyword-universe/index.ts` | Uppdateras i v2 med Fix 2 (effectivePriority) + Fix 4 (cache+cap) |

Inga UI-ändringar, inga andra edge functions.

## Efter denna patch

Kör v2-huvudprompten — fixarna ovan är redan en del av kraven.
