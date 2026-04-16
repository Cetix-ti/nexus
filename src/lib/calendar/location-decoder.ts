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
  /**
   * Type de localisation inféré :
   *   - "client"          : visite chez un client (organizationId != null)
   *   - "office"          : bureau Cetix, un ou plusieurs agents nommés
   *   - "remote"          : télétravail, pas d'org
   *   - "personal"        : événement perso (RDV médical, congé, OFF,
   *                         NOTAIRE, DENTISTE…). Agent connu mais pas de
   *                         client — on affiche l'avatar sans logo org.
   *   - "company_meeting" : réunion d'équipe ("CTX BUREAU"). Org = interne,
   *                         aucun agent spécifique (tous concernés).
   */
  locationKind: "client" | "office" | "remote" | "personal" | "company_meeting";
  /** Initiales non matchées à un agent en DB — le titre a été décodé en
   *  partiel (au moins 1 agent trouvé). Vide quand tout a matché. */
  unknownAgentTokens?: string[];
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
const SPECIAL_LOCATIONS: Record<string, "office" | "remote" | "personal"> = {
  // Bureau Cetix
  BUREAU: "office",
  OFFICE: "office",
  CETIX: "office",
  // Télétravail
  TELETRAVAIL: "remote",
  "TÉLÉTRAVAIL": "remote",
  TELEWORK: "remote",
  REMOTE: "remote",
  "À DISTANCE": "remote",
  "A DISTANCE": "remote",
  WFH: "remote",
  HOME: "remote",
  "HOME OFFICE": "remote",
  // Événements personnels / hors-travail — l'agent est connu mais il n'y
  // a pas de client associé. Les titres typiques :
  //   "SF OFF", "SF DENTISTE", "MV RDV NOTAIRE", "BR CONGÉ"
  OFF: "personal",
  CONGE: "personal",
  "CONGÉ": "personal",
  VACANCES: "personal",
  MALADIE: "personal",
  FERIE: "personal",
  "FÉRIÉ": "personal",
  RDV: "personal",
  NOTAIRE: "personal",
  DENTISTE: "personal",
  MEDECIN: "personal",
  "MÉDECIN": "personal",
  DOCTEUR: "personal",
  HOPITAL: "personal",
  "HÔPITAL": "personal",
  CLINIQUE: "personal",
  PERSO: "personal",
  PERSONNEL: "personal",
  ABSENT: "personal",
  ABSENCE: "personal",
  FORMATION: "personal",
};

/** Mots qui, tout seuls en fin de titre, sont considérés comme du bruit
 *  plutôt qu'un lieu. Ex: "MG/VG MTLO EN PM" — le lieu est MTLO, "EN PM"
 *  dit juste "en après-midi". On strip ces tokens avant de picker le lieu. */
const PERIOD_OF_DAY_TOKENS = new Set<string>([
  "EN",
  "AM",
  "PM",
  "MATIN",
  "MATINEE",
  "MATINÉE",
  "APRESMIDI",
  "APRES-MIDI",
  "APRES",
  "APRÈS-MIDI",
  "APRÈSMIDI",
  "AVANTMIDI",
  "AVANT-MIDI",
  "SOIR",
  "SOIREE",
  "SOIRÉE",
  "NUIT",
  "MIDI",
  "JOURNEE",
  "JOURNÉE",
  "TOUTE",
  "JOUR",
]);

/** Mot-clé "lié à l'org" qu'on reconnaît comme préfixe dans des titres
 *  tels que "CTX BUREAU (OBLIGATOIRE)" — tous les termes office-related.
 *  Synonyme de `SPECIAL_LOCATIONS[x] === "office"`. */
function isOfficeKeyword(token: string): boolean {
  return SPECIAL_LOCATIONS[norm(token)] === "office";
}

/** Normalisation (strip accents, upper). Préserve `/` et espaces. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Détecte les tokens "horaires" qu'on doit ignorer pour trouver le lieu
 * dans un titre comme "MG SADB 15h" ou "BR LV 8h-17h".
 * Formats couverts :
 *   - 15h, 15H, 9h30, 15H00
 *   - 15:00, 9:30
 *   - 8h-17h, 8h30-15h (plage)
 *   - 3pm, 3:30pm, 9am, 11AM
 *   - AM, PM seuls (rare mais possible)
 * On est volontairement lax : faux positifs = le vrai code client
 * « XYZ » ne ressemble jamais à un horaire, donc aucun risque de
 * conflit.
 */
function isTimeToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  // Gère aussi les plages collées à un h : 8h-17h → on teste la forme
  // complète comme une seule chose (re1). Sinon on teste un horaire
  // unitaire (re2).
  const re1 = /^\d{1,2}(h|:)\d{0,2}\s*-\s*\d{1,2}(h|:)\d{0,2}$/i;
  const re2 = /^\d{1,2}h(\d{1,2})?$/i;
  const re3 = /^\d{1,2}:\d{2}$/;
  const re4 = /^\d{1,2}(:\d{2})?(am|pm)$/i;
  return re1.test(t) || re2.test(t) || re3.test(t) || re4.test(t);
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
 * Tente de décoller un token "collé" du type `VGDLSN` en `VG` + `DLSN`,
 * quand l'utilisateur oublie l'espace entre le dernier agent et le code
 * client. Uniquement appliqué au DERNIER chunk d'un token qui contient
 * déjà un `/` ou `+` (signal fort qu'on est dans un bloc d'agents, ex:
 * `MG/VGDLSN`).
 *
 * Algorithme :
 *   - Split du token sur `/` et `+` → ["MG", "VGDLSN"]
 *   - Essaie de couper le dernier chunk en [initiales | code] avec une
 *     longueur d'initiales de 2, 3 puis 4 caractères.
 *   - La coupe est validée si le préfixe match un agent connu ET le
 *     suffixe match un clientCode OU un mot-clé office/remote/personal.
 *   - Si trouvé → retourne deux tokens séparés, sinon null.
 *
 * Exemples :
 *   MG/VGDLSN   → ["MG/VG", "DLSN"]
 *   BR/JTVDSA   → ["BR/JT", "VDSA"]  (JT en DB → match)
 *   MG/SFBUREAU → ["MG/SF", "BUREAU"] (mot-clé office)
 *   XYZDEF      → null (pas de / + pas collé → on laisse le décodeur échouer)
 */
