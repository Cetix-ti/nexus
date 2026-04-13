import type { OrgAsset, RmmIntegration } from "./types";

const now = "2026-04-06T10:00:00.000Z";

function asset(a: Partial<OrgAsset> & Pick<OrgAsset, "id" | "organizationId" | "name" | "type" | "status" | "source">): OrgAsset {
  return {
    isMonitored: true,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...a,
  };
}

export const mockOrgAssets: OrgAsset[] = [
  // Cetix - org-1 (12-15 assets)
  asset({
    id: "ast-c-01", organizationId: "org-1", name: "SRV-DC01", type: "windows_server", status: "active", source: "atera",
    manufacturer: "HPE", model: "ProLiant DL380 Gen10", serialNumber: "CZJ9120ABC", assetTag: "CTX-SRV-001",
    os: "Windows Server", osVersion: "2022 Datacenter", cpuModel: "Intel Xeon Gold 6230", cpuCores: 20, ramGb: 128, storageGb: 4000,
    ipAddress: "10.10.0.10", macAddress: "AC:1F:6B:11:22:33", fqdn: "dc01.cetix.local",
    siteName: "Siège - Salle serveurs", rackPosition: "Rack A1 / U22",
    purchaseDate: "2022-03-15", warrantyExpiry: "2027-03-15", purchaseCost: 12500,
    assignedToContactName: "Jean-Philippe Côté", lastLoggedUser: "CETIX\\admin.jpc", lastSeenAt: "2026-04-06T09:55:00.000Z", lastSyncedAt: now,
    tags: ["production", "active-directory"], externalId: "ATERA-1001",
  }),
  asset({
    id: "ast-c-02", organizationId: "org-1", name: "SRV-FILE01", type: "windows_server", status: "active", source: "atera",
    manufacturer: "Dell", model: "PowerEdge R740", serialNumber: "DLLR740X1", os: "Windows Server", osVersion: "2019",
    cpuModel: "Intel Xeon Silver 4214", cpuCores: 12, ramGb: 64, storageGb: 16000,
    ipAddress: "10.10.0.20", siteName: "Siège - Salle serveurs", rackPosition: "Rack A1 / U20",
    warrantyExpiry: "2026-06-30", lastSeenAt: "2026-04-06T09:50:00.000Z", externalId: "ATERA-1002",
  }),
  asset({
    id: "ast-c-03", organizationId: "org-1", name: "ESXI-NODE01", type: "hypervisor", status: "active", source: "atera",
    manufacturer: "HPE", model: "ProLiant DL360 Gen10", serialNumber: "CZJ8801XYZ",
    os: "VMware ESXi", osVersion: "8.0 U2", cpuModel: "Intel Xeon Gold 6248R", cpuCores: 48, ramGb: 384, storageGb: 2000,
    ipAddress: "10.10.0.30", siteName: "Siège - Salle serveurs", rackPosition: "Rack A2 / U10",
    warrantyExpiry: "2027-09-01", externalId: "ATERA-1003",
  }),
  asset({
    id: "ast-c-04", organizationId: "org-1", name: "ESXI-NODE02", type: "hypervisor", status: "active", source: "atera",
    manufacturer: "HPE", model: "ProLiant DL360 Gen10", serialNumber: "CZJ8802XYZ",
    os: "VMware ESXi", osVersion: "8.0 U2", cpuCores: 48, ramGb: 384,
    ipAddress: "10.10.0.31", siteName: "Siège - Salle serveurs", rackPosition: "Rack A2 / U12",
    warrantyExpiry: "2027-09-01", externalId: "ATERA-1004",
  }),
  asset({
    id: "ast-c-05", organizationId: "org-1", name: "VM-APP01", type: "server_virtual", status: "active", source: "atera",
    os: "Ubuntu", osVersion: "22.04 LTS", cpuCores: 8, ramGb: 32, storageGb: 500,
    ipAddress: "10.10.10.50", siteName: "Cluster ESXi",
  }),
  asset({
    id: "ast-c-06", organizationId: "org-1", name: "NAS-BACKUP01", type: "nas", status: "active", source: "manual",
    manufacturer: "Synology", model: "RS3621xs+", serialNumber: "1980SBR123456", storageGb: 96000,
    ipAddress: "10.10.0.50", siteName: "Siège - Salle serveurs",
    purchaseDate: "2023-01-10", warrantyExpiry: "2028-01-10", purchaseCost: 8200,
    tags: ["backup", "veeam-target"],
  }),
  asset({
    id: "ast-c-07", organizationId: "org-1", name: "FW-EDGE01", type: "firewall", status: "active", source: "manual",
    manufacturer: "Fortinet", model: "FortiGate 100F", serialNumber: "FGT100FTK20001234",
    os: "FortiOS", osVersion: "7.4.3", ipAddress: "10.10.0.1",
    siteName: "Siège - Salle serveurs", warrantyExpiry: "2026-05-15",
  }),
  asset({
    id: "ast-c-08", organizationId: "org-1", name: "SW-CORE01", type: "network_switch", status: "active", source: "manual",
    manufacturer: "Cisco", model: "Catalyst 9300-48P", serialNumber: "FOC2345XYZA",
    ipAddress: "10.10.0.2", siteName: "Siège - Salle serveurs", rackPosition: "Rack A1 / U2",
    warrantyExpiry: "2028-12-31",
  }),
  asset({
    id: "ast-c-09", organizationId: "org-1", name: "SW-ACCESS01", type: "network_switch", status: "active", source: "manual",
    manufacturer: "Cisco", model: "Catalyst 9200-24T", ipAddress: "10.10.0.3",
    siteName: "Siège - Étage 2",
  }),
  asset({
    id: "ast-c-10", organizationId: "org-1", name: "WKS-JP-01", type: "workstation", status: "active", source: "atera",
    manufacturer: "Dell", model: "OptiPlex 7090", serialNumber: "DLLOPX7090A",
    os: "Windows", osVersion: "11 Pro", cpuModel: "Intel Core i7-11700", cpuCores: 8, ramGb: 32, storageGb: 1000,
    ipAddress: "10.10.20.15", assignedToContactName: "Jean-Philippe Côté",
    lastLoggedUser: "CETIX\\jpcote",
    siteName: "Siège - Bureau direction", externalId: "ATERA-2010",
  }),
  asset({
    id: "ast-c-11", organizationId: "org-1", name: "LAP-MARIE-01", type: "laptop", status: "active", source: "other",
    manufacturer: "Lenovo", model: "ThinkPad X1 Carbon Gen 11", serialNumber: "LNVTPX1G11B",
    os: "Windows", osVersion: "11 Pro", cpuModel: "Intel Core i7-1365U", cpuCores: 10, ramGb: 16, storageGb: 512,
    assignedToContactName: "Marie Tremblay", lastLoggedUser: "CETIX\\mtremblay", siteName: "Télétravail",
    warrantyExpiry: "2026-08-20", externalId: "INT-LAP-101",
  }),
  asset({
    id: "ast-c-12", organizationId: "org-1", name: "LAP-ALEX-01", type: "laptop", status: "active", source: "other",
    manufacturer: "Apple", model: "MacBook Pro 14 M3", serialNumber: "C02MBPM3001",
    os: "macOS", osVersion: "14.4", cpuCores: 11, ramGb: 18, storageGb: 1000,
    assignedToContactName: "Alexandre Dubois", lastLoggedUser: "adubois", siteName: "Siège - Open space",
  }),
  asset({
    id: "ast-c-13", organizationId: "org-1", name: "PRN-MFP-01", type: "printer", status: "active", source: "manual",
    manufacturer: "HP", model: "LaserJet Enterprise M635", ipAddress: "10.10.30.5",
    siteName: "Siège - Étage 1",
  }),
  asset({
    id: "ast-c-14", organizationId: "org-1", name: "UPS-RACK-01", type: "ups", status: "maintenance", source: "manual",
    manufacturer: "APC", model: "Smart-UPS SRT 5000VA", serialNumber: "AS1234567890",
    siteName: "Siège - Salle serveurs", warrantyExpiry: "2025-11-01",
  }),

  // Acme - org-2 (6-8)
  asset({
    id: "ast-a-01", organizationId: "org-2", name: "ACME-DC01", type: "windows_server", status: "active", source: "other",
    manufacturer: "Dell", model: "PowerEdge R650", serialNumber: "DLLR650AC1",
    os: "Windows Server", osVersion: "2022", cpuCores: 16, ramGb: 96, storageGb: 2000,
    ipAddress: "192.168.1.10", siteName: "Acme - Datacenter", warrantyExpiry: "2027-04-30",
  }),
  asset({
    id: "ast-a-02", organizationId: "org-2", name: "ACME-FW01", type: "firewall", status: "active", source: "manual",
    manufacturer: "Fortinet", model: "FortiGate 60F", ipAddress: "192.168.1.1",
    siteName: "Acme - Datacenter",
  }),
  asset({
    id: "ast-a-03", organizationId: "org-2", name: "ACME-SW01", type: "network_switch", status: "active", source: "manual",
    manufacturer: "HPE", model: "Aruba 2930F", siteName: "Acme - Datacenter",
  }),
  asset({
    id: "ast-a-04", organizationId: "org-2", name: "ACME-NAS01", type: "nas", status: "active", source: "manual",
    manufacturer: "Synology", model: "DS1821+", storageGb: 48000, ipAddress: "192.168.1.50",
    siteName: "Acme - Datacenter",
  }),
  asset({
    id: "ast-a-05", organizationId: "org-2", name: "ACME-VM-ERP", type: "server_virtual", status: "active", source: "other",
    os: "Linux", osVersion: "RHEL 9", cpuCores: 12, ramGb: 64, storageGb: 1000, ipAddress: "192.168.10.20",
  }),
  asset({
    id: "ast-a-06", organizationId: "org-2", name: "ACME-LAP-01", type: "laptop", status: "active", source: "other",
    manufacturer: "HP", model: "EliteBook 840 G10", os: "Windows", osVersion: "11 Pro",
    assignedToContactName: "Robert Martin", lastLoggedUser: "ACME\\rmartin",
  }),
  asset({
    id: "ast-a-07", organizationId: "org-2", name: "ACME-WKS-01", type: "workstation", status: "active", source: "other",
    manufacturer: "Dell", model: "OptiPlex 5000", os: "Windows", osVersion: "11 Pro",
    assignedToContactName: "Sophie Lavoie", lastLoggedUser: "ACME\\slavoie",
  }),

  // org-4 (4-5)
  asset({
    id: "ast-d-01", organizationId: "org-4", name: "GF-SRV01", type: "windows_server", status: "active", source: "other",
    manufacturer: "HPE", model: "ProLiant DL380 Gen11", os: "Windows Server", osVersion: "2022",
    cpuCores: 24, ramGb: 192, ipAddress: "172.16.0.10", siteName: "Global Finance HQ",
  }),
  asset({
    id: "ast-d-02", organizationId: "org-4", name: "GF-SAN01", type: "san", status: "active", source: "manual",
    manufacturer: "Dell", model: "PowerStore 1000T", storageGb: 192000, siteName: "Global Finance HQ",
  }),
  asset({
    id: "ast-d-03", organizationId: "org-4", name: "GF-FW01", type: "firewall", status: "active", source: "manual",
    manufacturer: "Palo Alto", model: "PA-3220", ipAddress: "172.16.0.1", siteName: "Global Finance HQ",
  }),
  asset({
    id: "ast-d-04", organizationId: "org-4", name: "GF-ESXI01", type: "hypervisor", status: "active", source: "other",
    manufacturer: "Dell", model: "PowerEdge R750", os: "VMware ESXi", osVersion: "8.0",
    cpuCores: 64, ramGb: 512, siteName: "Global Finance HQ",
  }),
  asset({
    id: "ast-d-05", organizationId: "org-4", name: "GF-LAP-CL01", type: "laptop", status: "inactive", source: "other",
    manufacturer: "Lenovo", model: "ThinkPad T14", os: "Windows", osVersion: "11 Pro",
    assignedToContactName: "Catherine Lemieux", lastLoggedUser: "GF\\clemieux",
  }),
];

export const mockRmmIntegrations: RmmIntegration[] = [
  {
    id: "rmm-1", organizationId: "org-1", provider: "atera", isConnected: true,
    lastSyncAt: "2026-04-06T08:30:00.000Z", syncedAssetCount: 8, apiKeyMasked: "atr_••••••a91f",
  },
  {
    id: "rmm-2", organizationId: "org-1", provider: "other", isConnected: false, syncedAssetCount: 0,
  },
  {
    id: "rmm-3", organizationId: "org-1", provider: "other", isConnected: false, syncedAssetCount: 0,
  },
];

export function getMockAssetsForOrg(organizationId: string): OrgAsset[] {
  return mockOrgAssets.filter((a) => a.organizationId === organizationId);
}
