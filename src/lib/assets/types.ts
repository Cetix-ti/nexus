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
  // Regroupés sous un libellé unique : l'OSType d'Atera ne permet pas
  // toujours de distinguer un Windows Server d'un serveur Linux (il peut
  // retourner simplement "Server" / "Domain Controller").
  windows_server: "Serveurs Windows/Linux",
  linux_server: "Serveurs Windows/Linux",
  nas: "NAS",
  san: "SAN / Stockage",
  hypervisor: "Hyperviseur",
  // Regroupés : la catégorisation OSType "Work Station" est identique
  // pour les desktops et les laptops ; distinction impossible de façon fiable.
  workstation: "Postes de travail",
  laptop: "Postes de travail",
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
  // Postes de travail : typiquement issus d'Atera (workstation + laptop
  // partagent le libellé "Postes de travail" via ASSET_TYPE_LABELS).
  { label: "Postes de travail", types: ["workstation", "laptop"] },
  // Périphériques divers : pas gérés par le RMM — imprimantes, téléphones
  // IP, onduleurs, appliances de monitoring. Catégorie séparée pour ne
  // pas les mélanger avec les postes Atera.
  {
    label: "Périphériques divers",
    types: ["printer", "ip_phone", "ups", "monitoring_appliance"],
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

export type AssetSource = "manual" | "atera";

export const ASSET_SOURCE_LABELS: Record<AssetSource, string> = {
  manual: "Saisie manuelle",
  atera: "Atera RMM",
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
