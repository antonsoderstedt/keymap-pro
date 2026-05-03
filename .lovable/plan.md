# Skapa migreringsdokumentation

Skapa filen `docs/MIGRATION.md` i projektet med den fullständiga migreringsplanen från Lovable Cloud till eget Supabase-konto.

## Vad som skapas

**Ny fil:** `docs/MIGRATION.md`

Innehåll (Markdown):
1. **Översikt** — syfte och mål med migreringen
2. **Steg 1** — Förbered eget Supabase-projekt (konto, region, plan, nycklar)
3. **Steg 2** — Exportera schema + data + storage + auth users från Lovable Cloud
4. **Steg 3** — Importera schema, data, storage och users till nya projektet
5. **Steg 4** — Flytta secrets (DataForSEO, SEMrush, Firecrawl, Google OAuth/Ads, AI-nyckel, Resend)
6. **Steg 5** — Anpassa edge functions (ersätt Lovable AI Gateway + connector-gateway-anrop)
7. **Steg 6** — Uppdatera frontend (env-variabler, OAuth redirect, regenerera types)
8. **Steg 7** — DNS, custom domain, custom SMTP, smoke-test
9. **Steg 8** — Cutover (read-only, delta-export, switch, backup-period)
10. **Tekniska risker & motåtgärder** (tabell)
11. **Tidsåtgång** (~6–10h aktivt arbete)
12. **Kostnadsjämförelse** Lovable Cloud vs eget Supabase Pro
13. **Rekommendation** — stanna på Lovable Cloud tills konkret behov uppstår

Inga kodändringar görs — endast dokumentationsfilen skapas.
