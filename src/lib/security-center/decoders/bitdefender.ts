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
  /** Nom du endpoint / machine. */
  computer_name?: string;
  endpoint_name?: string;
  computer_fqdn?: string;
  /** Nom du compte utilisateur. */
  user_name?: string;
  /** Heures / timestamps. */
  timestamp?: string;
  created_on?: string;
  /** Menace / fichier. */
  threat_name?: string;
  malware_name?: string;
  file_path?: string;
  target_name?: string;
  /** Client / company (utile si multitenant Bitdefender). */
  company_id?: string;
  company_name?: string;
  /** Tout champ supplémentaire. */
  [k: string]: unknown;
}

function normalizeSeverity(raw: unknown): DecodedAlert["severity"] {
  if (raw == null) return undefined;
  const s = String(raw).toLowerCase();
  if (s.includes("critical")) return "critical";
  if (s.includes("high") || s === "3" || s === "10") return "high";
  if (s.includes("warning") || s === "2" || s === "5") return "warning";
  if (s.includes("info") || s === "1") return "info";
  // Nombres Bitdefender (1=info, 2=medium, 3=high, 4=critical sur certaines
  // APIs)
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
  return (e.computer_name || e.endpoint_name || e.computer_fqdn || null) as string | null;
}

function externalIdOf(e: BitdefenderEvent): string | undefined {
  if (e.event_id != null) return `bdf-${String(e.event_id)}`;
  // fallback : clé composite stable
  const t = e.timestamp || e.created_on || "";
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
  // Anti-malware : événement de détection / blocage de menace.
  antimalware: (e, base) => {
    const threat = (e.threat_name || e.malware_name || "menace inconnue") as string;
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
  // Cascade : préfixe CODE- du hostname → fallback Asset/Atera si pas de
  // préfixe (ex: machine "DESKTOP-ABC123" synchronisée dans Atera sous
  // un client connu). Bitdefender fournit parfois l'IP dans `last_ip` ou
  // `ip_address` — on l'utilise en complément du hostname.
  const ip = (event.last_ip || event.ip_address || event.ip) as string | undefined;
  let orgId: string | null = null;
  if (ep) orgId = await resolveOrgByEndpoint(ep);
  if (!orgId && (ep || ip)) orgId = await resolveOrgByHostOrIp(ep, ip);
  const severity = normalizeSeverity(event.severity);
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
