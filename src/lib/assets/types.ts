export type AssetType =
  | "server_physical"
  | "server_virtual"
  | "windows_server"
  | "linux_server"
  | "nas"
  | "san"
  | "hypervisor"
  | "workstation"
  | "laptop"
  | "network_switch"
  | "firewall"
  | "router"
  | "wifi_ap"
  | "ups"
  | "printer"
  | "ip_phone"
  | "monitoring_appliance"
  | "tape_library"
  | "cloud_resource";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  server_physical: "Serveur physique",
  server_virtual: "Machine virtuelle",
  windows_server: "Serveur Windows",
  linux_server: "Serveur Linux",
  nas: "NAS",
  san: "SAN / Stockage",
  hypervisor: "Hyperviseur",
  workstation: "Poste de travail",
  laptop: "Portable",
  network_switch: "Switch réseau",
  firewall: "Pare-feu",
  router: "Routeur",
  wifi_ap: "Point d'accès WiFi",
  ups: "Onduleur (UPS)",
  printer: "Imprimante",
  ip_phone: "Téléphone IP",
  monitoring_appliance: "Appareil de monitoring",
  tape_library: "Bibliothèque de sauvegarde",
  cloud_resource: "Ressource cloud",
};

export const ASSET_TYPE_CATEGORIES: { label: string; types: AssetType[] }[] = [
  {
    label: "Serveurs",
    types: ["server_physical", "server_virtual", "windows_server", "linux_server", "hypervisor"],
  },
  { label: "Stockage", types: ["nas", "san", "tape_library"] },
  { label: "Réseau", types: ["network_switch", "firewall", "router", "wifi_ap"] },
  {
    label: "Postes & Périphériques",
    types: ["workstation", "laptop", "printer", "ip_phone", "ups", "monitoring_appliance"],
  },
  { label: "Cloud", types: ["cloud_resource"] },
];

export type AssetStatus = "active" | "maintenance" | "inactive" | "retired" | "decommissioned";

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Actif",
  maintenance: "En maintenance",
  inactive: "Inactif",
  retired: "Retiré",
  decommissioned: "Mis hors service",
};

export type AssetSource = "manual" | "atera" | "other";

export const ASSET_SOURCE_LABELS: Record<AssetSource, string> = {
  manual: "Saisie manuelle",
  atera: "Atera RMM",
  other: "Autre",
};

export interface OrgAsset {
  id: string;
  organizationId: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  source: AssetSource;
  externalId?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  assetTag?: string;
  os?: string;
  osVersion?: string;
  cpuModel?: string;
  cpuCores?: number;
  ramGb?: number;
  storageGb?: number;
  ipAddress?: string;
  macAddress?: string;
  fqdn?: string;
  siteId?: string;
  siteName?: string;
  rackPosition?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  endOfLifeDate?: string;
  purchaseCost?: number;
  assignedContactId?: string;
  assignedToContactName?: string;
  lastLoggedUser?: string;
  isMonitored: boolean;
  lastSeenAt?: string;
  tags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
}

export interface RmmIntegration {
  id: string;
  organizationId: string;
  provider: AssetSource;
  isConnected: boolean;
  lastSyncAt?: string;
  syncedAssetCount: number;
  apiKeyMasked?: string;
  errorMessage?: string;
}
