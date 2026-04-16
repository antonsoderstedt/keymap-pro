

# Stöd för SNI-koder utan kunddata

## Problem
Idag kräver steg 2 minst en kund med namn för att gå vidare. En användare som bara har SNI-koder (t.ex. 25620, 41200) men inga specifika kundnamn kan inte använda verktyget.

## Lösning
Lägg till ett alternativt inputläge i steg 2 där användaren kan mata in SNI-koder direkt, utan att behöva ange kunddata.

### Ändringar

**1. StepImport.tsx — Lägg till SNI-inputläge**
- Två flikar/lägen: "Kunddata" (befintlig) och "Enbart SNI-koder"
- SNI-läget: en textarea där man klistrar in SNI-koder (en per rad eller kommaseparerat), med valfri branschbeskrivning
- Varje SNI-kod skapar en "tom" CustomerRow med bara sni-fält (och eventuellt industry) ifyllt, name sätts till SNI-koden
- Visa listan med inmatade SNI-koder i en enklare tabell

**2. ProjectWizard.tsx — Tillåt att gå vidare utan fullständig kunddata**
- Ändra `canProceed()` för steg 1: tillåt om antingen `customers.length > 0` ELLER om SNI-koder finns
- I praktiken genererar SNI-läget CustomerRow-objekt, så samma dataflöde behålls

**3. analyse edge function — Hantera SNI-only**
- Redan idag skickas kunddata till AI-prompten. SNI-koder utan kundnamn funkar redan i prompten — AI:n kan analysera baserat på branschkoder. Ingen ändring krävs i edge function.

### UX-flöde
Steg 2 får en toggle/tabs överst:
- **Med kunddata** — befintlig paste-import
- **Bara SNI-koder** — enkel textarea, t.ex. "25620 - Tillverkning av lås" per rad, plus en "Lägg till"-knapp

