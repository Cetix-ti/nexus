// Sélection du modèle Claude selon la sévérité du bug.
// Par défaut : modèle le plus adapté — Sonnet sur les petits bugs (rapide,
// économique), Opus sur les bugs majeurs/critiques (meilleur raisonnement).

import type { BugSeverity } from "@prisma/client";

export function pickModelForSeverity(severity: BugSeverity): string {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "claude-opus-4-7";
    case "MEDIUM":
    case "LOW":
    default:
      return "claude-sonnet-4-6";
  }
}
