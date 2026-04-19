// ============================================================================
// ACTIVE DIRECTORY DECODER — parse les courriels d'alertes AD reçus sur
// alertes@cetix.ca / billets@cetix.ca. Couvre :
//   - "AD Account Lockout"   → kind = "account_lockout"   (1 incident / user)
//   - "Inactive Account(s)"  → kind = "inactive_account"  (1 incident / email,
//                                                          plusieurs users agrégés)
//
// Les outils de monitoring AD (scripts PS custom, Adaxes, etc.) génèrent des
// formats différents. Le décodeur combine plusieurs stratégies :
//   1. Lockout : username extrait du sujet (format stable : `*** xxx ***`)
//      puis fallback sur les champs du corps.
//   2. Lockout : hostname extrait via "Nom de l'ordinateur de l'appelant :"
//      (FR) ou "Caller Computer Name" (EN). Peut être vide — toléré.
//   3. Inactive : on parse TOUS les comptes listés dans le corps et on crée
//      UN incident par courriel (corrélation par messageId). La liste est
//      stockée dans `metadata.inactiveAccounts` pour la fiche détail.
//
// Règles de corrélation :
//   - account_lockout   → "lockout:{orgId}:{userLower}" (1 incident / user)
//   - inactive_account  → "inactive-report:{orgId}:{messageId}" (1 incident / email)
//
// Si l'org n'a pas pu être résolue, on utilise le domaine expéditeur brut
// comme fallback — évite les fausses fusions cross-tenants.
// ============================================================================

import type { DecodedAlert } from "../types";
import {
  resolveOrgByDomain,
  resolveOrgByEndpoint,
  resolveOrgByText,
  resolveOrgByHostOrIp,
} from "../org-resolver";
import { checkLockoutFamiliarity } from "../enrichment";

/** Retourne true si le sujet correspond à un pattern AD que nous traitons. */
export function isAdSecuritySubject(subject: string): boolean {
  const s = subject.toLowerCase();
  return (
    s.includes("ad account lockout") ||
    s.includes("account lockout") ||
    s.includes("inactive account")
  );
}

function extractField(body: string, keys: string[]): string | null {
  // Cherche des patterns "Clé : valeur" ou "Clé: valeur" sur une ligne.
  // Tolère variations (User Name, User, Account Name, Account, etc.).
  // IMPORTANT : certains courriels AD utilisent l'apostrophe typographique
  // U+2019 (’) au lieu de l'ASCII '. On normalise les deux côtés du match
  // avant la regex pour que "Nom de l'ordinateur de l'appelant" matche peu
  // importe le style d'apostrophe utilisé dans le courriel source.
  const normalize = (s: string) => s.replace(/[\u2018\u2019]/g, "'");
  const normalizedBody = normalize(body);
  const lines = normalizedBody.split(/\r?\n/);
  const rx = new RegExp(
    `^\\s*(?:${keys
      .map((k) => normalize(k).replace(/\s+/g, "\\s+"))
      .join("|")})\\s*[:=]\\s*(.+?)\\s*$`,
    "i",
  );
  for (const line of lines) {
    const m = rx.exec(line);
    if (m) return m[1].trim();
  }
  return null;
}

function extractSender(fromEmail: string): { email: string; domain: string } {
  const email = (fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail).trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  return { email, domain };
}

/**
 * Extrait le username cible d'un sujet "AD Account Lockout: ***xxx***".
 * Retourne null si le format ne matche pas (le caller fallback sur les champs
 * du corps). Tolère les variations d'espaces et de casse.
 *
 * Exemples d'entrée :
 *   "AD Account Lockout: ***ydeshaies***"     → "ydeshaies"
 *   "AD Account Lockout:  ***c.urbanisme*** " → "c.urbanisme"
 *   "Re: AD Account Lockout: ***test***"      → "test"
 */
export function extractLockoutUserFromSubject(subject: string): string | null {
  const m = subject.match(/\*\*\*\s*([^*\s][^*]*?)\s*\*\*\*/);
  if (!m) return null;
  const user = m[1].trim();
  return user.length > 0 ? user : null;
}

