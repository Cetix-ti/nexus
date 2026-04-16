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
import { resolveOrgByDomain, resolveOrgByEndpoint } from "../org-resolver";

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
  // "srcip"/"dstip". On essaie plusieurs clés.
  const endpoint =
    extractField(body, ["Agent name", "Agent", "Hostname", "Computer", "Endpoint", "Source IP"]) ??
    null;

  // Client : d'abord on tente de remonter depuis l'endpoint (préfixe de
  // hostname = clientCode dans la plupart des conventions Cetix).
  let orgId: string | null = null;
  if (endpoint) orgId = await resolveOrgByEndpoint(endpoint);
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
