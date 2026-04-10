// ============================================================================
// FRESHSERVICE EXPORT TYPES — Source schema (raw, untransformed)
// Mirrors the XML structure from a Freshservice tenant data export.
// ============================================================================

export interface FsCompany {
  id: number;
  name: string;
  description?: string;
  domains?: string;
  apiName?: string;
  workspaceId?: number;
  createdAt?: string;
  updatedAt?: string;
  customFields?: Record<string, string>;
}

export interface FsUser {
  id: number;
  name: string;
  email: string;
  active: boolean;
  jobTitle?: string;
  phone?: string;
  mobile?: string;
  language?: string;
  timeZone?: string;
  externalId?: string;        // Azure AD object id when SSO is set up
  helpdeskAgent: boolean;     // true → agent (technician)
  vipUser: boolean;
  locationName?: string;
  companyNames: string[];
  workspaceIds: number[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FsGroup {
  id: number;
  name: string;
  description?: string;
  workspaceId?: number;
  businessFunction?: string;
  approvalRequired: boolean;
  agentIds: number[];
  agentNames: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FsTicketNote {
  id: number;
  userId: number;
  source: number;
  incoming: boolean;
  private: boolean;       // true → internal note
  body: string;
  bodyHtml?: string;
  supportEmail?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FsTicket {
  id: number;
  displayId: number;
  subject: string;
  description: string;
  descriptionHtml?: string;
  status: number;             // 2=Open, 3=Pending, 4=Resolved, 5=Closed, etc.
  statusName?: string;
  priority: number;           // 1=Low, 2=Medium, 3=High, 4=Urgent
  priorityName?: string;
  source: number;             // 1=Email, 2=Portal, 3=Phone, ...
  sourceName?: string;
  urgency: number;
  impact: number;
  ticketType: string;         // "Incident" | "Service Request" | ...
  requesterId?: number;
  requesterName?: string;
  responderId?: number;
  responderName?: string;
  ownerId?: number;
  groupId?: number;
  departmentName?: string;    // == company name in your case
  departmentId?: number;
  category?: string;
  subCategory?: string;
  itemCategory?: string;
  workspaceId?: number;
  dueBy?: string;
  frDueBy?: string;
  isEscalated: boolean;
  frEscalated: boolean;
  spam: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  notes: FsTicketNote[];      // conversations + internal notes
  // Custom fields seen in your tenant
  customFields?: {
    projet?: string;          // projet_571144
    cedule?: string;          // cdule_571144 (NIVEAU 1, NIVEAU 3, ...)
    niveau?: string;          // niveau_571144 (JOUR, SOIR, NUIT)
    travauxSurPlace?: string; // travaux_sur_place_571144 (OUI, NON)
    actionsPrise?: string;    // actions_prise_2_571144
    [key: string]: string | undefined;
  };
}

export interface FsAsset {
  id: number;
  name: string;
  description?: string;
  ciTypeName?: string;
  assetTag?: string;
  usedBy?: string;
  usedByEmail?: string;
  companyName?: string;
  hardware?: {
    productName?: string;
    vendorName?: string;
    serialNumber?: string;
    cost?: number;
    acquisitionDate?: string;
    warrantyExpiryDate?: string;
  };
  computer?: {
    os?: string;
    osVersion?: string;
    osServicePack?: string;
    memoryGb?: number;
    diskSpaceGb?: number;
    cpuSpeedGhz?: number;
    cpuCoreCount?: number;
    macAddress?: string;
    ipAddress?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface FsSolutionArticle {
  id: number;
  title: string;
  description: string;          // HTML
  status?: number;
  position?: number;
  agentId?: number;
  views?: number;
  thumbsUp?: number;
  thumbsDown?: number;
  createdAt?: string;
  updatedAt?: string;
  folderId?: number;
}

export interface FsSolutionFolder {
  id: number;
  name: string;
  description?: string;
  visibility?: number;
  position?: number;
  categoryId?: number;
  articles: FsSolutionArticle[];
}

export interface FsSolutionCategory {
  id: number;
  name: string;
  description?: string;
  position?: number;
  workspaceId?: number;
  folders: FsSolutionFolder[];
}

// ============================================================================
// FULL EXPORT (parsed)
// ============================================================================
export interface FsExport {
  workspaces: { id: number; name: string }[];
  companies: FsCompany[];
  users: FsUser[];
  groups: FsGroup[];
  tickets: FsTicket[];
  assets: FsAsset[];
  solutions: FsSolutionCategory[];
  // Counters for the UI
  stats: {
    companies: number;
    users: number;
    agents: number;
    contacts: number;
    groups: number;
    tickets: number;
    notes: number;
    assets: number;
    solutionCategories: number;
    solutionArticles: number;
  };
}