/**
 * Parser SECTION-AWARE pour les events Windows 4740 (compte verrouillé).
 *
 * Le corps d'un 4740 contient DEUX blocs qui partagent les mêmes clés :
 *
 *   Sujet :                              ← initiateur (le DC lui-même)
 *     ID de sécurité : S-1-5-18
 *     Nom du compte : SERDC1$
 *     ...
 *
 *   Compte verrouillé :                  ← la cible (le vrai utilisateur)
 *     ID de sécurité : S-1-5-21-...
 *     Nom du compte : ydeshaies          ← CE QU'ON VEUT
 *
 *   Informations supplémentaires :       ← contexte
 *     Nom de l'ordinateur de l'appelant : WKS-001  ← poste d'origine
 *
 * Un extractField naïf capture toujours la PREMIÈRE occurrence (le DC).
 * Cette fonction cherche après le marqueur "Compte verrouillé :" (FR)
 * ou "Account That Was Locked Out:" (EN).
 *
 * Retourne { user, callerComputer } — soit string, soit null pour chaque.
 */
export function extractLockoutFieldsFromBody(body: string): {
  user: string | null;
  callerComputer: string | null;
} {
  if (!body) return { user: null, callerComputer: null };
  const normalized = body.replace(/[\u2018\u2019]/g, "'");

  // 1. User — extrait dans la section "Compte verrouillé :" / "Account That Was Locked Out:"
  const LOCKED_MARKERS = [
    /Compte\s+verrouill[ée]\s*:/i,
    /Account\s+That\s+Was\s+Locked\s+Out\s*:/i,
    /Account\s+Locked\s+Out\s*:/i,
  ];
  let user: string | null = null;
  for (const marker of LOCKED_MARKERS) {
    const mm = marker.exec(normalized);
    if (!mm) continue;
    // Après le marqueur, chercher "Nom du compte : xxx" / "Account Name: xxx"
    // avant un éventuel prochain bloc (ligne vide suivie de "Informations"
    // ou EOF).
    const afterSection = normalized.slice(mm.index + mm[0].length);
    const NAME_PATTERNS = [
      /Nom\s+du\s+compte\s*:\s*([A-Za-z0-9._\-@\\$]+)/i,
      /Account\s+Name\s*:\s*([A-Za-z0-9._\-@\\$]+)/i,
    ];
    for (const np of NAME_PATTERNS) {
      const nm = np.exec(afterSection);
      if (nm) {
        const candidate = nm[1].trim();
        // Ignore les comptes machine ($-terminé = service/DC) — on cherche
        // un user humain.
        if (candidate && !candidate.endsWith("$")) {
          user = candidate;
          break;
        }
      }
    }
    if (user) break;
  }

  // 2. Caller computer — peut apparaître partout mais "Informations
  //    supplémentaires :" est l'endroit canonique du 4740.
  const CALLER_PATTERNS = [
    /Nom\s+de\s+l'ordinateur\s+de\s+l'appelant\s*:\s*([A-Za-z0-9._\-]+)/i,
    /Nom\s+de\s+l'ordinateur\s+appelant\s*:\s*([A-Za-z0-9._\-]+)/i,
    /Caller\s+Computer\s+Name\s*:\s*([A-Za-z0-9._\-]+)/i,
    /Source\s+Workstation\s*:\s*([A-Za-z0-9._\-]+)/i,
    /Workstation\s+Name\s*:\s*([A-Za-z0-9._\-]+)/i,
  ];
  let callerComputer: string | null = null;
  for (const cp of CALLER_PATTERNS) {
    const cm = cp.exec(normalized);
    if (cm) {
      callerComputer = cm[1].trim();
      break;
    }
  }

  return { user, callerComputer };
}

/**
 * Extrait la liste des comptes inactifs mentionnés dans le corps d'un courriel
 * de rapport. Les formats observés varient selon le script PS émetteur. On
 * tente d'abord des patterns explicites (sAMAccountName, UserPrincipalName),
 * puis on retombe sur les lignes qui ressemblent à un login.
 *
 * Les doublons sont dédupliqués (case-insensitive) et l'ordre d'apparition
 * est préservé.
 */
