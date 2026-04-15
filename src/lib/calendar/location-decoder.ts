// ============================================================================
// Décodeur de titres « Localisation d'agent » — Outlook → Nexus.
//
// Les titres du calendrier partagé Outlook suivent des conventions courtes :
//   BR LV            → Bruno Robert (BR) chez Ville de Louiseville (LV)
//   JT VDSA          → Jacques Thibault (JT) chez Ville de Sainte-Adèle (VDSA)
//   MG/VG MRVL       → Marcel Gazaille + Vincent Gazaille à Marieville (MRVL)
//   KR BUREAU        → Koryne Robitaille au bureau Cetix
//
// Règles :
//   - Un ou plusieurs agents (initiales 1-4 lettres) séparés par `/` ou `+`.
//   - Un code client ou un mot-clé spécial (BUREAU, TÉLÉTRAVAIL) en queue.
//   - Insensible à la casse, tolère les accents français.
//   - Le mot "BUREAU" est rattaché à l'organisation interne (isInternal=true).
//
// Conçu pour être pur et testable : on passe la liste d'agents + orgs en
// entrée, on retourne une décomposition ou un code d'échec.
// ============================================================================

export interface DecodableAgent {
  id: string;
  firstName: string;
  lastName: string;
  initials?: string | null; // si l'agent a des initiales custom (futur)
  isActive?: boolean;
}

export interface DecodableOrg {
  id: string;
  name: string;
  clientCode: string | null;
  isInternal: boolean;
  domain?: string | null;
  domains?: string[];
}

export interface DecodedLocation {
  ok: true;
  agents: DecodableAgent[];
  organizationId: string | null;
  organizationName: string | null;
  /** Libellé brut du bloc "emplacement" (ex: "LV" / "BUREAU" / "TÉLÉTRAVAIL"). */
  locationTag: string;
  /** "client" | "office" | "remote" — type de localisation inféré. */
  locationKind: "client" | "office" | "remote";
}

export interface DecodedFailure {
  ok: false;
  reason:
    | "EMPTY"
    | "NO_AGENT_BLOCK"
    | "UNKNOWN_AGENTS"
    | "UNKNOWN_LOCATION"
    | "AMBIGUOUS";
  /** Détail lisible du problème pour le log / la fiche event. */
  message: string;
  /** Ce qu'on a quand même pu extraire (utile en UI). */
  partial?: {
    agentTokens?: string[];
    locationTag?: string;
    matchedAgents?: DecodableAgent[];
  };
}

export type DecoderResult = DecodedLocation | DecodedFailure;

/** Mots-clés spéciaux → type de localisation. */
const SPECIAL_LOCATIONS: Record<string, "office" | "remote"> = {
  BUREAU: "office",
  OFFICE: "office",
  "CETIX": "office",
  TELETRAVAIL: "remote",
  "TÉLÉTRAVAIL": "remote",
  TELEWORK: "remote",
  REMOTE: "remote",
  "À DISTANCE": "remote",
  "A DISTANCE": "remote",
  WFH: "remote",
  HOME: "remote",
  "HOME OFFICE": "remote",
};

/** Normalisation (strip accents, upper). Préserve `/` et espaces. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Calcule les initiales d'un agent (premier + dernier), ex: Bruno Robert → BR.
 * On prend la première lettre du prénom + première lettre du dernier mot
 * du nom de famille (gère les noms composés avec espaces). Si l'agent
 * a un champ `initials` explicite, on le privilégie.
 */
export function agentInitials(a: DecodableAgent): string {
  if (a.initials && a.initials.trim()) return norm(a.initials.trim());
  const first = a.firstName.trim().charAt(0);
  const lastParts = a.lastName.trim().split(/\s+/).filter(Boolean);
  const last = lastParts.length > 0 ? lastParts[lastParts.length - 1].charAt(0) : "";
  return norm(`${first}${last}`);
}

/**
 * Décompose un token d'agent (ex: "BR" ou "BRO") en matches agents.
 * Retourne tous les agents qui matchent ces initiales, pour laisser
 * l'appelant gérer l'ambiguïté.
 */
function findAgentsByToken(token: string, agents: DecodableAgent[]): DecodableAgent[] {
  const T = norm(token);
  return agents.filter((a) => agentInitials(a) === T);
}

/**
 * Tente de matcher un tag à une organisation.
 * Priorité : clientCode exact → puis fuzzy sur nom si rien trouvé.
 */
function findOrgByTag(tag: string, orgs: DecodableOrg[]): DecodableOrg | null {
  const T = norm(tag);
  // 1. Match exact sur clientCode
  const byCode = orgs.find((o) => o.clientCode && norm(o.clientCode) === T);
  if (byCode) return byCode;
  // 2. Match sur un "nom court" approximé depuis le nom (Louiseville → LV,
  //    Sainte-Adèle → STA ; mais on ne va pas jusque-là — on se limite au
  //    code client officiel déjà présent en DB).
  return null;
}

/**
 * Trouve l'organisation interne (Cetix) pour les tags BUREAU/OFFICE/CETIX.
 */
function findInternalOrg(orgs: DecodableOrg[]): DecodableOrg | null {
  return orgs.find((o) => o.isInternal) ?? null;
}

