# SCB Setup (mTLS + Supabase)

Detta dokument beskriver rekommenderad setup for SCB-integration i projektet.

## 1) Forutsattningar

- SCB-certifikat (.pfx) och cert-losenord
- Supabase CLI installerad
- Supabase project ref: `mejxsgutoonckmwnxvdp`

## 2) Konvertera PFX till PEM lokalt

Kors lokalt i en skyddad katalog:

```bash
openssl pkcs12 -in "Certifikat_SokPaVar_A01158_2026-04-01 13-07-35Z.pfx" -clcerts -nokeys -out scb-client-cert.pem
openssl pkcs12 -in "Certifikat_SokPaVar_A01158_2026-04-01 13-07-35Z.pfx" -nocerts -nodes -out scb-client-key.pem
```

Validera att filer skapats:

```bash
ls -lh scb-client-cert.pem scb-client-key.pem
```

## 3) Base64-koda PEM-filer

```bash
CERT_B64=$(base64 < scb-client-cert.pem | tr -d '\n')
KEY_B64=$(base64 < scb-client-key.pem | tr -d '\n')
```

## 4) Logga in Supabase CLI

```bash
supabase login
```

Om du hellre vill undvika login i shell-session, exportera token tillfälligt:

```bash
export SUPABASE_ACCESS_TOKEN="DIN_TOKEN"
```

## 5) Satt secrets

Minsta setup for mTLS + endpoint:

```bash
supabase secrets set \
  SCB_API_BASE_URL="https://DIN_SCB_HOST" \
  SCB_API_PATH_TEMPLATE="/foretag/{orgnr}" \
  SCB_API_CLIENT_CERT_PEM_B64="$CERT_B64" \
  SCB_API_CLIENT_KEY_PEM_B64="$KEY_B64" \
  --project-ref mejxsgutoonckmwnxvdp
```

Om SCB kraver extra auth, lagg till en av varianterna nedan:

```bash
# Variant A: Fardig Authorization-header
supabase secrets set SCB_API_AUTH_HEADER="Basic ..." --project-ref mejxsgutoonckmwnxvdp

# Variant B: username/password
supabase secrets set SCB_API_USERNAME="..." SCB_API_PASSWORD="..." --project-ref mejxsgutoonckmwnxvdp
```

Optional:

```bash
supabase secrets set SCB_API_KEY="..." --project-ref mejxsgutoonckmwnxvdp
```

## 6) Deploy funktion

```bash
supabase functions deploy scb-company-profile --project-ref mejxsgutoonckmwnxvdp
```

## 7) Verifiera i appen

- Ga till Keyword Research-sidan
- Fyll i organisationsnummer i SCB-faltet
- Klicka `SCB`
- Bekrafta att SCB-profil visas
- Kor `Kor keyword research` och kontrollera att kallen `SCB Register` dyker upp i coverage och kalls-taggar

## 8) Felsokning

- `Access token not provided`: kor `supabase login` eller satt `SUPABASE_ACCESS_TOKEN`
- `SCB_API_ERROR [401/403]`: kontrollera auth-header / user-pass och cert
- TLS-fel: kontrollera att cert/key hor ihop och ar korrekt extraherade ur samma .pfx
- Tomt payload-format: kontrollera `SCB_API_PATH_TEMPLATE` sa den matchar aktuell SCB-endpoint

## 9) Sakerhet

- Lagg inte PEM-filer i git
- Dela aldrig cert-losenord i chat eller commit
- Rotera cert/credentials vid minsta misstanke om exponering
