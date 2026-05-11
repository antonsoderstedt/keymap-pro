
# Datakällor & dataaktualitet

## Problem idag

- Inställningar för GA4 / GSC / Ads ligger utspridda; ingen samlad bild av vad som är kopplat.
- Ingen indikator visar om datan på en sida är färsk eller cachad.
- När en scope saknas (t.ex. `MISSING_ADS_SCOPE`, `ACCESS_TOKEN_SCOPE_INSUFFICIENT`) ser sidor ofta tomma ut utan tydlig handling.
- Reauth-bannern finns men det saknas en plats där man kan se status, byta konto och tvinga ny hämtning.

## Mål

1. Veta på 5 sekunder: är GA4, GSC, Google Ads (och övriga) anslutna och hämtar nytt?
2. På varje sida se: "Uppdaterad för X min sedan" + knapp **Hämta nytt nu**.
3. Ett klick → koppla om Google med rätt scopes, eller byt valt konto/property/site.

## Lösning

### 1. Ny sida: "Datakällor" (`/clients/:id/data-sources`)

Ersätter den nuvarande halvbyggda Anslutningar-sektionen i Inställningar och lyfts till sidomenyn (med grön/orange/röd prick).

För varje datakälla (GA4, GSC, Google Ads, Lovable Cloud, Firecrawl, DataForSEO):

```text
┌────────────────────────────────────────────────────────────────┐
│ ●  Google Analytics 4              Ansluten · GA4 scope OK     │
│    Property: Slay Station (properties/123)         [Byt ▾]     │
│    Senast hämtad: 4 min sedan       [Hämta nytt]  [Koppla om]  │
│    Ev. felmeddelande från senaste anrop                         │
└────────────────────────────────────────────────────────────────┘
```

Status-prick:
- **Grön** — token giltig, scope OK, valt konto svarar 200, senaste hämtning < TTL.
- **Orange** — anslutet men data > TTL eller property/site ej vald.
- **Röd** — token saknas/utgången, scope saknas, eller upstream 4xx.

Knappar:
- **Byt** öppnar dropdown med konton/properties/sajter (från `gsc-fetch sites`, `ga4-fetch properties`, `ads-list-customers`).
- **Hämta nytt** triggar bakgrundshämtning + uppdaterar `last_synced_at`.
- **Koppla om** kör befintlig `reconnectGoogle()`-flöde.
- **Koppla om alla Google-tjänster** högst upp som master-knapp.

### 2. Färskhetschip på varje sida

Liten rad i toppen av Ga4Dashboard, SeoDashboard, GoogleAdsHub, AuctionInsights, AdsAudit m.fl.:

```text
GA4 ● uppdaterad 4 min sedan · cache 30 min  [↻ Hämta nytt]
```

Klick på chip = samma "Hämta nytt"-flöde som datakälla-sidan. Klick på källans namn = navigera till Datakällor.

### 3. Single source of truth: `data_source_status`-tabell

Ny tabell som varje fetch-edge-funktion skriver till efter lyckat/misslyckat anrop:

```text
data_source_status
├ project_id  uuid
├ source      text   ('ga4' | 'gsc' | 'ads' | ...)
├ status      text   ('ok' | 'stale' | 'error' | 'reauth_required')
├ last_synced_at  timestamptz
├ last_error  text
├ ttl_seconds int     -- standard 1800
└ meta        jsonb   -- valt property/site/customer
```

Frontend läser denna tabell + realtime-subscribe för live status.

### 4. Edge-funktion: `data-sources-status`

Engångsanrop som returnerar status för alla källor i ett svep:

- Läser `google_tokens.scope` och jämför mot kraven (`webmasters.readonly`, `analytics.readonly`, `adwords`).
- Pingar light endpoint per källa endast om `last_synced_at` är äldre än TTL.
- Returnerar samlad status + `last_synced_at` + `connectedAccount`.

### 5. Tvinga färsk data när TTL passerats

Ändra `gsc-fetch`, `ga4-fetch`, `ads-diagnose`, `ads-list-customers`, `ga4-revenue-fetch` så att:

- Skriver `data_source_status` efter varje anrop.
- Stödjer `?force=true` i body som förbigår cache (där cache finns, t.ex. `ads_diagnostics_cache`).
- Reauth-svar (befintligt `reauthRequired`) sätter status = `reauth_required` så bannern + datakälla-sidan synkas direkt.

### 6. Sidomenyns visuella signal

Lägg till liten prick bredvid sidor som beror av en källa när källan är röd/orange — så användaren slipper klicka in på en trasig sida.

## Tekniska detaljer

- **Tabell**: `data_source_status` med RLS via befintliga `is_project_member`. Unique på (`project_id`, `source`).
- **Hook**: `useDataSourceStatus(projectId)` som listar alla källor + realtime subscribe på `postgres_changes`.
- **Komponent**: `<DataFreshnessChip source="ga4" projectId={…} />` återanvänds på alla datasidor.
- **Edge-funktion**: ny `data-sources-status` deno-funktion som batch-läser `google_tokens`, `project_google_settings`, `data_source_status` och returnerar normaliserad payload.
- **Återanvänd**: existerande `googleReauth.ts` (banner + toast), `reconnectGoogle()`, `invokeGoogleOauth("disconnect"/"start")`.
- **TTL-default**: 30 min för GA4/GSC, 60 min för Ads-diagnose. Konfigurerbart per projekt senare.
- **Migration**: lägg in `data_source_status` + RLS-policies + en hjälp-RPC `mark_source_status(project_id, source, status, last_error, meta)`.

## Vad jag inte gör i detta steg

- Ingen automatisk schemalagd refresh — bara on-demand + read-on-page-load om data > TTL.
- Inga ändringar i icke-Google-källor (Firecrawl/DataForSEO) utöver att de visas i listan med status från senaste användning.
- Ingen multi-account-koppling per projekt utöver Google Ads (som redan finns).

## Acceptanskriterier

1. På `/data-sources` ser jag alla källor med grön/orange/röd prick + senaste hämtningstid.
2. På Ga4Dashboard, SeoDashboard, GoogleAdsHub, AuctionInsights, AdsAudit visas färskhetschip.
3. "Hämta nytt"-knapp tvingar färsk hämtning och uppdaterar tiden inom 5 sek.
4. När scope saknas → röd prick + reauth-banner triggas direkt utan att jag behöver klicka in på en datasida.
5. "Koppla om alla Google-tjänster" rensar token, startar OAuth med samtliga scopes, redirectar tillbaka och visar grönt.
