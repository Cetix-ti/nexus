// ============================================================================
// SECURITY ENRICHMENT — ajoute du contexte aux alertes lockout AD.
//
// Pour une alerte (username, hostname), on veut savoir si c'est une
// combinaison "connue" (user qui se connecte habituellement sur ce poste
// selon Atera/Wazuh) ou "suspecte" (lockout sur un poste où le user ne va
// jamais).
//
// Stratégie actuelle : lookup en DB locale de la table `Asset`, dont le
// champ `metadata.lastLoggedUser` est synchronisé depuis Atera par le job
// de sync. C'est une heuristique — un utilisateur qui se connecte peu
// fréquemment ne sera pas "lastLoggedUser" au moment de la vérification,
// mais pour les lockouts répétitifs c'est très fiable en pratique.
//
// Futur possible : élargir avec une vraie requête Wazuh Indexer sur les
// events 4624 (logon Windows) des 30 derniers jours. Le bottleneck sera
// la latence du cluster OpenSearch donc on préfère la DB locale d'abord.
// ============================================================================

import prisma from "@/lib/prisma";

export type LockoutFamiliarity =
  /** User trouvé comme dernier connecté sur ce poste → erreur humaine probable */
  | "usual"
  /** Poste trouvé mais autre user → louche */
  | "unusual"
  /** Aucune info — poste inconnu en RMM ou pas encore synchronisé */
  | "unknown";

export interface LockoutEnrichment {
  familiarity: LockoutFamiliarity;
  /** Dernier user connu sur le poste (si Asset trouvé), pour affichage. */
  knownUser: string | null;
  /** Asset correspondant (pour lien rapide vers la fiche actif) si trouvé. */
  assetId: string | null;
}

/**
 * Normalise un username AD pour comparaison case/domaine-insensible.
 * "DOMAIN\ydeshaies", "ydeshaies@cetix.ca", "YDESHAIES" → "ydeshaies".
 */
function normalizeUsername(u: string | null | undefined): string {
  if (!u) return "";
  let v = u.trim().toLowerCase();
  // Retire domaine\user ou user@domain
  if (v.includes("\\")) v = v.split("\\").pop() ?? v;
  if (v.includes("@")) v = v.split("@")[0] ?? v;
  return v.trim();
}

/**
 * Normalise un hostname pour matcher les conventions Atera vs AD :
 * Atera peut stocker "LV40-2602L.cetix.local", le lockout voit "LV40-2602L".
 * On compare le label court + on accepte que Atera ait pu préfixer le code
 * client (ex: "LV_LV40-2602L").
 */
function normalizeHostname(h: string | null | undefined): string {
  if (!h) return "";
  return h.trim().toLowerCase().split(".")[0] ?? "";
}

/**
 * Pour un couple (username, hostname), déduit le niveau de familiarité en
 * interrogeant la table Asset (donnée synchronisée depuis Atera).
 *
 * Retourne toujours un résultat — en cas d'erreur DB ou de données manquantes,
 * `familiarity="unknown"` pour que l'UI affiche un badge neutre.
 */
export async function checkLockoutFamiliarity(
  username: string | null,
  hostname: string | null,
): Promise<LockoutEnrichment> {
  const hostKey = normalizeHostname(hostname);
  if (!hostKey || !username) {
    return { familiarity: "unknown", knownUser: null, assetId: null };
  }
  const userKey = normalizeUsername(username);

  try {
    // On matche le hostname avec un contains (case-insensitive) sur `name`
    // — couvre les cas où Atera préfixe avec le code client
    // ("LV_LV40-2602L"). Le FQDN est dans metadata (pas indexé) donc pas
    // utilisé comme critère de recherche direct.
    const asset = await prisma.asset.findFirst({
      where: {
        name: { contains: hostKey, mode: "insensitive" },
      },
      select: {
        id: true,
        metadata: true,
      },
    });
    if (!asset) {
      return { familiarity: "unknown", knownUser: null, assetId: null };
    }

    const lastLogged = (asset.metadata as { lastLoggedUser?: unknown } | null)
      ?.lastLoggedUser;
    const known =
      typeof lastLogged === "string" && lastLogged.trim().length > 0
        ? lastLogged
        : null;
    if (!known) {
      return { familiarity: "unknown", knownUser: null, assetId: asset.id };
    }

    const knownNorm = normalizeUsername(known);
    const familiarity: LockoutFamiliarity =
      knownNorm === userKey ? "usual" : "unusual";

    return { familiarity, knownUser: known, assetId: asset.id };
  } catch (err) {
    console.warn("[security-enrichment] asset lookup failed:", err);
    return { familiarity: "unknown", knownUser: null, assetId: null };
  }
}
