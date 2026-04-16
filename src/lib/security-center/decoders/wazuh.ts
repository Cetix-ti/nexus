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
  // Wazuh normalise les fins de ligne en \r uniquement → on remet en \n
  // pour que les regex multi-lignes fonctionnent. Idempotent si le body
  // utilise déjà \n.
  const normalized = body.replace(/\r\n?/g, "\n");
  const rx = new RegExp(
    `^\\s*(?:${keys.map((k) => k.replace(/\s+/g, "\\s+")).join("|")})\\s*[:=]\\s*"?([^"\\n]+?)"?\\s*$`,
    "im",
  );
  const m = rx.exec(normalized);
  return m ? m[1].trim() : null;
}

/**
 * Extracteur spécialisé Wazuh : cherche la ligne
 *    "Received From: (AGENT_NAME) IP->group"
 * qui est l'endroit le plus fiable puisque Wazuh la met toujours au
 * début du corps. Renvoie { name, ip } ou null si le pattern n'est pas
 * trouvé.
 */
function extractWazuhReceivedFrom(body: string): { name: string; ip: string | null } | null {
  const normalized = body.replace(/\r\n?/g, "\n");
  // Line 2-3 du corps Wazuh :
  //   "Received From: (LV_DG-10) 192.168.16.124->vulnerability-detector"
  // Tolère l'absence d'IP et les espaces variables.
  const m = normalized.match(/Received\s+From:\s*\(([^)]+)\)(?:\s+([0-9.]+))?/i);
  if (!m) return null;
  return { name: m[1].trim(), ip: m[2]?.trim() || null };
}

/**
 * Extrait les champs de la section "Agent" du log Wazuh (format JSON
 * décoder). Structure type :
 *    Agent
 *      Id: "1876"
 *      Name: "LV_DG-10"
 *      Ip: "192.168.16.124"
 *
 * Retourne seulement le Name et l'IP — pas le Id (on s'en sert pas).
 * Note : on prend UNIQUEMENT la section Agent, pas Manager (qui a les
 * mêmes clés mais pointe vers le serveur Wazuh lui-même, pas l'endpoint).
 */
function extractWazuhAgentBlock(body: string): { name: string | null; ip: string | null } {
  const normalized = body.replace(/\r\n?/g, "\n");
  // On isole le bloc Agent → Manager (ou fin) par capture paresseuse.
  const agentBlock = normalized.match(/\bAgent\b[\s\S]*?(?=\bManager\b|\bDecoder\b|\bData\b|$)/i);
  if (!agentBlock) return { name: null, ip: null };
  const chunk = agentBlock[0];
  const nameMatch = chunk.match(/\bName\s*:\s*"?([^"\n]+?)"?\s*$/im);
  const ipMatch = chunk.match(/\bIp\s*:\s*"?([0-9a-fA-F:.]+)"?\s*$/im);
  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    ip: ipMatch ? ipMatch[1].trim() : null,
  };
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

  // Endpoint / agent — plusieurs sources possibles selon le template
  // Wazuh utilisé. Par ordre de fiabilité :
  //   1. Ligne « Received From: (NAME) IP » qui contient les deux en un
  //      coup et est systématiquement présente dans les notifications.
  //   2. Bloc "Agent\n  Name: X\n  Ip: Y" du décodage JSON Wazuh, plus
  //      détaillé mais ambigu avec le bloc "Manager" s'il est mal scopé.
  //   3. Champs plats via extractField() pour les intégrations legacy.
  let endpoint: string | null = null;
  let ipAddress: string | null = null;

  const received = extractWazuhReceivedFrom(body);
  if (received) {
    endpoint = received.name;
    ipAddress = received.ip;
  }
  if (!endpoint || !ipAddress) {
    const agentBlock = extractWazuhAgentBlock(body);
    if (!endpoint) endpoint = agentBlock.name;
    if (!ipAddress) ipAddress = agentBlock.ip;
  }
  if (!endpoint) {
    endpoint =
      extractField(body, ["Agent name", "Agent", "Hostname", "Computer", "Endpoint"]) ??
      null;
  }
  if (!ipAddress) {
    ipAddress =
      extractField(body, ["Source IP", "srcip", "IP Address", "IP", "Address"]) ?? null;
  }

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
