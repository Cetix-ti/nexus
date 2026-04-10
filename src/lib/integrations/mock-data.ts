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

function hoursFromNow(h: number): string {
  const date = new Date();
  date.setHours(date.getHours() + h);
  return date.toISOString();
}

// ============================================================================
// TENANT INTEGRATIONS
// ============================================================================
export const mockTenantIntegrations: TenantIntegration[] = [
  {
    id: "int_atera",
    provider: "atera",
    category: "rmm",
    name: "Atera RMM",
    description:
      "Synchronisation des actifs, alertes et tickets depuis Atera",
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
    connectedBy: "Jean-Philippe Côté",
    connectedAt: daysAgo(45),
  },
  {
    id: "int_quickbooks",
    provider: "quickbooks_online",
    category: "accounting",
    name: "QuickBooks Online",
    description:
      "Émission directe des factures et synchronisation des clients",
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
    connectedBy: "Jean-Philippe Côté",
    connectedAt: daysAgo(90),
  },
  {
    id: "int_ninja",
    provider: "ninja_one",
    category: "rmm",
    name: "NinjaOne",
    description: "Plateforme RMM alternative",
    status: "not_connected",
    authType: "api_key",
    autoSync: false,
    totalRecordsSynced: 0,
    capabilities: [
      "Synchronisation des actifs",
      "Surveillance proactive",
      "Patch management",
    ],
  },
  {
    id: "int_slack",
    provider: "slack",
    category: "communication",
    name: "Slack",
    description:
      "Notifications de tickets et alertes dans vos canaux Slack",
    status: "not_connected",
    authType: "oauth2",
    apiBaseUrl: "https://slack.com/api",
    autoSync: false,
    totalRecordsSynced: 0,
    capabilities: [
      "Notifications de tickets",
      "Alertes SLA",
      "Mentions d'agents",
    ],
    connectedBy: "Marie Tremblay",
    connectedAt: daysAgo(30),
  },
  {
    id: "int_teams",
    provider: "microsoft_teams",
    category: "communication",
    name: "Microsoft Teams",
    description: "Notifications dans vos équipes Teams",
    status: "not_connected",
    authType: "oauth2",
    autoSync: false,
    totalRecordsSynced: 0,
    capabilities: ["Notifications de tickets", "Alertes SLA"],
  },
  {
    id: "int_pagerduty",
    provider: "pagerduty",
    category: "monitoring",
    name: "PagerDuty",
    description: "Escalade d'incidents critiques 24/7",
    status: "expired_token",
    authType: "oauth2",
    autoSync: false,
    totalRecordsSynced: 12,
    lastErrorMessage: "Le token OAuth a expiré le 2026-04-01. Reconnecter requis.",
    capabilities: [
      "Escalade automatique",
      "Notifications SMS d'urgence",
      "Rotation d'astreinte",
    ],
    connectedBy: "Jean-Philippe Côté",
    connectedAt: daysAgo(180),
  },
  {
    id: "int_itglue",
    provider: "it_glue",
    category: "documentation",
    name: "IT Glue",
    description:
      "Documentation technique centralisée par client",
    status: "not_connected",
    authType: "api_key",
    lastSyncAt: hoursAgo(6),
    autoSync: true,
    syncIntervalMinutes: 360,
    totalRecordsSynced: 89,
    capabilities: [
      "Documentation par client",
      "Mots de passe et secrets",
      "Procédures et runbooks",
    ],
    connectedBy: "Sophie Lavoie",
    connectedAt: daysAgo(60),
  },
  {
    id: "int_veeam",
    provider: "veeam",
    category: "backup",
    name: "Veeam Backup",
    description: "Surveillance des sauvegardes Veeam",
    status: "not_connected",
    authType: "api_key",
    autoSync: false,
    totalRecordsSynced: 0,
    capabilities: [
      "État des sauvegardes",
      "Alertes d'échec",
      "Rapports de RPO/RTO",
    ],
  },
];

