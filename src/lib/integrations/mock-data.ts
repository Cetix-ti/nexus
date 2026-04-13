import type {
  TenantIntegration,
  OrgIntegrationMapping,
  ExternalEntity,
} from "./types";

function daysAgo(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString();
}

function hoursAgo(h: number): string {
  const date = new Date();
  date.setHours(date.getHours() - h);
  return date.toISOString();
}

// ============================================================================
// TENANT INTEGRATIONS — only Atera and QuickBooks
// ============================================================================
export const mockTenantIntegrations: TenantIntegration[] = [
  {
    id: "int_atera",
    provider: "atera",
    category: "rmm",
    name: "Atera RMM",
    description: "Synchronisation des actifs, alertes et tickets depuis Atera",
    status: "not_connected",
    authType: "api_key",
    apiBaseUrl: "https://app.atera.com/api/v3",
    autoSync: false,
    totalRecordsSynced: 0,
    capabilities: [
      "Synchronisation des actifs",
      "Alertes en temps réel",
      "Inventaire matériel et logiciel",
      "Mise à jour automatique des actifs",
    ],
  },
  {
    id: "int_quickbooks",
    provider: "quickbooks_online",
    category: "accounting",
    name: "QuickBooks Online",
    description: "Émission directe des factures et synchronisation des clients",
    status: "not_connected",
    authType: "oauth2",
    apiBaseUrl: "https://quickbooks.api.intuit.com/v3",
    autoSync: false,
    totalRecordsSynced: 0,
    capabilities: [
      "Émission de factures",
      "Synchronisation des clients",
      "Suivi des paiements",
      "Gestion des taxes (TPS/TVQ)",
    ],
  },
];

// ============================================================================
// PER-ORG MAPPINGS
// ============================================================================
export const mockOrgIntegrationMappings: OrgIntegrationMapping[] = [
  {
    id: "map_atera_acme",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    provider: "atera",
    externalId: "atera_cust_4821",
    externalName: "Acme Corporation",
    lastSyncAt: hoursAgo(1),
    recordCount: 47,
  },
  {
    id: "map_qb_acme",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    provider: "quickbooks_online",
    externalId: "qb_cust_82",
    externalName: "Acme Corporation",
    lastSyncAt: hoursAgo(3),
    recordCount: 28,
  },
];

// ============================================================================
// EXTERNAL ENTITIES (mock list of customers in external systems)
// ============================================================================
export const mockAteraCompanies: ExternalEntity[] = [
  { externalId: "atera_cust_4821", externalName: "Acme Corporation", type: "company" },
  { externalId: "atera_cust_4822", externalName: "Global Finance Inc.", type: "company" },
  { externalId: "atera_cust_4823", externalName: "TechStart Solutions", type: "company" },
  { externalId: "atera_cust_4824", externalName: "HealthCare Plus Networks", type: "company" },
  { externalId: "atera_cust_4825", externalName: "MédiaCentre QC", type: "company" },
];

export const mockQuickBooksCustomers: ExternalEntity[] = [
  { externalId: "qb_cust_82", externalName: "Acme Corporation", type: "customer" },
  { externalId: "qb_cust_85", externalName: "Global Finance Inc.", type: "customer" },
  { externalId: "qb_cust_86", externalName: "TechStart Solutions", type: "customer" },
];
