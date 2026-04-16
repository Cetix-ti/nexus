// ============================================================================
// BITDEFENDER GRAVITYZONE DECODER — transforme un événement JSON retourné
// par l'API Bitdefender en DecodedAlert.
//
// Le format Bitdefender varie selon le module source (AntiMalware, Network
// Attack Defense, Advanced Anti-Exploit, HyperDetect, Ransomware…). On
// route d'abord sur le champ `module_id` ou `module` retourné par l'API
// pour déterminer le `kind`, puis on extrait les champs spécifiques.
//
// Registre extensible : chaque nouveau type d'événement = une entrée dans
// MODULE_DECODERS. Un décodeur inconnu tombe sur le "fallback" qui conserve
// les infos de base et met `kind = "critical_incident"` quand la sévérité
// est critical/high.
// ============================================================================

import type { DecodedAlert } from "../types";
import { resolveOrgByEndpoint, resolveOrgByHostOrIp } from "../org-resolver";

/** Format générique d'un événement Bitdefender — on n'est pas strict sur
 *  tous les champs parce que l'API peut en ajouter/retirer selon versions. */
export interface BitdefenderEvent {
  module_id?: string | number;
  module?: string;
  event_type?: string;
  event_id?: string | number;
  severity?: string | number;
  /** Score de sévérité 0-100 (format "new-incident" de GZ). */
  severity_score?: number;
  /** Nom du endpoint / machine. */
  computer_name?: string;
  endpoint_name?: string;
  computer_fqdn?: string;
  computer_ip?: string;
  /** Nom du compte utilisateur. */
  user_name?: string;
  /** Heures / timestamps. */
  timestamp?: string;
  created_on?: string;
  created?: string;
  last_updated?: string;
  /** Menace / fichier. */
  threat_name?: string;
  malware_name?: string;
  detection_name?: string;
  file_path?: string;
  file_name?: string;
  target_name?: string;
  process_path?: string;
  file_hash_sha256?: string;
  /** Client / company (utile si multitenant Bitdefender). */
  company_id?: string;
  company_name?: string;
  /** MITRE ATT&CK techniques IDs (T1083, T1204, etc.). */
  att_ck_id?: string[];
  attack_types?: string[];
  /** Identifiant unique d'incident (GZ new-incident) — idéal comme externalId. */
  incident_id?: string;
  incident_number?: number;
  /** Tout champ supplémentaire. */
  [k: string]: unknown;
}

function normalizeSeverity(raw: unknown, scoreRaw?: unknown): DecodedAlert["severity"] {
  // Priorité au severity_score (0-100, format new-incident GravityZone)
  // si disponible : 80+ = critical, 50+ = high, 25+ = warning, <25 = info.
  if (scoreRaw != null) {
    const n = Number(scoreRaw);
    if (Number.isFinite(n)) {
      if (n >= 80) return "critical";
      if (n >= 50) return "high";
      if (n >= 25) return "warning";
      return "info";
    }
  }
  if (raw == null) return undefined;
  const s = String(raw).toLowerCase();
  if (s.includes("critical")) return "critical";
  if (s.includes("high") || s === "3" || s === "10") return "high";
  if (s.includes("warning") || s === "2" || s === "5") return "warning";
  if (s.includes("info") || s === "1") return "info";
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n >= 4) return "critical";
    if (n >= 3) return "high";
    if (n >= 2) return "warning";
    return "info";
  }
  return undefined;
}

function pickEndpoint(e: BitdefenderEvent): string | null {
  return (
    (e.computer_name || e.endpoint_name || e.computer_fqdn || null) as string | null
  );
}

function pickThreatName(e: BitdefenderEvent): string | null {
  return (
    (e.detection_name || e.threat_name || e.malware_name || null) as string | null
  );
}

function externalIdOf(e: BitdefenderEvent): string | undefined {
  // incident_id de GravityZone = identifiant stable et unique (new-incident).
  // Priorité dessus, c'est la meilleure clé de dédup.
  if (e.incident_id) return `bdf-inc-${String(e.incident_id)}`;
  if (e.event_id != null) return `bdf-${String(e.event_id)}`;
  // fallback : clé composite stable
  const t = e.timestamp || e.created_on || e.created || "";
  const m = e.module_id || e.module || "";
  const ep = pickEndpoint(e) || "";
  if (t && m && ep) return `bdf-${m}-${ep}-${t}`;
  return undefined;
}

/** Décodeur par module — routage extensible. Chaque entrée reçoit
 *  l'événement et le DecodedAlert partiel pré-rempli, et doit renvoyer un
 *  DecodedAlert complet. */
type ModuleDecoder = (
  e: BitdefenderEvent,
  base: Pick<DecodedAlert, "severity" | "endpoint" | "organizationId" | "rawPayload" | "externalId">,
) => DecodedAlert;