/**
 * Décode un titre Outlook en structure Nexus exploitable.
 *
 * Algorithme :
 *   1. Trim + upper → "MG/VG MRVL"
 *   2. Split en tokens espace → ["MG/VG", "MRVL"]
 *   3. Le dernier token significatif est le lieu (clientCode ou mot-clé).
 *   4. Les tokens précédents sont agrégés en liste d'initiales (séparées
 *      par `/` ou `+`).
 *   5. Chaque initiale doit matcher un agent unique.
 *   6. Si lieu = mot-clé spécial (BUREAU, TÉLÉTRAVAIL, …) → locationKind
 *      "office"/"remote", org = interne pour BUREAU, null pour TÉLÉTRAVAIL.
 *   7. Sinon → lookup clientCode. Si pas trouvé → UNKNOWN_LOCATION.
 */
export function decodeLocationTitle(
  rawTitle: string,
  agents: DecodableAgent[],
  orgs: DecodableOrg[],
): DecoderResult {
  const title = (rawTitle || "").trim();
  if (!title) {
    return { ok: false, reason: "EMPTY", message: "Titre vide" };
  }

  // Sépare en tokens, en ignorant la ponctuation exotique.
  const tokens = title
    .replace(/[^\w\/\+\-\s\u00C0-\u017F]/g, " ") // garde lettres, / + - espaces, accents
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length < 2) {
    return {
      ok: false,
      reason: "NO_AGENT_BLOCK",
      message: `Titre « ${title} » : besoin d'au moins [initiales] [lieu]`,
      partial: { agentTokens: tokens },
    };
  }

  // Le dernier token = lieu. Tout ce qui est avant = agents.
  const locationTag = tokens[tokens.length - 1];
  const agentBlock = tokens.slice(0, -1).join(" ");

  // Tokenise le bloc agents sur / ou + ou espace. Ex: "MG/VG" → ["MG","VG"].
  const agentTokens = agentBlock
    .split(/[\/\+\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (agentTokens.length === 0) {
    return {
      ok: false,
      reason: "NO_AGENT_BLOCK",
      message: `Aucune initiale d'agent dans « ${title} »`,
      partial: { locationTag },
    };
  }

  const matchedAgents: DecodableAgent[] = [];
  const unknownTokens: string[] = [];
  const ambiguousTokens: string[] = [];

  for (const tok of agentTokens) {
    const matches = findAgentsByToken(tok, agents);
    if (matches.length === 0) {
      unknownTokens.push(tok);
    } else if (matches.length > 1) {
      ambiguousTokens.push(tok);
    } else {
      matchedAgents.push(matches[0]);
    }
  }

  if (ambiguousTokens.length > 0) {
    return {
      ok: false,
      reason: "AMBIGUOUS",
      message: `Initiales ambiguës : ${ambiguousTokens.join(", ")} (plusieurs agents matchent — ajouter un identifiant explicite dans le titre)`,
      partial: { agentTokens, locationTag, matchedAgents },
    };
  }

  if (unknownTokens.length > 0) {
    return {
      ok: false,
      reason: "UNKNOWN_AGENTS",
      message: `Initiales inconnues : ${unknownTokens.join(", ")}`,
      partial: { agentTokens, locationTag, matchedAgents },
    };
  }

  // --- Résolution du lieu ---
  const locTag = norm(locationTag);
  const special = SPECIAL_LOCATIONS[locTag];
  if (special === "office") {
    const internal = findInternalOrg(orgs);
    if (!internal) {
      return {
        ok: false,
        reason: "UNKNOWN_LOCATION",
        message: `Mot-clé BUREAU trouvé mais aucune org interne (isInternal=true) configurée dans Nexus`,
        partial: { agentTokens, locationTag, matchedAgents },
      };
    }
    return {
      ok: true,
      agents: matchedAgents,
      organizationId: internal.id,
      organizationName: internal.name,
      locationTag: locTag,
      locationKind: "office",
    };
  }
  if (special === "remote") {
    return {
      ok: true,
      agents: matchedAgents,
      organizationId: null,
      organizationName: null,
      locationTag: locTag,
      locationKind: "remote",
    };
  }

  // Sinon : code client.
  const org = findOrgByTag(locationTag, orgs);
  if (!org) {
    return {
      ok: false,
      reason: "UNKNOWN_LOCATION",
      message: `Lieu « ${locationTag} » inconnu (aucun client code ne matche)`,
      partial: { agentTokens, locationTag, matchedAgents },
    };
  }

  return {
    ok: true,
    agents: matchedAgents,
    organizationId: org.id,
    organizationName: org.name,
    locationTag: locTag,
    locationKind: "client",
  };
}

/**
 * Encode la structure Nexus → titre Outlook (reverse). Utilisé quand on
 * crée/modifie un événement depuis Nexus et qu'on doit le pousser vers
 * Outlook. Génère une forme "BR CLIENT_CODE" cohérente avec le décodeur.
 */
export function encodeLocationTitle(args: {
  agents: DecodableAgent[];
  organization?: { clientCode: string | null; isInternal: boolean } | null;
  locationKind: "client" | "office" | "remote";
}): string {
  const agentsStr = args.agents.map(agentInitials).join("/");
  let locTag = "";
  if (args.locationKind === "office") locTag = "BUREAU";
  else if (args.locationKind === "remote") locTag = "TÉLÉTRAVAIL";
  else if (args.organization?.clientCode) locTag = args.organization.clientCode.toUpperCase();
  else locTag = "?";
  return `${agentsStr} ${locTag}`.trim();
}
