export type TicketStatus =
  | "new"
  | "open"
  | "in_progress"
  | "on_site"
  | "pending"
  | "waiting_client"
  | "waiting_vendor"
  | "scheduled"
  | "resolved"
  | "closed"
  | "cancelled";

export type TicketPriority = "critical" | "high" | "medium" | "low";
export type TicketUrgency = "critical" | "high" | "medium" | "low";
export type TicketImpact = "critical" | "high" | "medium" | "low";
export type TicketType = "incident" | "service_request" | "problem" | "change" | "alert";
export type TicketSource = "portal" | "email" | "phone" | "chat" | "api" | "monitoring" | "automation";

export interface TicketComment {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketActivity {
  id: string;
  type: "comment" | "status_change" | "assignment" | "priority_change" | "created";
  authorName: string;
  content: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  urgency: TicketUrgency;
  impact: TicketImpact;
  type: TicketType;
  source: TicketSource;
  organizationName: string;
  requesterName: string;
  requesterEmail: string;
  assigneeId?: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  creatorId?: string;
  categoryName: string;
  subcategoryName?: string;
  itemCategoryName?: string;
  queueName: string;
  // Niveau de support — pour les clients en facturation "à la carte"
  // (ex: Niveau 1, Niveau 2, Niveau 3, Senior). Affecte le taux horaire.
  supportTier?: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  isOverdue: boolean;
  slaBreached: boolean;
  tags: string[];
  comments: TicketComment[];
  activities: TicketActivity[];
  projectId?: string;
  // Approvals — when set, the ticket needs client-side approval before
  // the MSP team can start working on it
  approvers?: TicketApprover[];
  approvalStatus?: "not_required" | "pending" | "approved" | "rejected";
}

export interface TicketApprover {
  id: string;
  contactId: string;
  name: string;
  email: string;
  role: "primary" | "secondary";
  status: "pending" | "approved" | "rejected";
  decidedAt?: string;
  comment?: string;
}

export const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; color: string; bgClass: string; textClass: string; dotClass: string }
> = {
  new: {
    label: "Nouveau",
    color: "#2563EB",
    bgClass: "bg-blue-100",
    textClass: "text-blue-700",
    dotClass: "bg-blue-500",
  },
  open: {
    label: "Ouvert",
    color: "#0EA5E9",
    bgClass: "bg-sky-100",
    textClass: "text-sky-700",
    dotClass: "bg-sky-500",
  },
  in_progress: {
    label: "En cours",
    color: "#F59E0B",
    bgClass: "bg-amber-100",
    textClass: "text-amber-700",
    dotClass: "bg-amber-500",
  },
  waiting_client: {
    label: "En attente client",
    color: "#8B5CF6",
    bgClass: "bg-purple-100",
    textClass: "text-purple-700",
    dotClass: "bg-purple-500",
  },
  on_site: {
    label: "Sur place",
    color: "#06B6D4",
    bgClass: "bg-cyan-100",
    textClass: "text-cyan-700",
    dotClass: "bg-cyan-500",
  },
  pending: {
    label: "En attente",
    color: "#A855F7",
    bgClass: "bg-violet-100",
    textClass: "text-violet-700",
    dotClass: "bg-violet-500",
  },
  waiting_vendor: {
    label: "Attente fournisseur",
    color: "#EC4899",
    bgClass: "bg-pink-100",
    textClass: "text-pink-700",
    dotClass: "bg-pink-500",
  },
  scheduled: {
    label: "Planifié",
    color: "#14B8A6",
    bgClass: "bg-teal-100",
    textClass: "text-teal-700",
    dotClass: "bg-teal-500",
  },
  resolved: {
    label: "Résolu",
    color: "#10B981",
    bgClass: "bg-emerald-100",
    textClass: "text-emerald-700",
    dotClass: "bg-emerald-500",
  },
  closed: {
    label: "Fermé",
    color: "#6B7280",
    bgClass: "bg-gray-100",
    textClass: "text-gray-700",
    dotClass: "bg-gray-500",
  },
  cancelled: {
    label: "Annulé",
    color: "#9CA3AF",
    bgClass: "bg-gray-100",
    textClass: "text-gray-500",
    dotClass: "bg-gray-400",
  },
};

