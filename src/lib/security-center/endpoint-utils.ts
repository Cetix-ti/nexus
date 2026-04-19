// ============================================================================
// Utilitaires de normalisation des noms d'endpoints remontés par les agents
// Wazuh / Atera.
//
// Les agents sont parfois nommés avec un préfixe client pour faciliter
// l'identification côté admin (ex: `MRVL_MV-LAP-24`, `LV_DG-10`). Mais
// pour l'affichage dans le Centre de sécurité, on veut afficher le nom
// "réel" du poste sans ce préfixe — c'est ce nom que l'utilisateur final
// connaît et qui apparaît dans les identifiants Windows.
//
// Ce helper est partagé entre les décodeurs (pour persister un endpoint
// propre en DB dès le décodage) et les composants UI (fallback quand une
// donnée ancienne contient encore le préfixe).
// ============================================================================

/**
 * Retire le préfixe clientCode d'un hostname, s'il est présent.
 *
 * Exemples :
 *   stripClientCodePrefix("MRVL_MV-LAP-24", "MRVL") → "MV-LAP-24"
 *   stripClientCodePrefix("LV_DG-10", "LV")         → "DG-10"
 *   stripClientCodePrefix("DLSN54-2204D", "DLSN")   → "54-2204D" (digit collé)
 *   stripClientCodePrefix("PC-CLIENT", "MRVL")      → "PC-CLIENT" (no match)
 *   stripClientCodePrefix("MV-LAP-24", null)        → "MV-LAP-24"
 *
 * Casse-insensible pour le préfixe. Accepte trois formes de séparateur :
 *   - underscore : `MRVL_...`
 *   - dash       : `MRVL-...`
 *   - digit collé: `DLSN54...` (code puis immédiatement un chiffre)
 *
 * Si le clientCode est null/undefined, retourne la chaîne inchangée.
 */
export function stripClientCodePrefix(
  hostname: string | null | undefined,
  clientCode: string | null | undefined,
): string | null {
  if (!hostname) return hostname ?? null;
  if (!clientCode || !clientCode.trim()) return hostname;
  const prefix = clientCode.trim().toUpperCase();
  // On NE strippe que si le code est suivi d'un séparateur explicite
  // (`_` ou `-`). Cas `DLSN54-2204D` : pas de séparateur entre `DLSN` et
  // `54` → on ne touche pas, parce que c'est le nom réel du poste tel que
  // connu des utilisateurs. Aligne avec la fonction cleanEndpoint()
  // côté UI dans /security-center/page.tsx.
  const rx = new RegExp(`^${prefix}[-_]`, "i");
  return hostname.replace(rx, "");
}

/**
 * Version "aveugle" : strippe un préfixe de 2–8 lettres suivi d'un
 * séparateur `_` ou `-`. Utilisé par les décodeurs qui n'ont pas accès au
 * clientCode (ex: décodeur Wazuh générique) — on suppose que tout préfixe
 * "LETTRES + sep" est un code client.
 *
 * ATTENTION : on N'enlève PAS le préfixe si le séparateur est un digit
 * collé (`DLSN54-...`), parce qu'on ne peut pas distinguer "DLSN" (code
 * client) de "SERVER54" (nom de poste qui commence par "SERVER"). Pour
 * ces cas on compte sur la version avec clientCode connu.
 */
export function stripAnyClientCodePrefix(
  hostname: string | null | undefined,
): string | null {
  if (!hostname) return hostname ?? null;
  return hostname.replace(/^[A-Za-z]{2,8}[-_]/, "");
}
