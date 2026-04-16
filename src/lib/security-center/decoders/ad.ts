// ============================================================================
// ACTIVE DIRECTORY DECODER — parse les courriels d'alertes AD reçus sur
// alertes@cetix.ca. Couvre pour l'instant :
//   - "AD Account Lockout"   → kind = "account_lockout"
//   - "Inactive Account"     → kind = "inactive_account"
//
// L'heuristique d'extraction est volontairement tolérante : les outils de
// monitoring AD (PDQ, Adaxes, scripts PS custom) génèrent des formats
// différents. On cherche des champs nommés courants et on retombe sur le
// sujet comme titre si rien n'est extractible.
//
// Règles de corrélation :
//   - account_lockout   → "lockout:{orgId}:{userPrincipalLower}"
//   - inactive_account  → "inactive:{orgId}:{userPrincipalLower}"
//
// Si l'org n'a pas pu être résolue, on utilise le domaine expéditeur brut
// comme fallback — évite les fausses fusions cross-tenants.
// ============================================================================

import type { DecodedAlert } from "../types";
import { resolveOrgByDomain } from "../org-resolver";

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
  const lines = body.split(/\r?\n/);
  const rx = new RegExp(
    `^\\s*(?:${keys.map((k) => k.replace(/\s+/g, "\\s+")).join("|")})\\s*[:=]\\s*(.+?)\\s*$`,
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
  const orgId = sender.domain ? await resolveOrgByDomain(sender.domain) : null;

  // Tente d'extraire l'utilisateur cible. Les formats courants listent
  // "User", "Account Name", "UserPrincipalName", "Target", etc.
  const user =
    extractField(opts.bodyPlain, [
      "User Principal Name",
      "UserPrincipalName",
      "User Name",
      "Account Name",
      "Target Account",
      "User",
      "Account",
      "Username",
      "Utilisateur",
      "Compte",
    ]) ?? null;

  const computer =
    extractField(opts.bodyPlain, [
      "Caller Computer Name",
      "CallerComputer",
      "Source Computer",
      "Computer",
      "Host",
      "Poste",
    ]) ?? null;

  const userKey = (user ?? "unknown").toLowerCase();
  const orgKey = orgId ?? `domain:${sender.domain || "unknown"}`;

  if (isLockout) {
    return {
      source: "ad_email",
      kind: "account_lockout",
      severity: "warning",
      externalId: opts.messageId, // dédup si le même email est re-lu
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
    };
  }

  if (isInactive) {
    return {
      source: "ad_email",
      kind: "inactive_account",
      severity: "info",
      externalId: opts.messageId,
      organizationId: orgId,
      endpoint: computer,
      userPrincipal: user,
      title: user
        ? `Compte AD inactif : ${user}`
        : `Comptes AD inactifs — ${subject}`,
      summary: opts.bodyPlain.slice(0, 500),
      // Pour les comptes inactifs on veut en faire UN incident par
      // utilisateur (kanban par compte à réviser). Si pas d'user extrait,
      // on dédoublonne par messageId pour ne pas spammer.
      correlationKey: user
        ? `inactive:${orgKey}:${userKey}`
        : `inactive-report:${orgKey}:${opts.messageId}`,
      rawPayload: {
        subject,
        body: opts.bodyPlain.slice(0, 4000),
        sender,
      },
      occurredAt: opts.receivedAt,
    };
  }

  return null;
}
