// ============================================================================
// DÉCODEUR WAZUH API — transforme un hit OpenSearch en DecodedAlert.
//
// Par rapport au décodeur email, on a accès nativement à :
//   - agent.id / agent.name / agent.ip / agent.labels (possible MAC)
//   - rule.id / rule.level / rule.description / rule.groups[]
//   - data.vulnerability.* pour les CVE (structuré)
//   - data.srcip / data.dstip pour les alertes réseau
//   - MITRE ATT&CK mapping
//
// Le routage kind se fait sur rule.groups[] — Wazuh tagge ses règles
// avec des groupes stables (vulnerability-detector, syscheck, auth,
// brute_force, rootcheck, etc.). Mapping extensible via GROUP_TO_KIND.
// ============================================================================

import type { DecodedAlert, SecurityKind, SecuritySeverity } from "../types";
import type { WazuhAlert } from "../wazuh-client";
import {
  resolveOrgByEndpoint,
  resolveOrgByHostOrIp,
} from "../org-resolver";

/**
 * Mapping des groupes de règles Wazuh vers nos `kind` métier. Première
 * règle qui matche gagne — l'ordre est important quand plusieurs
 * groupes s'appliquent (ex: "vulnerability-detector,windows").
 */
const GROUP_TO_KIND: Array<{ match: RegExp; kind: SecurityKind }> = [
  { match: /vulnerability[-_]detector/i, kind: "cve" },
  { match: /syscheck|fim|file[-_]integrity/i, kind: "suspicious_behavior" },
  { match: /rootcheck|rootkit/i, kind: "malware" },
  { match: /brute[-_]?force|authentication_fail/i, kind: "critical_incident" },
  { match: /ransom/i, kind: "ransomware" },
  { match: /virustotal|malware|suspicious[-_]file/i, kind: "malware" },
  { match: /remote[-_]?access|anydesk|teamviewer|screenconnect/i, kind: "persistence_tool" },
];

/** Priorise la sévérité selon le niveau Wazuh (0-15) :
 *    0-3  → info
 *    4-6  → warning
 *    7-9  → high
 *    10+  → critical  */
function severityFromLevel(level: number | undefined): SecuritySeverity {
  if (typeof level !== "number") return "info";
  if (level >= 10) return "critical";
  if (level >= 7) return "high";
  if (level >= 4) return "warning";
  return "info";
}

/** Déduit le `kind` à partir de rule.groups ou fallback. */
function kindFromAlert(alert: WazuhAlert): SecurityKind {
  const groups = alert._source.rule?.groups ?? [];
  const joined = groups.join(",");
  for (const mapping of GROUP_TO_KIND) {
    if (mapping.match.test(joined)) return mapping.kind;
  }
  // Pas de mapping explicite → suspicious_behavior reste un bon fallback
  // neutre (pas trop alarmiste, pas trop benign).
  return "suspicious_behavior";
}

