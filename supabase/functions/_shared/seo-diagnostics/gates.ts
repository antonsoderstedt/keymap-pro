import type { SeoContentSnapshot, SeoDiagnosisBlocker } from "./types.ts";

export interface SeoGateResult {
  blockers: SeoDiagnosisBlocker[];
  warnings: string[];
}

export function evaluateSeoGates(snapshot: SeoContentSnapshot): SeoGateResult {
  const blockers: SeoDiagnosisBlocker[] = [];
  const warnings: string[] = [];

  if (!snapshot.universe) {
    blockers.push({
      gate: "NO_UNIVERSE",
      message: "Inget sökordsuniversum finns — kör en analys eller pre-launch.",
      resolution: "Gå till Sökord & innehåll och kör sökordsanalys.",
    });
  }

  if (!snapshot.domain || snapshot.domain.trim() === "") {
    blockers.push({
      gate: "NO_DOMAIN",
      message: "Projektet har ingen domän satt.",
      resolution: "Lägg till domän under Inställningar.",
    });
  }

  if (!snapshot.gsc) {
    warnings.push(
      "NO_GSC: Regler som kräver positionsdata är begränsade — koppla Google Search Console."
    );
  }

  if (!snapshot.audit) {
    warnings.push("NO_AUDIT: Tekniska regler kräver en körd site audit.");
  }

  if (!snapshot.backlinks) {
    warnings.push("NO_BACKLINKS: Auktoritetsregler kräver backlink-analys.");
  }

  if (snapshot.audit) {
    const age =
      (Date.now() - new Date(snapshot.audit.generatedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (age > 7) {
      warnings.push(
        `STALE_AUDIT: Site audit är ${Math.round(age)} dagar gammal — överväg att köra om.`
      );
    }
  }

  return { blockers, warnings };
}