// ============================================================================
// PER-ORG MAPPINGS
// Link our orgs to entities in external systems
// ============================================================================
export const mockOrgIntegrationMappings: OrgIntegrationMapping[] = [
  // Atera mappings
  {
    id: "map_atera_acme",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    provider: "atera",
    externalId: "atera_cust_4821",
    externalName: "Acme Corporation",
    externalUrl: "https://app.atera.com/Customers/4821",
    isActive: true,
    lastSyncAt: hoursAgo(1),
    syncedRecordCount: 47,
    syncedRecordType: "assets",
    mappedAt: daysAgo(45),
    mappedBy: "Jean-Philippe Côté",
  },
  {
    id: "map_atera_global",
    organizationId: "org-4",
    organizationName: "Global Finance",
    provider: "atera",
    externalId: "atera_cust_4822",
    externalName: "Global Finance Inc.",
    externalUrl: "https://app.atera.com/Customers/4822",
    isActive: true,
    lastSyncAt: hoursAgo(1),
    syncedRecordCount: 132,
    syncedRecordType: "assets",
    mappedAt: daysAgo(45),
    mappedBy: "Jean-Philippe Côté",
  },
  {
    id: "map_atera_techstart",
    organizationId: "org-3",
    organizationName: "TechStart Inc",
    provider: "atera",
    externalId: "atera_cust_4823",
    externalName: "TechStart Solutions",
    externalUrl: "https://app.atera.com/Customers/4823",
    isActive: true,
    lastSyncAt: hoursAgo(2),
    syncedRecordCount: 18,
    syncedRecordType: "assets",
    mappedAt: daysAgo(30),
    mappedBy: "Marie Tremblay",
  },
  // QuickBooks mappings
  {
    id: "map_qb_acme",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    provider: "quickbooks_online",
    externalId: "qb_cust_82",
    externalName: "Acme Corporation",
    isActive: true,
    lastSyncAt: hoursAgo(3),
    syncedRecordCount: 28,
    syncedRecordType: "invoices",
    mappedAt: daysAgo(90),
    mappedBy: "Jean-Philippe Côté",
  },
  {
    id: "map_qb_global",
    organizationId: "org-4",
    organizationName: "Global Finance",
    provider: "quickbooks_online",
    externalId: "qb_cust_85",
    externalName: "Global Finance Inc.",
    isActive: true,
    lastSyncAt: hoursAgo(3),
    syncedRecordCount: 41,
    syncedRecordType: "invoices",
    mappedAt: daysAgo(90),
    mappedBy: "Jean-Philippe Côté",
  },
];

// ============================================================================
// EXTERNAL ENTITIES (mock list of available customers in external systems)
// Used by the mapping picker to let user select which external entity to link
// ============================================================================
export const mockAteraCompanies: ExternalEntity[] = [
  { externalId: "atera_cust_4821", externalName: "Acme Corporation", type: "company", city: "Québec", country: "Canada", isAlreadyMapped: true },
  { externalId: "atera_cust_4822", externalName: "Global Finance Inc.", type: "company", city: "Montréal", country: "Canada", isAlreadyMapped: true },
  { externalId: "atera_cust_4823", externalName: "TechStart Solutions", type: "company", city: "Sherbrooke", country: "Canada", isAlreadyMapped: true },
  { externalId: "atera_cust_4824", externalName: "HealthCare Plus Networks", type: "company", city: "Lévis", country: "Canada" },
  { externalId: "atera_cust_4825", externalName: "MédiaCentre QC", type: "company", city: "Québec", country: "Canada" },
  { externalId: "atera_cust_4826", externalName: "Bélanger & Associés", type: "company", city: "Montréal", country: "Canada" },
  { externalId: "atera_cust_4827", externalName: "Cabinet Tremblay Avocats", type: "company", city: "Québec", country: "Canada" },
];

export const mockQuickBooksCustomers: ExternalEntity[] = [
  { externalId: "qb_cust_82", externalName: "Acme Corporation", type: "customer", city: "Québec", isAlreadyMapped: true },
  { externalId: "qb_cust_85", externalName: "Global Finance Inc.", type: "customer", city: "Montréal", isAlreadyMapped: true },
  { externalId: "qb_cust_91", externalName: "TechStart Solutions", type: "customer", city: "Sherbrooke" },
  { externalId: "qb_cust_94", externalName: "HealthCare Plus", type: "customer", city: "Lévis" },
  { externalId: "qb_cust_97", externalName: "MédiaCentre QC", type: "customer", city: "Québec" },
];

// ============================================================================
// HELPERS
// ============================================================================
export function getOrgMapping(
  orgId: string,
  provider: string
): OrgIntegrationMapping | undefined {
  return mockOrgIntegrationMappings.find(
    (m) => m.organizationId === orgId && m.provider === provider && m.isActive
  );
}

export function getTenantIntegration(
  provider: string
): TenantIntegration | undefined {
  return mockTenantIntegrations.find((i) => i.provider === provider);
}