export const PRIORITY_CONFIG: Record<
  TicketPriority,
  { label: string; color: string; bgClass: string; textClass: string; dotClass: string; borderClass: string }
> = {
  critical: {
    label: "Critique",
    color: "#EF4444",
    bgClass: "bg-red-100",
    textClass: "text-red-700",
    dotClass: "bg-red-500",
    borderClass: "border-l-red-500",
  },
  high: {
    label: "Élevée",
    color: "#F97316",
    bgClass: "bg-orange-100",
    textClass: "text-orange-700",
    dotClass: "bg-orange-500",
    borderClass: "border-l-orange-500",
  },
  medium: {
    label: "Moyenne",
    color: "#EAB308",
    bgClass: "bg-yellow-100",
    textClass: "text-yellow-700",
    dotClass: "bg-yellow-500",
    borderClass: "border-l-yellow-500",
  },
  low: {
    label: "Faible",
    color: "#22C55E",
    bgClass: "bg-green-100",
    textClass: "text-green-700",
    dotClass: "bg-green-500",
    borderClass: "border-l-green-500",
  },
};

export const TYPE_CONFIG: Record<
  TicketType,
  { label: string; color: string; bgClass: string; textClass: string }
> = {
  incident: {
    label: "Incident",
    color: "#EF4444",
    bgClass: "bg-red-100",
    textClass: "text-red-700",
  },
  service_request: {
    label: "Demande de service",
    color: "#3B82F6",
    bgClass: "bg-blue-100",
    textClass: "text-blue-700",
  },
  problem: {
    label: "Problème",
    color: "#F59E0B",
    bgClass: "bg-amber-100",
    textClass: "text-amber-700",
  },
  change: {
    label: "Changement",
    color: "#8B5CF6",
    bgClass: "bg-purple-100",
    textClass: "text-purple-700",
  },
  alert: {
    label: "Alerte",
    color: "#F97316",
    bgClass: "bg-orange-100",
    textClass: "text-orange-700",
  },
};