export function extractInactiveAccounts(body: string): string[] {
  if (!body) return [];
  const seen = new Set<string>();
  const accounts: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const v = raw.trim();
    if (!v) return;
    // Rejette les fausses captures : nombres purs, dates, emails d'expéditeur.
    if (/^\d+$/.test(v)) return;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    accounts.push(v);
  };

  // 1. Patterns "clé : valeur" listés ligne par ligne. Un rapport typique
  //    répète sAMAccountName N fois dans le corps.
  const fieldRx = new RegExp(
    String.raw`^\s*(?:sAMAccountName|samAccountName|UserPrincipalName|Account Name|Login|Username|Utilisateur|Compte)\s*[:=]\s*(.+?)\s*$`,
    "gim",
  );
  let m: RegExpExecArray | null;
  while ((m = fieldRx.exec(body)) !== null) add(m[1]);

  // 2. Bloc table (colonne de logins). On cherche des lignes courtes avec
  //    uniquement lettres/chiffres/point/tiret (≤ 40 chars) qui ne ressemblent
  //    pas à du texte descriptif. Seulement si on n'a encore rien trouvé, pour
  //    ne pas polluer avec des noms de colonnes / séparateurs.
  if (accounts.length === 0) {
    const lines = body.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Un login AD typique : lettres, chiffres, ".", "-", "_", "@"
      // Longueur raisonnable, pas d'espace. Doit contenir au moins une lettre.
      if (
        /^[a-z0-9._@-]{2,64}$/i.test(trimmed) &&
        /[a-z]/i.test(trimmed)
      ) {
        add(trimmed);
      }
    }
  }

  return accounts;
}

/**
 * Décode un courriel d'alerte AD en DecodedAlert. Retourne null si le sujet
 * ne matche pas nos patterns.
 */
