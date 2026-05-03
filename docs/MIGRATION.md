# Migreringsplan: Lovable Cloud → Eget Supabase

> **Status:** Referensdokument. Ingen migration är planerad just nu.
> Slay Station kör på **Lovable Cloud** och rekommendationen är att stanna kvar tills ett konkret behov uppstår (se [Rekommendation](#rekommendation) nedan).

## Översikt

Det här dokumentet beskriver hur man flyttar Slay Station från Lovable Cloud till ett eget Supabase-projekt utan att tappa data, edge functions eller integrationer.

**Mål:**
- Full kontroll över Supabase Dashboard (SQL editor, logs, branching, PITR).
- Möjlighet att aktivera auth-providers utöver Google (GitHub, Facebook, Discord, m.fl.).
- Portabilitet — projektet kan användas från andra klienter (mobilapp, externa integrationer).

---

## Steg 1 — Förbered eget Supabase-projekt

- Skapa konto på [supabase.com](https://supabase.com) och nytt projekt.
- Välj region nära nuvarande Lovable Cloud-region (t.ex. `eu-north-1` Stockholm).
- Notera: `Project URL`, `anon key`, `service_role key`, `DB password`, `project ref`.
- Välj plan:
  - **Free** för test/staging
  - **Pro ($25/mån)** för produktion (krävs för dagliga backups, branching, custom SMTP, custom domain)

---

## Steg 2 — Exportera från Lovable Cloud

### Schema
Dumpa alla tabeller, RLS-policies, functions, triggers, enums, storage-bucket-config från nuvarande DB.

### Data
Exportera alla rader från:
- `projects`, `customers`, `analyses`
- `prelaunch_briefs`, `prelaunch_blueprints`
- `user_roles`, `brand_kits`
- Action tracker-tabeller (`action_items`, m.fl.)
- Performance/GSC/GA4-cache-tabeller
- Övriga tabeller enligt `src/integrations/supabase/types.ts`

### Storage
Ladda ner alla filer från bucketen `brand-assets`.

### Auth users
Exportera user-listan (email, metadata) via Supabase Admin API.
**Obs:** Lösenord kan inte flyttas — användare behöver göra password reset.

Output: SQL-fil + CSV/JSON + ZIP med storage-filer.

---

## Steg 3 — Importera till nytt Supabase

1. Kör schema-SQL via Supabase SQL Editor (skapar tabeller, policies, functions, enums).
2. Importera data via `COPY` eller `INSERT`-skript.
3. Återskapa storage-bucket `brand-assets` (public) och ladda upp filerna.
4. Importera auth users via Supabase Admin API; trigga password reset-mail till alla användare.

---

## Steg 4 — Flytta secrets till nya projektet

Sätt följande i nya **Supabase Dashboard → Edge Functions → Secrets**:

| Secret | Källa |
|---|---|
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Befintligt DataForSEO-konto |
| `SEMRUSH_API_KEY` | Befintligt SEMrush-konto |
| `FIRECRAWL_API_KEY` | **Nytt:** registrera på [firecrawl.dev](https://firecrawl.dev) — Lovables connector följer inte med |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Befintligt Google Cloud-projekt |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Befintligt Google Ads-konto |
| `GEMINI_API_KEY` *(eller `OPENAI_API_KEY`)* | **Nytt:** ersätter `LOVABLE_API_KEY` |
| `RESEND_API_KEY` | **Nytt:** registrera på [resend.com](https://resend.com) — connectorn följer inte med |

---

## Steg 5 — Anpassa edge functions

Filer som behöver ändras finns under `supabase/functions/`:

- **AI-anrop:** Ersätt alla anrop till `https://ai.gateway.lovable.dev/...` med direkta Gemini- eller OpenAI-API-anrop.
  - Berör: `analyse`, `prelaunch-research`, `generate-brief`, `generate-strategy`, `generate-ads`, `keyword-universe`, `weekly-briefing`, m.fl.
- **Connector-gateway:** Ersätt alla `https://connector-gateway.lovable.dev/{firecrawl,resend}/...` med direkta API-anrop till respektive tjänst.
- **Deploy:** Använd Supabase CLI:
  ```bash
  supabase login
  supabase link --project-ref <NEW_PROJECT_REF>
  supabase functions deploy
  ```

---

## Steg 6 — Uppdatera frontend

- Byt env-variabler i `.env`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_PROJECT_ID`
- Uppdatera **Google OAuth redirect URIs** i Google Cloud Console till nya Supabase auth-callbacken: `https://<new-ref>.supabase.co/auth/v1/callback`
- Regenerera `src/integrations/supabase/types.ts` mot nya DB:n:
  ```bash
  supabase gen types typescript --project-id <NEW_PROJECT_REF> > src/integrations/supabase/types.ts
  ```

---

## Steg 7 — DNS, domän & verifiering

- Konfigurera **custom domain** i nya Supabase (Pro-feature) om du vill ha t.ex. `api.slaystation.se`.
- Sätt upp **custom SMTP** (t.ex. Resend) för auth-mail.
- Smoke-test:
  - [ ] Skapa nytt projekt
  - [ ] Kör SEO-analys end-to-end
  - [ ] Generera pre-launch-brief
  - [ ] Verifiera GSC-koppling
  - [ ] Verifiera GA4-koppling
  - [ ] Verifiera Google Ads-koppling
  - [ ] Skicka veckorapport
  - [ ] Verifiera RLS (logga in som annan användare)

---

## Steg 8 — Cutover

1. Sätt Lovable Cloud i read-only läge (paus skrivningar via app-flag eller RLS-policy).
2. Kör delta-export av nya rader skapade sedan Steg 2.
3. Importera deltat i nya DB:n.
4. Pekka frontend till nya backend → live.
5. Behåll Lovable Cloud aktivt i **30 dagar** som backup.

---

## Tekniska risker & motåtgärder

| Risk | Åtgärd |
|---|---|
| Lösenord kan inte flyttas | Tvinga password reset, kommunicera i förväg via mail |
| Lovable AI Gateway försvinner | Migrera till egen Gemini API-nyckel ($) |
| Connector-secrets (Firecrawl, Resend) följer ej med | Skaffa egna konton, byt API-anrop |
| Realtime-prenumerationer | Verifiera att `ALTER PUBLICATION supabase_realtime ADD TABLE ...` körs i nya DB:n |
| Edge function cron-jobs | Återskapa via `pg_cron` i nya projektet |
| Storage public URLs ändras | Uppdatera ev. cachade brand-asset-URLs i DB:n |
| OAuth-callback-domän ändras | Uppdatera i Google Cloud Console **innan** cutover |

---

## Tidsåtgång

**~6–10 timmar aktivt arbete** + 1–2 dygn för password resets, DNS-propagering och verifiering.

---

## Kostnadsjämförelse (uppskattning)

| Post | Lovable Cloud (idag) | Eget Supabase Pro |
|---|---|---|
| Backend bas | $25 fri Cloud-balans/mån, sen usage-based | $25/mån fast |
| AI-anrop | $1 fri AI-balans/mån, sen usage-based | Gemini API ~$5–30/mån (volymberoende) |
| Firecrawl | Inkluderat via connector (usage-based) | ~$16+/mån egen plan |
| Resend | Inkluderat via connector | Gratis < 3 000 mail/mån |
| **Total (låg volym)** | **~$25–40/mån** | **~$45–75/mån** |

---

## Rekommendation

**Stanna på Lovable Cloud så länge:**
- Du inte behöver auth-providers utöver Google
- Du inte vill ha en separat mobilapp eller extern klient mot samma DB
- Trafiken är låg–medel (under några tusen aktiva användare)
- Iterationshastighet > infrastrukturkontroll

**Byt till eget Supabase om:**
- En kund kräver egen datakontroll / DPA direkt med Supabase
- Du behöver branching för säkra migrationer på en produktionsdatabas med kunddata
- Du planerar en mobilapp eller andra klienter mot samma backend
- Du behöver GitHub/Facebook/Discord-auth eller andra providers Lovable Cloud inte stödjer

---

*Senast uppdaterad: 2026-05-03*
