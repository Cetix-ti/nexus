// ============================================================================
// Liste des domaines d'email grand public — gmail.com, outlook.com, etc.
// Ces domaines sont partagés par des millions d'utilisateurs, donc on ne
// doit JAMAIS les auto-associer en entier à un client.
//
// Utilisé par :
//   - /api/v1/veeam/unmatched-domains    : regroupe par domaine sauf si
//     public → dans ce cas on propose le mapping par email individuel.
//   - /api/v1/veeam/map-domain           : refuse un domaine public.
//   - ingestion Veeam (future)           : skip le domain-match auto.
//
// La liste peut s'élargir via les settings tenant si un client a besoin
// d'ajouter un ISP local (videotron.ca, bell.net, etc.).
// ============================================================================

/**
 * Ensemble de base, hardcodé. Couvre les fournisseurs mondiaux principaux
 * + quelques grands du Québec. On normalise en lowercase à la comparaison.
 */
const BUILTIN_PUBLIC_DOMAINS = new Set<string>([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "hotmail.ca",
  "live.com",
  "live.fr",
  "live.ca",
  "msn.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Yahoo
  "yahoo.com",
  "yahoo.fr",
  "yahoo.ca",
  "ymail.com",
  "rocketmail.com",
  // AOL
  "aol.com",
  "aol.fr",
  // Proton
  "proton.me",
  "protonmail.com",
  "pm.me",
  // GMX
  "gmx.com",
  "gmx.fr",
  "gmx.ca",
  // Autres connus
  "zoho.com",
  "mail.ru",
  "yandex.com",
  "yandex.ru",
  "fastmail.com",
  "tutanota.com",
  "tuta.io",
  "hey.com",
  // Québec / Canada (ISP)
  "videotron.ca",
  "videotron.com",
  "sympatico.ca",
  "bell.net",
  "bell.ca",
  "rogers.com",
  "telus.net",
  "shaw.ca",
  "cogeco.ca",
  "cgocable.ca",
]);

/** Retourne true si le domaine est considéré public (mapping interdit). */
export function isPublicEmailDomain(
  domain: string,
  extras: Iterable<string> = [],
): boolean {
  const d = (domain || "").trim().toLowerCase();
  if (!d) return false;
  if (BUILTIN_PUBLIC_DOMAINS.has(d)) return true;
  for (const e of extras) {
    if ((e || "").trim().toLowerCase() === d) return true;
  }
  return false;
}

/** Expose la liste complète (figée) pour un affichage UI / debug. */
export function listPublicEmailDomains(): string[] {
  return Array.from(BUILTIN_PUBLIC_DOMAINS).sort();
}
