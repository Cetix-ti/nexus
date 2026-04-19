// ============================================================================
// MITRE ATT&CK validator — filtre les IDs hallucinés par le LLM.
//
// Le LLM peut inventer des IDs qui n'existent pas dans le catalog officiel
// (ex: "T9999", "TA0099"). Sans ce filtre, la fiche incident affiche des
// liens attack.mitre.org morts et les dashboards agrègent du bruit.
//
// Stratégie :
//   - Tactiques : liste fermée (15 IDs officiels MITRE v16, enterprise matrix)
//   - Techniques : regex format T\d{4}(\.\d{3})? — le catalog complet fait
//     600+ IDs et évolue à chaque release. On valide le format + on laisse
//     attack.mitre.org trancher (lien mort = signal visible côté UI).
//
// Référence : https://attack.mitre.org/matrices/enterprise/
// ============================================================================

/** Tactiques MITRE ATT&CK Enterprise matrix — officiellement maintenues. */
const VALID_TACTICS = new Set<string>([
  "TA0001", // Initial Access
  "TA0002", // Execution
  "TA0003", // Persistence
  "TA0004", // Privilege Escalation
  "TA0005", // Defense Evasion
  "TA0006", // Credential Access
  "TA0007", // Discovery
  "TA0008", // Lateral Movement
  "TA0009", // Collection
  "TA0010", // Exfiltration
  "TA0011", // Command and Control
  "TA0040", // Impact
  "TA0042", // Resource Development
  "TA0043", // Reconnaissance
]);

const TECHNIQUE_PATTERN = /^T\d{4}(\.\d{3})?$/;

export function isValidTactic(id: string): boolean {
  if (typeof id !== "string") return false;
  return VALID_TACTICS.has(id.trim().toUpperCase());
}

export function isValidTechnique(id: string): boolean {
  if (typeof id !== "string") return false;
  return TECHNIQUE_PATTERN.test(id.trim().toUpperCase());
}

/**
 * Filtre un tableau d'IDs MITRE : garde uniquement ceux qui valident.
 * Normalise au passage (uppercase, trim).
 */
export function filterValidTactics(ids: string[]): string[] {
  return ids
    .map((id) => id.trim().toUpperCase())
    .filter((id) => isValidTactic(id));
}

export function filterValidTechniques(ids: string[]): string[] {
  return ids
    .map((id) => id.trim().toUpperCase())
    .filter((id) => isValidTechnique(id));
}

/**
 * Normalise UN id (tactique OU technique). Retourne null si invalide.
 * Utile pour le champ primaire `mitreTactic` / `mitreTechnique`.
 */
export function normalizeTactic(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  const cleaned = id.trim().toUpperCase();
  return isValidTactic(cleaned) ? cleaned : null;
}

export function normalizeTechnique(
  id: string | null | undefined,
): string | null {
  if (!id || typeof id !== "string") return null;
  const cleaned = id.trim().toUpperCase();
  return isValidTechnique(cleaned) ? cleaned : null;
}
