// ============================================================================
// SECURITY CENTER — types partagés
//
// Chaque source (AD email, Wazuh email, Bitdefender API, futurs…) produit une
// `DecodedAlert` normalisée. Le corrélateur consomme ces structures et
// upsert les rows SecurityAlert + SecurityIncident correspondantes.
// ============================================================================

/** Identifie la famille source d'une alerte. Ajoutable librement. */
export type SecuritySource =
  | "ad_email"
  | "wazuh_email"
  | "bitdefender_api"
  // futurs : "m365_defender", "entra_id", "sentinel", "okta"…
  | string;

/** Type d'événement. Chaque décodeur choisit un `kind` stable qui sert à
 *  structurer l'UI et les règles de corrélation. */
export type SecurityKind =
  | "account_lockout"
  | "inactive_account"
  | "persistence_tool"
  | "cve"
  | "malware"
  | "ransomware"
  | "suspicious_behavior"
  | "critical_incident"
  | string;

export type SecuritySeverity = "critical" | "high" | "warning" | "info";

export type SecurityIncidentStatus =
  | "open"
  | "investigating"
  | "waiting_client"
  | "resolved"
  | "closed";

/**
 * Résultat d'un décodeur — forme normalisée, complètement indépendante de
 * Prisma. Un décodeur qui ne sait pas traiter un payload doit retourner
 * `null` (la source stocke alors le raw mais n'ouvre pas d'incident).
 */
export interface DecodedAlert {
  source: SecuritySource;
  kind: SecurityKind;
  severity?: SecuritySeverity;
  /** Clé stable pour dédupliquer : messageId Graph, id API Bitdefender, etc. */
  externalId?: string;
  organizationId?: string | null;
  endpoint?: string | null;
  userPrincipal?: string | null;
  software?: string | null;
  cveId?: string | null;
  title: string;
  summary?: string | null;
  /**
   * Clé de corrélation : toutes les alertes ayant la même clé sont
   * agrégées dans un même SecurityIncident. Bien penser à stabiliser la
   * clé (lowercase, trim) pour éviter les duplications.
   */
  correlationKey: string;
  /** Payload brut complet — gardé pour déboguer et pour pouvoir re-décoder
   *  si le décodeur est amélioré plus tard. */
  rawPayload: unknown;
  /** Horodatage de l'événement source (souvent différent du receivedAt). */
  occurredAt?: Date;
  /** Flag "moins important" — l'UI relègue dans une section repliable
   *  pour ne pas noyer les alertes significatives. Généralement défini
   *  par le décodeur quand un mot-clé configuré matche (ex: "fortigate"). */
  isLowPriority?: boolean;
  /** Metadata structurée optionnelle stockée dans `SecurityIncident.metadata`.
   *  Exemples d'usage :
   *   - liste des comptes inactifs pour une alerte qui groupe plusieurs users
   *   - résultat d'un enrichissement Wazuh (loginCount, isUnusual)
   *   - drapeau "suspicious" pour les lockouts sur un poste inhabituel */
  metadata?: Record<string, unknown> | null;
}