/** Extrait un CVE éventuel (data.vulnerability.cve ou description). */
function extractCve(alert: WazuhAlert): string | null {
  const v = (alert._source.data as { vulnerability?: { cve?: string } } | undefined)
    ?.vulnerability;
  if (v?.cve) return v.cve;
  const desc = alert._source.rule?.description ?? "";
  const m = desc.match(/CVE-\d{4}-\d{4,7}/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * Construit la clé de corrélation. On veut regrouper les alertes
 * identiques (même agent + même problème), mais pas les agrégats trop
 * larges (éviter de mettre tous les events d'un même agent ensemble).
 */
function buildCorrelationKey(
  alert: WazuhAlert,
  kind: SecurityKind,
  orgId: string | null,
): string {
  const orgKey = orgId ?? "unknown";
  const endpoint = (alert._source.agent?.name ?? "unknown").toLowerCase();
  const cve = extractCve(alert);
  const ruleId = alert._source.rule?.id ?? "nogroup";

  if (kind === "cve" && cve) {
    return `cve:${orgKey}:${endpoint}:${cve}`;
  }
  if (kind === "persistence_tool") {
    // On tire le nom du logiciel de la description de la règle.
    const desc = (alert._source.rule?.description ?? "").toLowerCase();
    const software =
      ["anydesk", "teamviewer", "splashtop", "screenconnect", "logmein"].find((n) =>
        desc.includes(n),
      ) ?? "unknown";
    return `persistence:${orgKey}:${endpoint}:${software}`;
  }
  // Par défaut : rule + agent → agrège les "même règle sur même agent".
  return `wazuh:${orgKey}:${endpoint}:${ruleId}`;
}

/**
 * Résout l'organisation. Cascade identique aux autres décodeurs, avec
 * en plus un lookup par MAC si disponible dans agent.labels (Wazuh
 * laisse les agents injecter des labels via leur agent.conf — certains
 * setups y mettent la MAC).
 */
async function resolveOrg(alert: WazuhAlert): Promise<string | null> {
  const hostname = alert._source.agent?.name ?? null;
  const ip = alert._source.agent?.ip ?? null;
  const labels = alert._source.agent?.labels ?? {};
  const mac = labels.mac || labels.MAC || labels.mac_address || null;

  // 1. Préfixe CODE- du hostname (rapide, aucune requête).
  if (hostname) {
    const byPrefix = await resolveOrgByEndpoint(hostname);
    if (byPrefix) return byPrefix;
  }
  // 2. Lookup Asset/Atera par hostname ou IP. Même fonction que les autres
  //    décodeurs. resolveOrgByHostOrIp est elle-même cachée, donc appels
  //    répétés sur le même host sont bon marché.
  if (hostname || ip) {
    const byRmm = await resolveOrgByHostOrIp(hostname, ip);
    if (byRmm) return byRmm;
  }
  // 3. Futur : si agent.labels.mac est exposé, on ajouterait un lookup
  //    resolveOrgByMac(mac). Skippé pour l'instant — à brancher dès que
  //    les règles Wazuh exposent la MAC dans les labels (voir commentaire
  //    dans org-resolver pour l'implémentation attendue).
  void mac;
  return null;
}

export async function decodeWazuhApiAlert(alert: WazuhAlert): Promise<DecodedAlert | null> {
  const src = alert._source;
  if (!src?.rule) return null;

  const kind = kindFromAlert(alert);
  const severity = severityFromLevel(src.rule.level);
  const organizationId = await resolveOrg(alert);
  const endpoint = src.agent?.name ?? null;
  const cveId = extractCve(alert);

  // Titre lisible. Pour les CVE on met le CVE + description, sinon on
  // garde rule.description qui est déjà bien rédigée côté Wazuh.
  const title =
    cveId && kind === "cve"
      ? `${cveId} — ${endpoint ?? "endpoint inconnu"}`
      : src.rule.description ?? `Alerte Wazuh rule ${src.rule.id ?? "?"}`;

  const correlationKey = buildCorrelationKey(alert, kind, organizationId);

  return {
    source: "wazuh_api",
    kind,
    severity,
    // On dédup sur le _id OpenSearch — stable et propre.
    externalId: alert._id,
    organizationId,
    endpoint,
    userPrincipal: null,
    cveId: cveId ?? undefined,
    title,
    summary: buildSummary(src),
    correlationKey,
    rawPayload: alert._source,
    occurredAt: src.timestamp ? new Date(src.timestamp) : undefined,
  };
}

function buildSummary(src: WazuhAlert["_source"]): string {
  const parts: string[] = [];
  if (src.rule?.description) parts.push(src.rule.description);
  if (src.agent?.name) parts.push(`Agent : ${src.agent.name}${src.agent.ip ? ` (${src.agent.ip})` : ""}`);
  if (src.rule?.id) parts.push(`Règle ${src.rule.id} · niveau ${src.rule.level ?? "?"}`);
  if (src.rule?.groups?.length) parts.push(`Groupes : ${src.rule.groups.join(", ")}`);
  const mitre = src.rule?.mitre?.technique;
  if (Array.isArray(mitre) && mitre.length > 0) {
    parts.push(`MITRE ATT&CK : ${mitre.join(", ")}`);
  }
  if (src.location) parts.push(`Source : ${src.location}`);
  return parts.join("\n");
}
