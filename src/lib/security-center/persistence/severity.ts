// ============================================================================
// PERSISTENCE SEVERITY COMPUTATION — porté du node n8n "Compute Severity".
//
//   isWhitelisted → info
//   isServer      → critical (prod ou DC non autorisé = urgence)
//   VNC           → medium (sur workstation, moins critique que teleassist)
//   sinon         → high
// ============================================================================

import type { SecuritySeverity } from "../types";

export function computePersistenceSeverity(opts: {
  isWhitelisted: boolean;
  isServer: boolean;
  softwareNormalized: string;
}): SecuritySeverity {
  if (opts.isWhitelisted) return "info";
  if (opts.isServer) return "critical";
  if (opts.softwareNormalized.toLowerCase() === "vnc") return "warning";
  return "high";
}

/**
 * Retourne les couleurs du badge selon la sévérité. Injectées comme
 * placeholders dans le template HTML pour que la couleur suive la
 * classification sans que l'admin ait à toucher au CSS conditionnel.
 */
export function severityStyle(sev: SecuritySeverity): {
  badgeBg: string;
  badgeText: string;
  accent: string;
  label: string;
} {
  switch (sev) {
    case "critical":
      return { badgeBg: "#fee2e2", badgeText: "#991b1b", accent: "#dc2626", label: "CRITIQUE" };
    case "high":
      return { badgeBg: "#ffedd5", badgeText: "#9a3412", accent: "#ea580c", label: "ÉLEVÉE" };
    case "warning":
      return { badgeBg: "#fef3c7", badgeText: "#92400e", accent: "#d97706", label: "MOYENNE" };
    case "info":
    default:
      return { badgeBg: "#e0f2fe", badgeText: "#075985", accent: "#0284c7", label: "INFO" };
  }
}