const MODULE_DECODERS: Record<string, ModuleDecoder> = {
  // New incident (GravityZone EDR / XDR) — détection corrélée avec
  // contexte MITRE ATT&CK, process chain, file hash. Le payload réel
  // observé chez Cetix contient detection_name, severity_score, att_ck_id
  // (array techniques), process_path, file_hash_sha256, attack_types[].
  new_incident: (e, base) => {
    const threat = pickThreatName(e) ?? "détection inconnue";
    const filePath = (e.file_path || e.process_path || null) as string | null;
    const ep = base.endpoint ?? "endpoint inconnu";
    const attackTypes = Array.isArray(e.attack_types) ? e.attack_types.join(", ") : null;
    const mitre = Array.isArray(e.att_ck_id) ? e.att_ck_id.slice(0, 5).join(", ") : null;
    const sev = base.severity ?? "high";
    const summaryLines = [
      `Détection : ${threat}`,
      filePath ? `Fichier : ${filePath}` : null,
      attackTypes ? `Types : ${attackTypes}` : null,
      mitre ? `MITRE ATT&CK : ${mitre}${Array.isArray(e.att_ck_id) && e.att_ck_id.length > 5 ? ` (+${e.att_ck_id.length - 5})` : ""}` : null,
      e.file_hash_sha256 ? `SHA256 : ${String(e.file_hash_sha256).slice(0, 16)}…` : null,
    ].filter(Boolean);
    return {
      ...base,
      source: "bitdefender_api",
      kind: "critical_incident",
      severity: sev,
      title: `Bitdefender [${sev.toUpperCase()}] ${ep} — ${threat}`,
      summary: summaryLines.join("\n"),
      // Corrélation par incident_id unique : chaque incident GZ reste un
      // seul SecurityIncident Nexus, même si réévalué plusieurs fois.
      correlationKey: e.incident_id
        ? `bdf-inc:${String(e.incident_id)}`
        : `bdf-newinc:${base.organizationId ?? "unknown"}:${ep.toLowerCase()}:${threat.toLowerCase()}`,
    };
  },
  // Anti-malware : événement de détection / blocage de menace.
  antimalware: (e, base) => {
    const threat = pickThreatName(e) ?? "menace inconnue";
    const filePath = (e.file_path || e.target_name || null) as string | null;
    const ep = base.endpoint ?? "endpoint inconnu";
    return {
      ...base,
      source: "bitdefender_api",
      kind: "malware",
      title: `Bitdefender [${(base.severity ?? "info").toUpperCase()}] ${ep} → ${threat}`,
      summary: filePath ? `Fichier : ${filePath}` : threat,
      correlationKey: `bdf-malware:${base.organizationId ?? "unknown"}:${(ep).toLowerCase()}:${threat.toLowerCase()}`,
    };
  },
  ransomware: (e, base) => {
    const target = (e.file_path || e.target_name || "cible inconnue") as string;
    const ep = base.endpoint ?? "endpoint inconnu";
    return {
      ...base,
      source: "bitdefender_api",
      kind: "ransomware",
      severity: base.severity ?? "critical",
      title: `Bitdefender — Activité rançongiciel sur ${ep}`,
      summary: `Cible : ${target}`,
      correlationKey: `bdf-ransom:${base.organizationId ?? "unknown"}:${(ep).toLowerCase()}`,
    };
  },
  network_attack: (e, base) => {
    const ep = base.endpoint ?? "endpoint inconnu";
    const src = (e.source_ip || e["attack_source"] || "source inconnue") as string;
    return {
      ...base,
      source: "bitdefender_api",
      kind: "suspicious_behavior",
      title: `Bitdefender — Attaque réseau sur ${ep}`,
      summary: `Source : ${src}`,
      correlationKey: `bdf-netattack:${base.organizationId ?? "unknown"}:${(ep).toLowerCase()}`,
    };
  },
};

/**
 * Point d'entrée : renvoie un DecodedAlert ou null si l'événement n'est
 * pas exploitable (ex: manque de champs critiques).
 */
export async function decodeBitdefenderEvent(
  event: BitdefenderEvent,
): Promise<DecodedAlert | null> {
  const ep = pickEndpoint(event);
  // Cascade : préfixe CODE- du hostname → fallback Asset/Atera. Payload
  // réel Cetix utilise `computer_ip`, mais on tolère d'autres clés aussi.
  const ip = (event.computer_ip || event.last_ip || event.ip_address || event.ip) as
    | string
    | undefined;
  let orgId: string | null = null;
  if (ep) orgId = await resolveOrgByEndpoint(ep);
  if (!orgId && (ep || ip)) orgId = await resolveOrgByHostOrIp(ep, ip);
  // Sévérité : priorité au severity_score (0-100) de new-incident, sinon
  // lecture classique du champ severity.
  const severity = normalizeSeverity(event.severity, event.severity_score);
  const externalId = externalIdOf(event);

  const base = {
    severity,
    endpoint: ep,
    organizationId: orgId,
    rawPayload: event as unknown,
    externalId,
  } as const;

  // Routage par module — on accepte plusieurs clés que Bitdefender peut
  // renvoyer. Extensible via MODULE_DECODERS.
  const moduleKey = String(event.module_id ?? event.module ?? event.event_type ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");

  for (const [key, decoder] of Object.entries(MODULE_DECODERS)) {
    if (moduleKey.includes(key)) {
      return decoder(event, base);
    }
  }

  // Fallback : événement générique, on en fait un incident critical_incident
  // si la sévérité l'est, sinon suspicious_behavior. Correlation par
  // org+endpoint+moduleKey pour agréger les événements similaires.
  const kindFallback = severity === "critical" || severity === "high"
    ? "critical_incident"
    : "suspicious_behavior";
  return {
    ...base,
    source: "bitdefender_api",
    kind: kindFallback,
    title: `Bitdefender [${(severity ?? "info").toUpperCase()}] ${ep ?? "endpoint inconnu"}${moduleKey ? ` · ${moduleKey}` : ""}`,
    summary: JSON.stringify(event).slice(0, 500),
    correlationKey: `bdf-${moduleKey || "generic"}:${orgId ?? "unknown"}:${(ep ?? "unknown").toLowerCase()}`,
  };
}
