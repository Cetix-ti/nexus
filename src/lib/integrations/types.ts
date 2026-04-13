// ============================================================================
// NEXUS INTEGRATIONS DOMAIN
// Tenant-level integrations (Atera, QuickBooks) configured globally
// then mapped per organization where applicable
// ============================================================================

export type IntegrationProvider =
  | "atera"
  | "quickbooks_online";

export const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  atera: "Atera RMM",
  quickbooks_online: "QuickBooks Online",
};

export type IntegrationCategory =
  | "rmm"
  | "accounting";

export const INTEGRATION_CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  rmm: "RMM & Gestion d'actifs",
  accounting: "Comptabilité & Facturation",
};

export const INTEGRATION_CATEGORIES: Record<
  IntegrationProvider,
  IntegrationCategory
> = {
  atera: "rmm",
  quickbooks_online: "accounting",
};

export type ConnectionStatus =
  | "not_connected"
  | "connected"
  | "syncing"
  | "error"
  | "expired_token"
  | "pending_auth";

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  not_connected: "Non connecté",
  connected: "Connecté",
  syncing: "Synchronisation",
  error: "Erreur",
  expired_token: "Jeton expiré",
  pending_auth: "En attente d'autorisation",
};

export const CONNECTION_STATUS_VARIANTS: Record<
  ConnectionStatus,
  "default" | "success" | "warning" | "danger" | "primary"
> = {
  not_connected: "default",
  connected: "success",
  syncing: "primary",
  error: "danger",
  expired_token: "warning",
  pending_auth: "primary",
};

export interface TenantIntegration {
  id: string;
  provider: IntegrationProvider;
  category: IntegrationCategory;
  name: string;
  description: string;
  status: ConnectionStatus;
  authType: "api_key" | "oauth2" | "webhook";
  apiBaseUrl?: string;
  lastSyncAt?: string;
  nextSyncAt?: string;
  autoSync: boolean;
  syncIntervalMinutes?: number;
  totalRecordsSynced: number;
  lastErrorMessage?: string;
  capabilities: string[];
  connectedBy?: string;
  connectedAt?: string;
}

export interface OrgIntegrationMapping {
  id: string;
  organizationId: string;
  organizationName: string;
  provider: IntegrationProvider;
  externalId: string;
  externalName: string;
  lastSyncAt?: string;
  recordCount: number;
}

export interface ExternalEntity {
  externalId: string;
  externalName: string;
  type: string;
  details?: Record<string, unknown>;
}
