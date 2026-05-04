// Renodlad regelmodul för wasted-spend → suggested_action.
// Hålls fri från Google Ads-SDK så att den kan testas isolerat med Deno.test.

export type TrackingStatus = "active" | "missing" | "unknown";

export interface RuleInput {
  /** Klick på sökordet senaste 30d */
  clicks: number;
  /** CTR som decimal (0.05 = 5%) */
  ctr: number;
  /** Quality Score 1–10, eller null om okänt */
  qs: number | null;
  /** Total kostnad i SEK senaste 30d */
  cost_sek: number;
  /** Status på konverteringsspårning för hela kontot */
  trackingStatus: TrackingStatus;
}

export type SuggestedAction =
  | "Installera/verifiera konverteringsspårning (hela kontot)"
  | "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)"
  | "Kontrollera landningssida & konverteringsspårning"
  | "Lägg som negativt sökord"
  | "Förbättra QS eller pausa"
  | "Sänk maxbud −40%"
  | "För lite data — vänta"
  | "Granska manuellt";

/**
 * Avgör vilken åtgärd ett wasted-spend-sökord ska få.
 *
 * Prioriteringsordning (viktig — testas):
 * 1. Saknad spårning på kontot ⇒ alltid "Installera/verifiera ..."
 * 2. Högt CTR (≥5%) + Högt QS (≥7) + 0 konv ⇒ landningssida-kontroll
 *    - active spårning  → "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)"
 *    - unknown spårning → "Kontrollera landningssida & konverteringsspårning"
 * 3. Lågt CTR (<1% & >5 klick) ⇒ negativt sökord
 * 4. Lågt QS (≤4) ⇒ förbättra eller pausa
 * 5. Hög kostnad (>1000 SEK) ⇒ sänk bud
 * 6. ≤3 klick ⇒ vänta
 * 7. fallback ⇒ granska manuellt
 */
export function suggestAction(input: RuleInput): SuggestedAction {
  const { clicks, ctr, qs, cost_sek, trackingStatus } = input;

  const highCtr = ctr >= 0.05;
  const lowCtr = ctr < 0.01 && clicks > 5;
  const highQs = qs != null && qs >= 7;
  const lowQs = qs != null && qs <= 4;

  if (trackingStatus === "missing") {
    return "Installera/verifiera konverteringsspårning (hela kontot)";
  }
  if (highCtr && highQs) {
    return trackingStatus === "active"
      ? "Kontrollera landningssida (spårning OK, men 0 konv på detta sökord)"
      : "Kontrollera landningssida & konverteringsspårning";
  }
  if (lowCtr) return "Lägg som negativt sökord";
  if (lowQs) return "Förbättra QS eller pausa";
  if (cost_sek > 1000) return "Sänk maxbud −40%";
  if (clicks <= 3) return "För lite data — vänta";
  return "Granska manuellt";
}
