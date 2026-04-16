// ============================================================================
// WAZUH DECODER — parse les alertes reçues dans le sous-dossier "WAZUH" de
// la boîte alertes@cetix.ca.
//
// Wazuh envoie ses notifications sous différents formats selon les règles
// configurées côté manager. On détecte quelques familles courantes :
//
//   - Persistence tools  : logiciels de télé-assistance installés (AnyDesk,
//                          TeamViewer, Splashtop…). Souvent le sujet contient
//                          le nom du soft. On corrèle org+endpoint+software.
//   - CVE                : sujet contient "CVE-YYYY-NNNN". On corrèle
//                          org+endpoint+cve.
//   - Générique          : toute autre alerte → kind="suspicious_behavior",
//                          corrélé par org+endpoint+ruleId si trouvé.
//
// À mesure que l'équipe identifie des formats récurrents, ajouter un case
// dédié dans decodeWazuhEmail — l'architecture est volontairement extensible.
// ============================================================================

import type { DecodedAlert } from "../types";
import {
  resolveOrgByDomain,
  resolveOrgByEndpoint,
  resolveOrgByText,
  resolveOrgByHostOrIp,
} from "../org-resolver";

const PERSISTENCE_SOFTWARES = [
  "anydesk",
  "teamviewer",
  "splashtop",
  "screenconnect",
  "connectwise control",
  "quickassist",
  "remotepc",
  "logmein",
  "ammyy",
  "ultraviewer",
];

const CVE_RX = /CVE-\d{4}-\d{4,7}/i;

function extractField(body: string, keys: string[]): string | null {
  const rx = new RegExp(
    `^\\s*(?:${keys.map((k) => k.replace(/\s+/g, "\\s+")).join("|")})\\s*[:=]\\s*(.+?)\\s*$`,
    "im",
  );
  const m = rx.exec(body);
  return m ? m[1].trim() : null;
}

function detectPersistenceSoftware(text: string): string | null {
  const lower = text.toLowerCase();
  for (const name of PERSISTENCE_SOFTWARES) {
    if (lower.includes(name)) return name;
  }
  return null;
}

export async function decodeWazuhEmail(opts: {
  subject: string;
  bodyPlain: string;
  fromEmail: string;
  messageId: string;
  receivedAt?: Date;
}): Promise<DecodedAlert | null> {
  const subject = opts.subject.trim();
  const body = opts.bodyPlain;
  const combined = `${subject}\n${body}`;

  // Endpoint / agent — souvent exposé par Wazuh comme "Agent name" ou
  // "Hostname". On essaie plusieurs clés.
  const endpoint =
    extractField(body, ["Agent name", "Agent", "Hostname", "Computer", "Endpoint"]) ??
    null;
  // IP séparée (utile si l'agent Wazuh n'a pas de préfixe client dans son
  // hostname mais expose son IP — on matchera par IP côté Atera/Asset).
  const ipAddress =
    extractField(body, ["Source IP", "srcip", "IP Address", "IP", "Address"]) ?? null;

  // Résolution d'organisation — cascade conçue pour maximiser le mapping
  // automatique, même quand le hostname ne suit pas la convention
  // CODE-XXXX (ex: machines héritées, postes personnels, endpoints
  // anciens clients) :
  //
  //   1. Préfixe CODE- extrait du nom d'endpoint  → Organization.clientCode
  //   2. Scan du sujet + body pour tokens CODE-XXX
  //   3. Lookup RMM (Asset local puis Atera API)  → matche hostname ou IP
  //      et remonte à l'organisation via le mapping Atera existant
  //   4. Domaine expéditeur                       → Organization.domain
  //
  // La cascade s'arrête au premier match. Le lookup RMM (étape 3) couvre
  // le cas "le hostname n'a pas le clientCode" — Nexus interroge alors
  // son index local des assets synchronisés (ou Atera directement).
  let orgId: string | null = null;
  if (endpoint) orgId = await resolveOrgByEndpoint(endpoint);
  if (!orgId) orgId = await resolveOrgByText(subject, body);
  if (!orgId && (endpoint || ipAddress)) {
    orgId = await resolveOrgByHostOrIp(endpoint, ipAddress);
  }
  if (!orgId) {
    const senderDomain = (opts.fromEmail.match(/@([^>\s]+)/)?.[1] ?? "").toLowerCase();
    if (senderDomain) orgId = await resolveOrgByDomain(senderDomain);
  }

  // 1. Persistence tool
  const software = detectPersistenceSoftware(combined);
  if (software) {
    const endpointKey = endpoint?.toLowerCase() ?? "unknown";
    const orgKey = orgId ?? "unknown";
    return {
      source: "wazuh_email",
      kind: "persistence_tool",
      severity: "high",
      externalId: opts.messageId,
      organizationId: orgId,
      endpoint,
      software,
      title: `${software} détecté sur ${endpoint ?? "endpoint inconnu"}`,
      summary: body.slice(0, 500),
      correlationKey: `persistence:${orgKey}:${endpointKey}:${software}`,
      rawPayload: { subject, body: body.slice(0, 4000) },
      occurredAt: opts.receivedAt,
    };
  }

  // 2. CVE
  const cveMatch = combined.match(CVE_RX);
  if (cveMatch) {
    const cveId = cveMatch[0].toUpperCase();
    const endpointKey = endpoint?.toLowerCase() ?? "unknown";
    const orgKey = orgId ?? "unknown";
    return {
      source: "wazuh_email",
      kind: "cve",
      severity: "warning",
      externalId: opts.messageId,
      organizationId: orgId,
      endpoint,
      cveId,
      title: `${cveId} — ${endpoint ?? "endpoint inconnu"}`,
      summary: body.slice(0, 500),
      correlationKey: `cve:${orgKey}:${endpointKey}:${cveId}`,
      rawPayload: { subject, body: body.slice(0, 4000) },
      occurredAt: opts.receivedAt,
    };
  }

  // 3. Générique — on corrèle par rule_id si extractible, sinon on émet
  //    un incident par message unique (externalId dédup).
  const ruleId = extractField(body, ["Rule id", "Rule ID", "rule_id"]);
  const orgKey = orgId ?? "unknown";
  const endpointKey = endpoint?.toLowerCase() ?? "unknown";
  return {
    source: "wazuh_email",
    kind: "suspicious_behavior",
    severity: "info",
    externalId: opts.messageId,
    organizationId: orgId,
    endpoint,
    title: subject || "Alerte Wazuh",
    summary: body.slice(0, 500),
    correlationKey: ruleId
      ? `wazuh:${orgKey}:${endpointKey}:${ruleId}`
      : `wazuh-msg:${opts.messageId}`,
    rawPayload: { subject, body: body.slice(0, 4000), ruleId },
    occurredAt: opts.receivedAt,
  };
}