export async function decodeAdEmail(opts: {
  subject: string;
  bodyPlain: string;
  fromEmail: string;
  messageId: string;
  receivedAt?: Date;
}): Promise<DecodedAlert | null> {
  const subject = opts.subject.trim();
  if (!isAdSecuritySubject(subject)) return null;

  const lower = subject.toLowerCase();
  const isLockout = lower.includes("lockout");
  const isInactive = lower.includes("inactive");

  const sender = extractSender(opts.fromEmail);

  // Parser section-aware : extrait à la fois le user (sous "Compte verrouillé :")
  // et le caller computer (sous "Informations supplémentaires :"). Gère les
  // variantes FR/EN du 4740 Microsoft Security event. Priorité sur extractField
  // naïf qui capturait la PREMIÈRE occurrence "Nom du compte" (= le DC machine
  // account, donc inutile).
  const bodyFields = extractLockoutFieldsFromBody(opts.bodyPlain);

  // Hostname — parser section-aware d'abord, puis fallback sur d'autres clés
  // (pour formats non-standard utilisés par Adaxes, scripts custom, etc.).
  const computer =
    bodyFields.callerComputer ??
    extractField(opts.bodyPlain, [
      "CallerComputer",
      "Source Computer",
      "Computer",
      "Host",
      "Poste",
    ]) ??
    null;

  // Résolution d'organisation — on privilégie le préfixe du Caller Computer
  // (« BDU-DC01 » → org BDU) parce que sender.domain est quasi-toujours
  // "cetix.ca" pour les DC-emitters et ne permet pas de distinguer les
  // clients. Cascade : endpoint → scan texte → RMM → domaine expéditeur.
  let orgId: string | null = null;
  if (computer) orgId = await resolveOrgByEndpoint(computer);
  if (!orgId) orgId = await resolveOrgByText(opts.subject, opts.bodyPlain);
  if (!orgId && computer) {
    orgId = await resolveOrgByHostOrIp(computer, null);
  }
  if (!orgId && sender.domain) orgId = await resolveOrgByDomain(sender.domain);

  // --------------------------------------------------------------------------
  // LOCKOUT — 1 incident par utilisateur
  // --------------------------------------------------------------------------
  if (isLockout) {
    // Stratégie 1 : sujet "AD Account Lockout: ***ydeshaies***" — format
    // stable, le plus fiable quand il est présent.
    const userFromSubject = extractLockoutUserFromSubject(subject);
    // Stratégie 2 : parser section-aware du 4740 (déjà calculé ci-dessus) —
    // lit le "Nom du compte" de la section "Compte verrouillé :" (le vrai
    // user, pas le DC account). Beaucoup plus fiable que l'ancien
    // extractField qui capturait la première occurrence.
    const userFromSection = bodyFields.user;
    // Stratégie 3 : extractField pour formats non-standard (scripts PS custom
    // qui utilisent des clés explicites comme "UserPrincipalName").
    const userFromBody =
      userFromSubject || userFromSection
        ? null
        : extractField(opts.bodyPlain, [
            "User Principal Name",
            "UserPrincipalName",
            "User Name",
            "Target Account",
            "User",
            "Username",
            "Utilisateur",
          ]);
    const user = userFromSubject ?? userFromSection ?? userFromBody ?? null;
    const userSource = userFromSubject
      ? "subject"
      : userFromSection
        ? "body_section"
        : userFromBody
          ? "body_field"
          : null;

    const userKey = (user ?? "unknown").toLowerCase();
    const orgKey = orgId ?? `domain:${sender.domain || "unknown"}`;

    // Enrichissement : match user × poste avec le RMM (Atera → Asset
    // table). "usual" = le user est bien le dernier connu sur ce poste
    // (erreur humaine probable), "unusual" = autre user habituel (suspect),
    // "unknown" = poste inconnu en RMM.
    const familiarity = await checkLockoutFamiliarity(user, computer);

    return {
      source: "ad_email",
      kind: "account_lockout",
      severity: "warning",
      externalId: opts.messageId,
      organizationId: orgId,
      endpoint: computer,
      userPrincipal: user,
      title: user
        ? `Verrouillage AD : ${user}`
        : `Verrouillage AD (compte inconnu)`,
      summary: opts.bodyPlain.slice(0, 500),
      correlationKey: `lockout:${orgKey}:${userKey}`,
      rawPayload: {
        subject,
        body: opts.bodyPlain.slice(0, 4000),
        sender,
      },
      occurredAt: opts.receivedAt,
      // Metadata affichée dans la fiche détail et utilisée pour le badge
      // "louche" vs "habituel" dans le tableau.
      metadata: {
        callerHostname: computer,
        userSource,
        lockoutFamiliarity: familiarity.familiarity,
        lockoutKnownUser: familiarity.knownUser,
        lockoutAssetId: familiarity.assetId,
      },
    };
  }

  // --------------------------------------------------------------------------
  // INACTIVE — 1 incident par courriel, liste de comptes en metadata
  // --------------------------------------------------------------------------
  if (isInactive) {
    const accounts = extractInactiveAccounts(opts.bodyPlain);
    const orgKey = orgId ?? `domain:${sender.domain || "unknown"}`;

    return {
      source: "ad_email",
      kind: "inactive_account",
      severity: "info",
      externalId: opts.messageId,
      organizationId: orgId,
      endpoint: computer,
      // userPrincipal = premier compte (pour affichage rapide dans les listes).
      // La liste complète est dans metadata.inactiveAccounts.
      userPrincipal: accounts[0] ?? null,
      title:
        accounts.length > 1
          ? `Comptes AD inactifs — ${accounts.length} comptes`
          : accounts.length === 1
            ? `Compte AD inactif : ${accounts[0]}`
            : `Rapport de comptes inactifs AD`,
      summary: opts.bodyPlain.slice(0, 500),
      // Un rapport par courriel — on corrèle par messageId pour que chaque
      // envoi du DC crée un nouvel incident (vs ajouter à un existant), ce
      // qui matche le comportement attendu : « une tuile par alerte ».
      correlationKey: `inactive-report:${orgKey}:${opts.messageId}`,
      rawPayload: {
        subject,
        body: opts.bodyPlain.slice(0, 4000),
        sender,
      },
      occurredAt: opts.receivedAt,
      metadata: {
        inactiveAccounts: accounts,
        accountCount: accounts.length,
      },
    };
  }

  return null;
}
