// ============================================================================
// NEXUS INTEGRATIONS DOMAIN
// Tenant-level integrations (Atera, QuickBooks, etc.) configured globally
// then mapped per organization where applicable
// ============================================================================

export type IntegrationProvider =
  // RMM / Asset management
  | "atera"
  | "ninja_one"
  | "kaseya_vsa"
  | "datto_rmm"
  // Accounting / Invoicing
  | "quickbooks_online"
  | "sage"
  | "freshbooks"
  // Communication
  | "slack"
  | "microsoft_teams"
  | "twilio"
  // Monitoring
  | "datadog"
  | "pagerduty"
  // Documentation
  | "it_glue"
  | "hudu"
  // Backup
  | "veeam"
  | "datto_backup";

export const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  atera: "Atera RMM",
  ninja_one: "NinjaOne",
  kaseya_vsa: "Kaseya VSA",
  datto_rmm: "Datto RMM",
  quickbooks_online: "QuickBooks Online",
  sage: "Sage Comptabilité",
  freshbooks: "FreshBooks",
  slack: "Slack",
  microsoft_teams: "Microsoft Teams",
  twilio: "Twilio",
  datadog: "Datadog",
  pagerduty: "PagerDuty",
  it_glue: "IT Glue",
  hudu: "Hudu",
  veeam: "Veeam",
  datto_backup: "Datto Backup",
};

export type IntegrationCategory =
  | "rmm"
  | "accounting"
  | "communication"
  | "monitoring"
  | "documentation"
  | "backup";

export const INTEGRATION_CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  rmm: "RMM & Gestion d'actifs",
  accounting: "Comptabilité & Facturation",
  communication: "Communication",
  monitoring: "Monitoring & Alertes",
  documentation: "Documentation",
  backup: "Sauvegarde",
};

export const INTEGRATION_CATEGORIES: Record<
  IntegrationProvider,
  IntegrationCategory
> = {
  atera: "rmm",
  ninja_one: "rmm",
  kaseya_vsa: "rmm",
  datto_rmm: "rmm",
  quickbooks_online: "accounting",
  sage: "accounting",
  freshbooks: "accounting",
  slack: "communication",
  microsoft_teams: "communication",
  twilio: "communication",
  datadog: "monitoring",
  pagerduty: "monitoring",
  it_glue: "documentation",
  hudu: "documentation",
  veeam: "backup",
  datto_backup: "backup",
};

export type ConnectionStatus =
  | "not_connected"
  | "connected"
  | "syncing"
  | "error"
  | "expired_token";

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  not_connected: "Non connecté",
  connected: "Connecté",
  syncing: "Synchronisation",
  error: "Erreur",
  expired_token: "Token expiré",
};

export const CONNECTION_STATUS_VARIANTS: Record<
  ConnectionStatus,
  "default" | "primary" | "success" | "warning" | "danger"
> = {
  not_connected: "default",
  connected: "success",
  syncing: "primary",
  error: "danger",
  expired_token: "warning",
};

// ----------------------------------------------------------------------------
// TENANT INTEGRATION (global, configured once for the MSP)
// ----------------------------------------------------------------------------

export interface TenantIntegration {
  id: string;
  provider: IntegrationProvider;
  category: IntegrationCategory;
  name: string;
  description: string;
  status: ConnectionStatus;
  // Auth (mocked)
  authType: "api_key" | "oauth2" | "bearer_token";
  apiKeyMasked?: string;
  oauthClientId?: string;
  // Settings
  apiBaseUrl?: string;
  webhookUrl?: string;
  // Sync
  lastSyncAt?: string;
  nextSyncAt?: string;
  autoSync: boolean;
  syncIntervalMinutes?: number;
  // Stats
  totalRecordsSynced: number;
  lastErrorMessage?: string;
  // Capabilities (what this integration can do)
  capabilities: string[];
  // Connected by
  connectedBy?: string;
  connectedAt?: string;
}

// ----------------------------------------------------------------------------
// PER-ORG MAPPING (links one of our orgs to a record in the external system)
// ----------------------------------------------------------------------------

export interface OrgIntegrationMapping {
  id: string;
  organizationId: string;
  organizationName: string;
  provider: IntegrationProvider;
  // Link to the external record
  externalId: string;          // ID in the external system
  externalName: string;        // Display name in the external system
  externalUrl?: string;
  // Sync stats
  isActive: boolean;
  lastSyncAt?: string;
  syncedRecordCount: number;
  syncedRecordType?: string;   // "assets", "invoices", etc.
  // Audit
  mappedAt: string;
  mappedBy: string;
}

// ----------------------------------------------------------------------------
// EXTERNAL ENTITY (an entity that exists in the external system, not yet mapped)
// Used by the mapping picker to show available entities to map to.
// ----------------------------------------------------------------------------
export interface ExternalEntity {
  externalId: string;
  externalName: string;
  type: "company" | "customer" | "vendor";
  city?: string;
  country?: string;
  isAlreadyMapped?: boolean;
}
