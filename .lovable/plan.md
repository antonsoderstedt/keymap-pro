## Mål
Få "Anslut Google" på Dashboard att fungera utan `Fel 401: invalid_client`.

## Steg

1. **Uppdatera secrets i Lovable Cloud**
   - Begär nya värden för `GOOGLE_OAUTH_CLIENT_ID` och `GOOGLE_OAUTH_CLIENT_SECRET` via secrets-dialogen.
   - Du klistrar in värdena exakt som de står i GCP → APIs & Services → Credentials → din **Web application** OAuth-klient (inte iOS/Android, inte API-nyckel).

2. **Verifiera GCP-konfiguration (du gör detta parallellt)**
   - OAuth-klientens typ är **Web application**.
   - Authorized redirect URIs innehåller exakt:
     `https://mejxsgutoonckmwnxvdp.supabase.co/functions/v1/google-oauth/callback`
   - OAuth consent screen är publicerad eller så är ditt Google-konto tillagt som **Test user**.
   - Scopes `webmasters.readonly` och `analytics.readonly` är tillagda i consent screen.

3. **Deploya om edge functions**
   - `google-oauth`, `gsc-fetch`, `ga4-fetch` deployas så de plockar upp nya secrets.

4. **Testa flödet**
   - Du klickar "Anslut Google" på `/dashboard`.
   - Om det fortfarande felar drar jag loggarna från `google-oauth` och visar exakt felmeddelande från Google.

## Inga kodändringar krävs
All kod från Sprint 2B är redan på plats. Det här är ren konfigurationsfix.