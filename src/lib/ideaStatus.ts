// R3a — central derivation av idea-status för keywords.
//
// Idag finns ingen explicit "verification status"-kolumn på keyword-nivå.
// Trust härleds från två fält:
//   - `dataSource: "real" | "estimated"`  → "real" betyder att volym/CPC/competition
//     hämtats från DataForSEO/Google Ads/GSC (verifierad demand).
//   - `isNegative?: boolean`              → operatören har markerat det som
//     negativt sökord (exkluderingslogik, inte demand-signal).
//
// Den här filen centraliserar predikatet bakom ett namngivet koncept så att
// downstream-ytor (badge, filter, tabs i R3b) inte duplicerar `dataSource !== "real"`-
// kontroller spridda i olika filer.
//
// Ingen DB-ändring. Inga edge function-ändringar. Ingen scoring-påverkan.

import type { UniverseKeyword } from "./types";

export type IdeaStatus =
  | "verified"          // demand verifierad via extern källa (DataForSEO/GSC/Ads)
  | "unverified_idea"   // AI-genererad eller estimerad — inte validerad mot någon datakälla
  | "negative";         // operatören har markerat som negativt sökord

/**
 * Härled idea-status från en `UniverseKeyword`.
 *
 * Prioritetsordning:
 *   1. `isNegative === true` → "negative" (operatörens manuella signal vinner)
 *   2. `dataSource === "real"` → "verified"
 *   3. annars → "unverified_idea"
 *
 * Notera: en real-keyword med searchVolume=0 är fortfarande "verified" — vi vet
 * att den existerar (DataForSEO/GSC bekräftade) men ingen volym uppmätts. Det är
 * en annan signal än "vi vet inte alls om sökordet är riktigt".
 */
export function getIdeaStatus(k: Pick<UniverseKeyword, "dataSource" | "isNegative">): IdeaStatus {
  if (k.isNegative) return "negative";
  if (k.dataSource === "real") return "verified";
  return "unverified_idea";
}

/** True om sökordet räknas som "verifierad efterfrågan". */
export function isVerified(k: Pick<UniverseKeyword, "dataSource" | "isNegative">): boolean {
  return getIdeaStatus(k) === "verified";
}

/** True om sökordet är en overifierad idé (AI-genererad eller estimerad). */
export function isUnverifiedIdea(k: Pick<UniverseKeyword, "dataSource" | "isNegative">): boolean {
  return getIdeaStatus(k) === "unverified_idea";
}

/** True om sökordet markerats som negativt. */
export function isNegativeKeyword(k: Pick<UniverseKeyword, "dataSource" | "isNegative">): boolean {
  return getIdeaStatus(k) === "negative";
}

/**
 * Hård gate: filtrera bort overifierade idéer från en lista. Används av ytor
 * som ska visa ENDAST verifierad efterfrågan (Verified-tab, opportunity-listor
 * som bygger på faktisk demand).
 *
 * Behåller `verified` och `negative` (negative är opt-in-exklusion via separat
 * UI, inte demand-utan-data).
 */
export function filterVerifiedOnly<T extends Pick<UniverseKeyword, "dataSource" | "isNegative">>(items: T[]): T[] {
  return items.filter((k) => getIdeaStatus(k) !== "unverified_idea");
}