export const KANBAN_COLUMNS: TicketStatus[] = [
  "new",
  "open",
  "in_progress",
  "on_site",
  "pending",
  "waiting_client",
  "waiting_vendor",
  "scheduled",
  "resolved",
];

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function hoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const mockTickets: Ticket[] = [
  {
    id: "t-001",
    number: "INC-1042",
    subject: "Unable to connect to VPN from home office",
    description:
      "Since this morning I am unable to establish a VPN connection from my home office. The client shows 'Connection timed out' after about 30 seconds. I have tried restarting the client and my router. This is blocking all my remote work.",
    status: "in_progress",
    priority: "high",
    urgency: "high",
    impact: "high",
    type: "incident",
    source: "portal",
    organizationName: "Acme Corp",
    requesterName: "Sarah Mitchell",
    requesterEmail: "s.mitchell@acmecorp.com",
    assigneeName: "Jean-Philippe Côté",
    assigneeAvatar: null,
    categoryName: "Network",
    queueName: "Infrastructure",
    createdAt: hoursAgo(4),
    updatedAt: hoursAgo(1),
    dueAt: hoursAgo(-2),
    isOverdue: false,
    slaBreached: false,
    projectId: "prj_001",
    tags: ["vpn", "remote-access"],
    comments: [
      {
        id: "c-001",
        authorName: "Sarah Mitchell",
        content: "I also noticed the issue happens on both WiFi and wired connections.",
        isInternal: false,
        createdAt: hoursAgo(3),
      },
      {
        id: "c-002",
        authorName: "Jean-Philippe Côté",
        content: "Checking the VPN gateway logs now. Looks like the certificate might have expired.",
        isInternal: true,
        createdAt: hoursAgo(2),
      },
    ],
    activities: [
      {
        id: "a-001",
        type: "created",
        authorName: "Sarah Mitchell",
        content: "Ticket created via portal",
        createdAt: hoursAgo(4),
      },
      {
        id: "a-002",
        type: "assignment",
        authorName: "System",
        content: "Auto-assigned based on queue rules",
        newValue: "Jean-Philippe Côté",
        createdAt: hoursAgo(4),
      },
      {
        id: "a-003",
        type: "status_change",
        authorName: "Jean-Philippe Côté",
        content: "Changed status",
        oldValue: "new",
        newValue: "in_progress",
        createdAt: hoursAgo(3),
      },
    ],
  },
  {
    id: "t-002",
    number: "INC-1041",
    subject: "Printer on 3rd floor not printing - paper jam error",
    description:
      "The HP LaserJet on the 3rd floor near the kitchen area is showing a paper jam error but there is no paper stuck. We have tried turning it off and on. Multiple people are affected.",
    status: "open",
    priority: "medium",
    urgency: "medium",
    impact: "medium",
    type: "incident",
    source: "phone",
    organizationName: "Global Finance",
    requesterName: "David Chen",
    requesterEmail: "d.chen@globalfinance.com",
    assigneeName: "Marie Tremblay",
    assigneeAvatar: null,
    categoryName: "Hardware",
    queueName: "On-site Support",
    createdAt: hoursAgo(6),
    updatedAt: hoursAgo(5),
    dueAt: daysFromNow(1),
    isOverdue: false,
    slaBreached: false,
    projectId: "prj_001",
    tags: ["printer", "hardware"],
    comments: [],
    activities: [
      {
        id: "a-010",
        type: "created",
        authorName: "Marie Tremblay",
        content: "Ticket created via phone call",
        createdAt: hoursAgo(6),
      },
    ],
  },
  {
    id: "t-003",
    number: "INC-1040",
    subject: "Email not syncing on mobile device",
    description:
      "My Outlook app on iPhone stopped syncing emails 2 days ago. I can still access email on my laptop. I have tried removing and re-adding the account.",
    status: "waiting_client",
    priority: "low",
    urgency: "low",
    impact: "low",
    type: "incident",
    source: "email",
    organizationName: "TechStart Inc",
    requesterName: "Emily Watson",
    requesterEmail: "e.watson@techstart.io",
    assigneeName: "Alexandre Dubois",
    assigneeAvatar: null,
    categoryName: "Email & Collaboration",
    queueName: "Helpdesk",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    dueAt: daysFromNow(2),
    isOverdue: false,
    slaBreached: false,
    tags: ["email", "mobile"],
    comments: [
      {
        id: "c-010",
        authorName: "Alexandre Dubois",
        content:
          "Hi Emily, could you please confirm your iOS version and if you have recently changed your password?",
        isInternal: false,
        createdAt: daysAgo(1),
      },
    ],
    activities: [
      {
        id: "a-020",
        type: "created",
        authorName: "Emily Watson",
        content: "Ticket created via email",
        createdAt: daysAgo(2),
      },
      {
        id: "a-021",
        type: "status_change",
        authorName: "Alexandre Dubois",
        content: "Changed status",
        oldValue: "open",
        newValue: "waiting_client",
        createdAt: daysAgo(1),
      },
    ],
  },
  {
    id: "t-004",
    number: "INC-1039",
    subject: "Critical: Production server high CPU alert",
    description:
      "Monitoring detected CPU usage above 95% on PROD-WEB-01 for the last 15 minutes. Response times are degrading. Immediate attention required.",
    status: "on_site",
    priority: "critical",
    urgency: "critical",
    impact: "critical",
    type: "incident",
    source: "monitoring",
    organizationName: "Cetix",
    requesterName: "Monitoring System",
    requesterEmail: "alerts@cetix.ca",
    assigneeName: "Jean-Philippe Côté",
    assigneeAvatar: null,
    categoryName: "Server",
    queueName: "Infrastructure",
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(0.5),
    dueAt: hoursAgo(-1),
    isOverdue: false,
    slaBreached: false,
    projectId: "prj_001",
    tags: ["monitoring", "server", "critical"],
    comments: [
      {
        id: "c-020",
        authorName: "Jean-Philippe Côté",
        content:
          "Identified a runaway process. Appears to be the nightly backup job running during business hours due to a cron misconfiguration.",
        isInternal: true,
        createdAt: hoursAgo(0.5),
      },
    ],
    activities: [
      {
        id: "a-030",
        type: "created",
        authorName: "Monitoring System",
        content: "Auto-created from monitoring alert",
        createdAt: hoursAgo(1),
      },
      {
        id: "a-031",
        type: "assignment",
        authorName: "System",
        content: "Critical priority auto-assigned to senior tech",
        newValue: "Jean-Philippe Côté",
        createdAt: hoursAgo(1),
      },
      {
        id: "a-032",
        type: "status_change",
        authorName: "Jean-Philippe Côté",
        content: "Changed status",
        oldValue: "new",
        newValue: "in_progress",
        createdAt: hoursAgo(0.75),
      },
    ],
  },
  {
    id: "t-005",
    number: "REQ-0287",
    subject: "New user account setup - Jennifer Park",
    description:
      "Please set up a new user account for Jennifer Park who is starting on Monday. She will need access to: Email, SharePoint, Teams, and the CRM system. Department: Sales.",
    status: "new",
    priority: "medium",
    urgency: "medium",
    impact: "low",
    type: "service_request",
    source: "portal",
    organizationName: "Acme Corp",
    requesterName: "Robert Kim",
    requesterEmail: "r.kim@acmecorp.com",
    assigneeName: null,
    assigneeAvatar: null,
    categoryName: "User Management",
    queueName: "Helpdesk",
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    dueAt: daysFromNow(3),
    isOverdue: false,
    slaBreached: false,
    tags: ["onboarding", "new-user"],
    comments: [],
    activities: [
      {
        id: "a-040",
        type: "created",
        authorName: "Robert Kim",
        content: "Ticket created via portal",
        createdAt: hoursAgo(2),
      },
    ],
  },
  {
    id: "t-006",
    number: "INC-1038",
    subject: "Slow internet speed across entire office",
    description:
      "Multiple users reporting very slow internet speeds since this morning. Speed tests showing 5 Mbps instead of the usual 200 Mbps. Affecting all departments on all floors.",
    status: "in_progress",
    priority: "high",
    urgency: "high",
    impact: "critical",
    type: "incident",
    source: "phone",
    organizationName: "Global Finance",
    requesterName: "Lisa Thompson",
    requesterEmail: "l.thompson@globalfinance.com",
    assigneeName: "Jean-Philippe Côté",
    assigneeAvatar: null,
    categoryName: "Network",
    queueName: "Infrastructure",
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(1),
    dueAt: hoursAgo(1),
    isOverdue: true,
    slaBreached: true,
    projectId: "prj_001",
    tags: ["network", "performance"],
    comments: [],
    activities: [
      {
        id: "a-050",
        type: "created",
        authorName: "Marie Tremblay",
        content: "Ticket created from phone call",
        createdAt: hoursAgo(3),
      },
      {
        id: "a-051",
        type: "assignment",
        authorName: "Marie Tremblay",
        content: "Escalated to infrastructure team",
        newValue: "Jean-Philippe Côté",
        createdAt: hoursAgo(3),
      },
    ],
  },
  {
    id: "t-007",
    number: "REQ-0286",
    subject: "Software installation request - Adobe Creative Suite",
    description:
      "I need Adobe Creative Suite installed on my workstation (WS-MKT-012) for the upcoming marketing campaign project. Manager has approved the license.",
    status: "new",
    priority: "low",
    urgency: "low",
    impact: "low",
    type: "service_request",
    source: "portal",
    organizationName: "TechStart Inc",
    requesterName: "Mike Johnson",
    requesterEmail: "m.johnson@techstart.io",
    assigneeName: null,
    assigneeAvatar: null,
    categoryName: "Software",
    queueName: "Helpdesk",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    dueAt: daysFromNow(5),
    isOverdue: false,
    slaBreached: false,
    tags: ["software", "installation"],
    comments: [],
    activities: [
      {
        id: "a-060",
        type: "created",
        authorName: "Mike Johnson",
        content: "Ticket created via portal",
        createdAt: daysAgo(1),
      },
    ],
  },
  {
    id: "t-008",
    number: "INC-1037",
    subject: "Cannot access SharePoint site - permission denied",
    description:
      "Getting 'Access Denied' when trying to open the Finance team SharePoint site. I had access yesterday. No changes were made to my account as far as I know.",
    status: "resolved",
    priority: "medium",
    urgency: "medium",
    impact: "medium",
    type: "incident",
    source: "portal",
    organizationName: "Global Finance",
    requesterName: "Anna Williams",
    requesterEmail: "a.williams@globalfinance.com",
    assigneeName: "Alexandre Dubois",
    assigneeAvatar: null,
    categoryName: "Access Management",
    queueName: "Helpdesk",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    dueAt: daysAgo(1),
    isOverdue: false,
    slaBreached: false,
    tags: ["sharepoint", "permissions"],
    comments: [
      {
        id: "c-030",
        authorName: "Alexandre Dubois",
        content:
          "The SharePoint admin group was modified during maintenance. Re-added user to the Finance Members group. Access confirmed restored.",
        isInternal: false,
        createdAt: daysAgo(1),
      },
    ],
    activities: [
      {
        id: "a-070",
        type: "created",
        authorName: "Anna Williams",
        content: "Ticket created via portal",
        createdAt: daysAgo(3),
      },
      {
        id: "a-071",
        type: "status_change",
        authorName: "Alexandre Dubois",
        content: "Changed status",
        oldValue: "in_progress",
        newValue: "resolved",
        createdAt: daysAgo(1),
      },
    ],
  },
  {
    id: "t-009",
    number: "INC-1036",
    subject: "Laptop blue screen on startup - CRITICAL_PROCESS_DIED",
    description:
      "My Dell Latitude keeps crashing with a blue screen error CRITICAL_PROCESS_DIED. It happened 3 times today. I have important client meetings this week and need this fixed ASAP.",
    status: "open",
    priority: "high",
    urgency: "high",
    impact: "medium",
    type: "incident",
    source: "phone",
    organizationName: "HealthCare Plus",
    requesterName: "Dr. James Morrison",
    requesterEmail: "j.morrison@healthcareplus.com",
    assigneeName: "Marie Tremblay",
    assigneeAvatar: null,
    categoryName: "Hardware",
    queueName: "On-site Support",
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(8),
    dueAt: hoursAgo(4),
    isOverdue: true,
    slaBreached: true,
    projectId: "prj_002",
    tags: ["laptop", "bsod", "hardware"],
    comments: [],
    activities: [
      {
        id: "a-080",
        type: "created",
        authorName: "Marie Tremblay",
        content: "Ticket created from phone call",
        createdAt: daysAgo(1),
      },
    ],
  },
  {
    id: "t-010",
    number: "REQ-0285",
    subject: "Request for additional monitor - dual screen setup",
    description:
      "Requesting a second monitor for my desk to improve productivity. I work with multiple applications simultaneously. Budget approval from department head attached.",
    status: "waiting_client",
    priority: "low",
    urgency: "low",
    impact: "low",
    type: "service_request",
    source: "portal",
    organizationName: "Acme Corp",
    requesterName: "Karen Lee",
    requesterEmail: "k.lee@acmecorp.com",
    assigneeName: "Marie Tremblay",
    assigneeAvatar: null,
    categoryName: "Hardware",
    queueName: "Procurement",
    createdAt: daysAgo(5),
    updatedAt: daysAgo(3),
    dueAt: daysFromNow(7),
    isOverdue: false,
    slaBreached: false,
    tags: ["hardware", "procurement"],
    comments: [
      {
        id: "c-040",
        authorName: "Marie Tremblay",
        content: "Could you confirm the preferred monitor size? We have 24\" and 27\" available.",
        isInternal: false,
        createdAt: daysAgo(3),
      },
    ],
    activities: [
      {
        id: "a-090",
        type: "created",
        authorName: "Karen Lee",
        content: "Ticket created via portal",
        createdAt: daysAgo(5),
      },
      {
        id: "a-091",
        type: "status_change",
        authorName: "Marie Tremblay",
        content: "Changed status",
        oldValue: "open",
        newValue: "waiting_client",
        createdAt: daysAgo(3),
      },
    ],
  },
  {
    id: "t-011",
    number: "INC-1035",
    subject: "MFA not working - cannot log into Microsoft 365",
    description:
      "Multi-factor authentication on my phone keeps saying 'Denied'. I changed phones last week and the authenticator app was transferred but it does not work anymore.",
    status: "new",
    priority: "high",
    urgency: "high",
    impact: "medium",
    type: "incident",
    source: "portal",
    organizationName: "HealthCare Plus",
    requesterName: "Nancy Adams",
    requesterEmail: "n.adams@healthcareplus.com",
    assigneeName: null,
    assigneeAvatar: null,
    categoryName: "Access Management",
    queueName: "Helpdesk",
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    dueAt: hoursAgo(-3),
    isOverdue: false,
    slaBreached: false,
    projectId: "prj_001",
    tags: ["mfa", "microsoft365", "authentication"],
    comments: [],
    activities: [
      {
        id: "a-100",
        type: "created",
        authorName: "Nancy Adams",
        content: "Ticket created via portal",
        createdAt: hoursAgo(1),
      },
    ],
  },
  {
    id: "t-012",
    number: "INC-1034",
    subject: "Teams calls dropping after 10 minutes",
    description:
      "For the past 3 days, all my Microsoft Teams calls disconnect after approximately 10 minutes. Both audio and video calls are affected. Other participants stay connected.",
    status: "on_site",
    priority: "medium",
    urgency: "medium",
    impact: "medium",
    type: "incident",
    source: "portal",
    organizationName: "TechStart Inc",
    requesterName: "Tom Bradley",
    requesterEmail: "t.bradley@techstart.io",
    assigneeName: "Alexandre Dubois",
    assigneeAvatar: null,
    categoryName: "Email & Collaboration",
    queueName: "Helpdesk",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    dueAt: daysAgo(0),
    isOverdue: false,
    slaBreached: false,
    tags: ["teams", "voip"],
    comments: [
      {
        id: "c-050",
        authorName: "Alexandre Dubois",
        content:
          "Running network diagnostics on the client machine. Suspecting QoS configuration issue on the local network.",
        isInternal: true,
        createdAt: daysAgo(1),
      },
    ],
    activities: [
      {
        id: "a-110",
        type: "created",
        authorName: "Tom Bradley",
        content: "Ticket created via portal",
        createdAt: daysAgo(3),
      },
      {
        id: "a-111",
        type: "status_change",
        authorName: "Alexandre Dubois",
        content: "Changed status",
        oldValue: "open",
        newValue: "in_progress",
        createdAt: daysAgo(2),
      },
    ],
  },
  {
    id: "t-013",
    number: "INC-1033",
    subject: "Backup job failed on file server FS-01",
    description:
      "The nightly backup job for FS-01 has failed for 2 consecutive nights. Error: 'Insufficient disk space on backup target'. The backup NAS might need cleanup.",
    status: "open",
    priority: "high",
    urgency: "medium",
    impact: "high",
    type: "incident",
    source: "monitoring",
    organizationName: "Cetix",
    requesterName: "Monitoring System",
    requesterEmail: "alerts@cetix.ca",
    assigneeName: "Jean-Philippe Côté",
    assigneeAvatar: null,
    categoryName: "Backup & Recovery",
    queueName: "Infrastructure",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    dueAt: daysAgo(0),
    isOverdue: false,
    slaBreached: false,
    projectId: "prj_002",
    tags: ["backup", "storage"],
    comments: [],
    activities: [
      {
        id: "a-120",
        type: "created",
        authorName: "Monitoring System",
        content: "Auto-created from monitoring alert",
        createdAt: daysAgo(2),
      },
    ],
  },
  {
    id: "t-014",
    number: "REQ-0284",
    subject: "VPN access request for new remote employee",
    description:
      "Please configure VPN access for our new remote employee Patricia Lang (p.lang@acmecorp.com). She needs full network access including file shares and internal applications.",
    status: "new",
    priority: "medium",
    urgency: "medium",
    impact: "low",
    type: "service_request",
    source: "email",
    organizationName: "Acme Corp",
    requesterName: "Robert Kim",
    requesterEmail: "r.kim@acmecorp.com",
    assigneeName: null,
    assigneeAvatar: null,
    categoryName: "Network",
    queueName: "Infrastructure",
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
    dueAt: daysFromNow(2),
    isOverdue: false,
    slaBreached: false,
    tags: ["vpn", "onboarding", "remote"],
    comments: [],
    activities: [
      {
        id: "a-130",
        type: "created",
        authorName: "Robert Kim",
        content: "Ticket created via email",
        createdAt: hoursAgo(5),
      },
    ],
  },
  {
    id: "t-015",
    number: "INC-1032",
    subject: "Outlook freezes when opening attachments",
    description:
      "Outlook 365 desktop client freezes for 30-60 seconds whenever I try to open a PDF attachment. This started after the latest Windows update. Restarting Outlook does not help.",
    status: "resolved",
    priority: "low",
    urgency: "low",
    impact: "low",
    type: "incident",
    source: "portal",
    organizationName: "HealthCare Plus",
    requesterName: "Sandra Brooks",
    requesterEmail: "s.brooks@healthcareplus.com",
    assigneeName: "Marie Tremblay",
    assigneeAvatar: null,
    categoryName: "Software",
    queueName: "Helpdesk",
    createdAt: daysAgo(4),
    updatedAt: daysAgo(2),
    dueAt: daysAgo(2),
    isOverdue: false,
    slaBreached: false,
    tags: ["outlook", "performance"],
    comments: [
      {
        id: "c-060",
        authorName: "Marie Tremblay",
        content:
          "Cleared the Outlook cache and repaired the Office installation. Issue was caused by a corrupted temp file from the Windows update.",
        isInternal: false,
        createdAt: daysAgo(2),
      },
    ],
    activities: [
      {
        id: "a-140",
        type: "created",
        authorName: "Sandra Brooks",
        content: "Ticket created via portal",
        createdAt: daysAgo(4),
      },
      {
        id: "a-141",
        type: "status_change",
        authorName: "Marie Tremblay",
        content: "Changed status",
        oldValue: "in_progress",
        newValue: "resolved",
        createdAt: daysAgo(2),
      },
    ],
  },
  {
    id: "t-016",
    number: "CHG-0051",
    subject: "Firewall rule update for new SaaS application",
    description:
      "Need to add firewall rules to allow outbound traffic to the new CRM SaaS platform (app.newcrm.io) on ports 443 and 8443. Change window: Saturday 2 AM - 4 AM.",
    status: "new",
    priority: "medium",
    urgency: "low",
    impact: "medium",
    type: "change",
    source: "portal",
    organizationName: "Global Finance",
    requesterName: "David Chen",
    requesterEmail: "d.chen@globalfinance.com",
    assigneeName: null,
    assigneeAvatar: null,
    categoryName: "Network",
    queueName: "Infrastructure",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    dueAt: daysFromNow(4),
    isOverdue: false,
    slaBreached: false,
    tags: ["firewall", "change-management"],
    comments: [],
    activities: [
      {
        id: "a-150",
        type: "created",
        authorName: "David Chen",
        content: "Ticket created via portal",
        createdAt: daysAgo(1),
      },
    ],
  },
  {
    id: "t-017",
    number: "INC-1031",
    subject: "WiFi disconnecting randomly in meeting rooms",
    description:
      "The WiFi in meeting rooms B and C keeps disconnecting during video calls. It happens multiple times per hour. The issue started after last weekend.",
    status: "open",
    priority: "medium",
    urgency: "medium",
    impact: "high",
    type: "incident",
    source: "portal",
    organizationName: "Acme Corp",
    requesterName: "Sarah Mitchell",
    requesterEmail: "s.mitchell@acmecorp.com",
    assigneeName: "Alexandre Dubois",
    assigneeAvatar: null,
    categoryName: "Network",
    queueName: "Infrastructure",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    dueAt: daysFromNow(1),
    isOverdue: false,
    slaBreached: false,
    projectId: "prj_002",
    tags: ["wifi", "meeting-rooms"],
    comments: [],
    activities: [
      {
        id: "a-160",
        type: "created",
        authorName: "Sarah Mitchell",
        content: "Ticket created via portal",
        createdAt: daysAgo(2),
      },
    ],
  },
];