function tryUnglueAgentLocation(
  token: string,
  agents: DecodableAgent[],
  orgs: DecodableOrg[],
): string[] | null {
  // Besoin d'un séparateur entre agents (/ ou +) — sinon ambiguïté trop
  // grande (ex: "MGMRVL" pourrait être M+GMRVL, MG+MRVL, MGM+RVL…).
  if (!/[\/\+]/.test(token)) return null;

  const parts = token.split(/[\/\+]/).filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1];
  // Le dernier chunk doit être assez long pour contenir agent+lieu :
  // minimum 2 (agent) + 2 (code) = 4 caractères.
  if (last.length < 4) return null;

  // Essaie les longueurs d'initiales les plus courantes.
  for (const prefixLen of [2, 3, 4]) {
    if (prefixLen >= last.length) continue;
    const prefix = last.slice(0, prefixLen);
    const suffix = last.slice(prefixLen);

    const prefixIsAgent =
      findAgentsByToken(prefix, agents).length === 1; // exactement 1 agent
    if (!prefixIsAgent) continue;

    const suffixNorm = norm(suffix);
    const suffixIsClient = orgs.some(
      (o) => o.clientCode && norm(o.clientCode) === suffixNorm,
    );
    const suffixIsSpecial = suffixNorm in SPECIAL_LOCATIONS;
    if (!suffixIsClient && !suffixIsSpecial) continue;

    // Reconstruit : agents joins à `/`, suivi du lieu séparé.
    const agentsJoined = parts.slice(0, -1).concat([prefix]).join("/");
    return [agentsJoined, suffix];
  }

  return null;
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
 * Algorithme (étapes successives, chacune laissant passer à la suivante
 * si elle ne matche pas) :
 *
 *   A. Normalisation du titre
 *      - Strip du contenu entre parenthèses (ex: "(OBLIGATOIRE)", "(8H00)")
 *      - Tokenisation sur espaces / ponctuation exotique
 *      - Strip des tokens horaires en queue ("15h", "8h-17h", "3pm")
 *      - Strip des tokens "période de journée" en queue ("EN PM", "MATIN",
 *        "APRÈS-MIDI")
 *
 *   B. Détection "réunion d'équipe" — si le PREMIER token est le
 *      clientCode de l'org interne (ex: "CTX BUREAU") → locationKind
 *      "company_meeting", pas d'agent spécifique, org = Cetix.
 *
 *   C. Extraction du dernier token = tag de lieu, reste = bloc agents
 *      (séparateurs `/ + espace`).
 *
 *   D. Matching agents :
 *      - ≥1 match → on continue (partiel OK, `unknownAgentTokens` noté)
 *      - 0 match → échec UNKNOWN_AGENTS
 *      - ambiguïté (2 agents partagent les mêmes initiales) → échec AMBIGUOUS
 *
 *   E. Résolution du lieu :
 *      - mot-clé office (BUREAU/OFFICE/CETIX) → org=interne, kind="office"
 *      - mot-clé remote (TÉLÉTRAVAIL/WFH/…) → org=null, kind="remote"
 *      - mot-clé personal (OFF/RDV/DENTISTE/…) → org=null, kind="personal"
 *      - sinon clientCode lookup
 *      - sinon fallback : si on a ≥1 agent matché mais un lieu inconnu,
 *        on retombe sur "personal" (il n'y a que l'agent de connu dans
 *        le titre). Ex: "MV RDV NOTAIRE" → MV est ok, NOTAIRE = personal.
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

  // Étape A : strip du contenu entre parenthèses.
  // Ex: "JT VDSA (8H00)" → "JT VDSA". "CTX BUREAU (OBLIGATOIRE)" → "CTX BUREAU".
  // On accepte les crochets et accolades aussi pour être robuste.
  const stripped = title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Tokenisation. On garde `:` pour les horaires, on jette le reste
  // de la ponctuation exotique.
  const rawTokens = stripped
    .replace(/[^\w\/\+\-\s\u00C0-\u017F:]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Pre-process : essaie de décoller les tokens "collés" du type
  // "MG/VGDLSN" en "MG/VG" + "DLSN". S'applique uniquement aux tokens
  // contenant déjà un `/` ou `+` (bloc d'agents évident). Ça ramène la
  // suite du flow à 2 tokens propres comme si l'espace avait été mis.
  const tokens: string[] = [];
  for (const t of rawTokens) {
    const unglued = tryUnglueAgentLocation(t, agents, orgs);
    if (unglued) tokens.push(...unglued);
    else tokens.push(t);
  }

  if (tokens.length < 2) {
    return {
      ok: false,
      reason: "NO_AGENT_BLOCK",
      message: `Titre « ${title} » : besoin d'au moins [initiales] [lieu]`,
      partial: { agentTokens: tokens },
    };
  }

  // Strip des tokens horaires + période-de-journée en QUEUE.
  //   "MG SADB 15h"        → ["MG","SADB"]
  //   "MG/VG MTLO EN PM"   → ["MG/VG","MTLO"]
  //   "BR LV 8h-17h MATIN" → ["BR","LV"]
  // On s'arrête au premier token "significatif" — on ne strip pas au milieu.
  const meaningfulTokens = [...tokens];
  while (
    meaningfulTokens.length > 0 &&
    (isTimeToken(meaningfulTokens[meaningfulTokens.length - 1]) ||
      PERIOD_OF_DAY_TOKENS.has(norm(meaningfulTokens[meaningfulTokens.length - 1])))
  ) {
    meaningfulTokens.pop();
  }

  if (meaningfulTokens.length < 2) {
    // Cas particulier : 1 seul token significatif restant pourrait être
    // juste un agent "SF" avec un OFF/DENTISTE en queue déjà stripé. Mais
    // la règle "≥ 2 tokens" exige au minimum [agents] [qqchose]. Si on a
    // juste "SF", c'est ambigü, on échoue proprement.
    return {
      ok: false,
      reason: "NO_AGENT_BLOCK",
      message: `Titre « ${title} » : besoin d'au moins [initiales] [lieu] (hors horaire)`,
      partial: { agentTokens: tokens },
    };
  }

  // Étape B : « réunion d'équipe » — premier token = clientCode interne
  // (ex: "CTX") suivi d'un mot-clé office. Pas d'agent spécifique, l'event
  // concerne tous les agents. Ex: "CTX BUREAU (OBLIGATOIRE)".
  const firstTokenNorm = norm(meaningfulTokens[0]);
  const lastTokenNorm = norm(meaningfulTokens[meaningfulTokens.length - 1]);
  const internal = findInternalOrg(orgs);
  const firstTokenIsInternalCode =
    !!internal &&
    !!internal.clientCode &&
    norm(internal.clientCode) === firstTokenNorm;
  if (
    firstTokenIsInternalCode &&
    isOfficeKeyword(meaningfulTokens[meaningfulTokens.length - 1]) &&
    meaningfulTokens.length === 2
  ) {
    return {
      ok: true,
      agents: [],
      organizationId: internal!.id,
      organizationName: internal!.name,
      locationTag: lastTokenNorm,
      locationKind: "company_meeting",
    };
  }

  // Étape C : dernier token = lieu, reste = agents.
  const locationTag = meaningfulTokens[meaningfulTokens.length - 1];
  const agentBlock = meaningfulTokens.slice(0, -1).join(" ");

  // Tokenise le bloc agents sur / ou + ou espace. Ex: "MG/VG" → ["MG","VG"].
  // Pour "MG/SF O365" (tokens intermédiaires non-agents) → ["MG","SF","O365"].
  // Les non-matchs finissent dans unknownAgentTokens (cf. match partiel).
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

  // Match partiel accepté (au moins 1 agent). Si AUCUN match → UNKNOWN_AGENTS.
  if (matchedAgents.length === 0) {
    return {
      ok: false,
      reason: "UNKNOWN_AGENTS",
      message: `Initiales inconnues : ${unknownTokens.join(", ")}`,
      partial: { agentTokens, locationTag, matchedAgents },
    };
  }

  // Étape E : résolution du lieu.
  const locTag = norm(locationTag);
  const special = SPECIAL_LOCATIONS[locTag];
  if (special === "office") {
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
      ...(unknownTokens.length > 0 ? { unknownAgentTokens: unknownTokens } : {}),
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
      ...(unknownTokens.length > 0 ? { unknownAgentTokens: unknownTokens } : {}),
    };
  }
  if (special === "personal") {
    // "SF OFF", "SF DENTISTE", "MV RDV NOTAIRE" (RDV étant en dernier pos
    // suffit). Agent connu + mot-clé personnel → pas de client.
    return {
      ok: true,
      agents: matchedAgents,
      organizationId: null,
      organizationName: null,
      locationTag: locTag,
      locationKind: "personal",
      ...(unknownTokens.length > 0 ? { unknownAgentTokens: unknownTokens } : {}),
    };
  }

  // Code client.
  const org = findOrgByTag(locationTag, orgs);
  if (org) {
    return {
      ok: true,
      agents: matchedAgents,
      organizationId: org.id,
      organizationName: org.name,
      locationTag: locTag,
      locationKind: "client",
      ...(unknownTokens.length > 0 ? { unknownAgentTokens: unknownTokens } : {}),
    };
  }

  // Fallback : le lieu n'est ni un mot-clé spécial ni un clientCode connu.
  // Si on a quand même ≥1 agent matché, on considère l'event comme
  // "personnel" — l'agent est la seule info certaine. Ex: "MV RDV NOTAIRE"
  // (RDV NOTAIRE sont des "lieux" inconnus mais MV est un agent valide →
  // événement personnel, affiche l'avatar, pas de client).
  //
  // Alternative rejetée : renvoyer UNKNOWN_LOCATION → l'event tomberait
  // dans UNDECODED et n'afficherait rien. Moins utile.
  return {
    ok: true,
    agents: matchedAgents,
    organizationId: null,
    organizationName: null,
    locationTag: locTag,
    locationKind: "personal",
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
  locationKind: DecodedLocation["locationKind"];
}): string {
  const agentsStr = args.agents.map(agentInitials).join("/");
  let locTag = "";
  if (args.locationKind === "office") locTag = "BUREAU";
  else if (args.locationKind === "remote") locTag = "TÉLÉTRAVAIL";
  else if (args.locationKind === "personal") locTag = "PERSO";
  else if (args.locationKind === "company_meeting") locTag = "BUREAU";
  else if (args.organization?.clientCode) locTag = args.organization.clientCode.toUpperCase();
  else locTag = "?";
  // Pour une réunion d'équipe sans agents, on émet juste "CTX BUREAU" (le
  // clientCode interne + BUREAU) pour rester décodable au round-trip.
  if (
    args.locationKind === "company_meeting" &&
    args.agents.length === 0 &&
    args.organization?.clientCode
  ) {
    return `${args.organization.clientCode.toUpperCase()} BUREAU`;
  }
  return `${agentsStr} ${locTag}`.trim();
}
