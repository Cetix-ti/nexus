// Shared mock data for API routes
// Structured for easy migration to Prisma queries later

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "technician" | "agent" | "user";
  avatarUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  domain: string;
  ticketCount: number;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  description: string;
  status: "new" | "open" | "pending" | "resolved" | "closed";
  priority: "critical" | "high" | "medium" | "low";
  organizationId: string;
  organizationName: string;
  requesterId: string;
  requesterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  category: string;
  tags: string[];
  slaDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

// ---- Users ----

export const users: User[] = [
  { id: "usr_01", name: "Jean-Philippe Martin", email: "jp.martin@nexus.io", role: "admin" },
  { id: "usr_02", name: "Sophie Tremblay", email: "s.tremblay@nexus.io", role: "technician" },
  { id: "usr_03", name: "Marc-Antoine Dubois", email: "ma.dubois@nexus.io", role: "technician" },
  { id: "usr_04", name: "Camille Fournier", email: "c.fournier@nexus.io", role: "agent" },
  { id: "usr_05", name: "Nicolas Bergeron", email: "n.bergeron@nexus.io", role: "technician" },
  { id: "usr_06", name: "Isabelle Roy", email: "i.roy@nexus.io", role: "agent" },
  { id: "usr_07", name: "Pierre Lefebvre", email: "p.lefebvre@acme.com", role: "user" },
  { id: "usr_08", name: "Marie Gagnon", email: "m.gagnon@globex.com", role: "user" },
];

// ---- Organizations ----

export const organizations: Organization[] = [
  { id: "org_01", name: "Acme Corporation", domain: "acme.com", ticketCount: 42 },
  { id: "org_02", name: "Globex Industries", domain: "globex.com", ticketCount: 28 },
  { id: "org_03", name: "Initech Systems", domain: "initech.com", ticketCount: 19 },
  { id: "org_04", name: "Umbrella Corp", domain: "umbrella.co", ticketCount: 35 },
  { id: "org_05", name: "Wayne Enterprises", domain: "wayne.com", ticketCount: 15 },
  { id: "org_06", name: "Stark Industries", domain: "stark.io", ticketCount: 23 },
];

// ---- Helper: relative date ----

function daysAgo(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function hoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function futureHours(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

// ---- Tickets ----

export const tickets: Ticket[] = [
  {
    id: "tkt_01",
    number: 4521,
    subject: "VPN connection drops every 30 minutes",
    description: "Multiple users in the Montreal office are reporting that the VPN disconnects approximately every 30 minutes. This started after the last network maintenance window.",
    status: "open",
    priority: "high",
    organizationId: "org_01",
    organizationName: "Acme Corporation",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_02",
    assigneeName: "Sophie Tremblay",
    category: "Network",
    tags: ["vpn", "connectivity", "recurring"],
    slaDeadline: futureHours(4),
    createdAt: hoursAgo(6),
    updatedAt: hoursAgo(2),
    resolvedAt: null,
  },
  {
    id: "tkt_02",
    number: 4520,
    subject: "Unable to access SharePoint after password reset",
    description: "After resetting my password per the security policy, I am unable to log in to SharePoint. Other services work fine with the new password.",
    status: "pending",
    priority: "medium",
    organizationId: "org_02",
    organizationName: "Globex Industries",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: "usr_03",
    assigneeName: "Marc-Antoine Dubois",
    category: "Access Management",
    tags: ["sharepoint", "password", "access"],
    slaDeadline: futureHours(12),
    createdAt: hoursAgo(8),
    updatedAt: hoursAgo(3),
    resolvedAt: null,
  },
  {
    id: "tkt_03",
    number: 4519,
    subject: "Production database showing high CPU utilization",
    description: "The primary production database server is running at 95% CPU. Response times have degraded significantly. Immediate investigation required.",
    status: "open",
    priority: "critical",
    organizationId: "org_04",
    organizationName: "Umbrella Corp",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_01",
    assigneeName: "Jean-Philippe Martin",
    category: "Infrastructure",
    tags: ["database", "performance", "critical"],
    slaDeadline: futureHours(1),
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(1),
    resolvedAt: null,
  },
  {
    id: "tkt_04",
    number: 4518,
    subject: "Request for new developer laptop",
    description: "New hire starting next Monday needs a fully configured developer workstation with Docker, VS Code, and standard development tools.",
    status: "new",
    priority: "low",
    organizationId: "org_03",
    organizationName: "Initech Systems",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: null,
    assigneeName: null,
    category: "Hardware",
    tags: ["laptop", "onboarding", "procurement"],
    slaDeadline: futureHours(48),
    createdAt: hoursAgo(12),
    updatedAt: hoursAgo(12),
    resolvedAt: null,
  },
  {
    id: "tkt_05",
    number: 4517,
    subject: "Email delivery delays to external recipients",
    description: "Outbound emails to external domains are being delayed by 2-3 hours. Internal emails work normally. Affects the entire organization.",
    status: "open",
    priority: "high",
    organizationId: "org_01",
    organizationName: "Acme Corporation",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_05",
    assigneeName: "Nicolas Bergeron",
    category: "Email",
    tags: ["email", "delivery", "exchange"],
    slaDeadline: hoursAgo(1),
    createdAt: daysAgo(1, 2),
    updatedAt: hoursAgo(5),
    resolvedAt: null,
  },
  {
    id: "tkt_06",
    number: 4516,
    subject: "SSO integration failing for Salesforce",
    description: "SAML authentication to Salesforce is returning a 500 error. Users cannot access Salesforce through our SSO portal.",
    status: "open",
    priority: "high",
    organizationId: "org_06",
    organizationName: "Stark Industries",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: "usr_02",
    assigneeName: "Sophie Tremblay",
    category: "Authentication",
    tags: ["sso", "salesforce", "saml"],
    slaDeadline: futureHours(3),
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(1),
    resolvedAt: null,
  },
  {
    id: "tkt_07",
    number: 4515,
    subject: "Printer on 3rd floor not printing duplex",
    description: "The HP LaserJet on the 3rd floor has stopped printing double-sided. The duplex setting appears to be grayed out in the driver settings.",
    status: "resolved",
    priority: "low",
    organizationId: "org_02",
    organizationName: "Globex Industries",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_03",
    assigneeName: "Marc-Antoine Dubois",
    category: "Hardware",
    tags: ["printer", "driver"],
    slaDeadline: null,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    resolvedAt: daysAgo(1),
  },
  {
    id: "tkt_08",
    number: 4514,
    subject: "Upgrade monitoring dashboards to Grafana 11",
    description: "Current Grafana version (9.5) needs to be upgraded to version 11 for new alerting features and improved dashboard rendering.",
    status: "new",
    priority: "medium",
    organizationId: "org_04",
    organizationName: "Umbrella Corp",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: null,
    assigneeName: null,
    category: "Monitoring",
    tags: ["grafana", "upgrade", "monitoring"],
    slaDeadline: futureHours(72),
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    resolvedAt: null,
  },
  {
    id: "tkt_09",
    number: 4513,
    subject: "Implement automated backup verification",
    description: "We need to set up automated restore testing for our nightly backups. Currently backups are taken but never verified.",
    status: "pending",
    priority: "medium",
    organizationId: "org_05",
    organizationName: "Wayne Enterprises",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_05",
    assigneeName: "Nicolas Bergeron",
    category: "Infrastructure",
    tags: ["backup", "automation", "disaster-recovery"],
    slaDeadline: futureHours(96),
    createdAt: daysAgo(3),
    updatedAt: daysAgo(1),
    resolvedAt: null,
  },
  {
    id: "tkt_10",
    number: 4512,
    subject: "WiFi dead zone in conference room B",
    description: "Conference room B on the 2nd floor consistently has very poor WiFi signal. Video calls drop frequently during meetings.",
    status: "open",
    priority: "medium",
    organizationId: "org_03",
    organizationName: "Initech Systems",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: "usr_02",
    assigneeName: "Sophie Tremblay",
    category: "Network",
    tags: ["wifi", "coverage", "conference-room"],
    slaDeadline: futureHours(24),
    createdAt: daysAgo(2, 5),
    updatedAt: daysAgo(1),
    resolvedAt: null,
  },
  {
    id: "tkt_11",
    number: 4511,
    subject: "Azure AD sync not propagating group changes",
    description: "Group membership changes in Azure AD are not syncing to on-prem Active Directory. Delta sync runs without errors but changes are not reflected.",
    status: "open",
    priority: "high",
    organizationId: "org_06",
    organizationName: "Stark Industries",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_01",
    assigneeName: "Jean-Philippe Martin",
    category: "Identity",
    tags: ["azure-ad", "sync", "groups"],
    slaDeadline: futureHours(6),
    createdAt: daysAgo(1, 3),
    updatedAt: hoursAgo(4),
    resolvedAt: null,
  },
  {
    id: "tkt_12",
    number: 4510,
    subject: "Office 365 license reallocation needed",
    description: "We have 15 unused E3 licenses that should be downgraded to E1 for cost optimization. Finance has approved the change.",
    status: "new",
    priority: "low",
    organizationId: "org_01",
    organizationName: "Acme Corporation",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: null,
    assigneeName: null,
    category: "Licensing",
    tags: ["office365", "license", "cost-optimization"],
    slaDeadline: futureHours(120),
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    resolvedAt: null,
  },
  {
    id: "tkt_13",
    number: 4509,
    subject: "Security patch deployment for CVE-2026-1234",
    description: "Critical security vulnerability requires immediate patching of all Windows servers. CVE score: 9.8. Exploit is publicly available.",
    status: "open",
    priority: "critical",
    organizationId: "org_04",
    organizationName: "Umbrella Corp",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_05",
    assigneeName: "Nicolas Bergeron",
    category: "Security",
    tags: ["security", "patch", "critical-cve"],
    slaDeadline: hoursAgo(2),
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(3),
    resolvedAt: null,
  },
  {
    id: "tkt_14",
    number: 4508,
    subject: "New firewall rules for development environment",
    description: "Development team needs outbound access to npm registry and Docker Hub from the dev VLAN. Current rules are blocking package downloads.",
    status: "resolved",
    priority: "medium",
    organizationId: "org_05",
    organizationName: "Wayne Enterprises",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: "usr_03",
    assigneeName: "Marc-Antoine Dubois",
    category: "Network",
    tags: ["firewall", "development", "access"],
    slaDeadline: null,
    createdAt: daysAgo(4),
    updatedAt: daysAgo(2),
    resolvedAt: daysAgo(2),
  },
  {
    id: "tkt_15",
    number: 4507,
    subject: "Zoom Rooms setup for new boardroom",
    description: "The new boardroom on the 5th floor needs a complete Zoom Rooms setup including camera, microphone array, and dual displays.",
    status: "pending",
    priority: "low",
    organizationId: "org_02",
    organizationName: "Globex Industries",
    requesterId: "usr_07",
    requesterName: "Pierre Lefebvre",
    assigneeId: "usr_04",
    assigneeName: "Camille Fournier",
    category: "Hardware",
    tags: ["zoom", "conference", "setup"],
    slaDeadline: futureHours(168),
    createdAt: daysAgo(5),
    updatedAt: daysAgo(3),
    resolvedAt: null,
  },
  {
    id: "tkt_16",
    number: 4506,
    subject: "Automated onboarding workflow not triggering",
    description: "The automated onboarding workflow in ServiceNow is not triggering when new user accounts are created in HR system.",
    status: "closed",
    priority: "medium",
    organizationId: "org_03",
    organizationName: "Initech Systems",
    requesterId: "usr_08",
    requesterName: "Marie Gagnon",
    assigneeId: "usr_01",
    assigneeName: "Jean-Philippe Martin",
    category: "Automation",
    tags: ["onboarding", "workflow", "automation"],
    slaDeadline: null,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(5),
    resolvedAt: daysAgo(5),
  },
];

// ---- Comments ----

export const comments: Comment[] = [
  {
    id: "cmt_01",
    ticketId: "tkt_01",
    authorId: "usr_02",
    authorName: "Sophie Tremblay",
    content: "I've checked the VPN concentrator logs. Seeing timeout errors every 30 minutes which correlates with the DPD (Dead Peer Detection) interval. Adjusting the keepalive settings now.",
    isInternal: false,
    createdAt: hoursAgo(3),
  },
  {
    id: "cmt_02",
    ticketId: "tkt_01",
    authorId: "usr_01",
    authorName: "Jean-Philippe Martin",
    content: "Internal note: This might be related to the firmware update we pushed last week. Check if rolling back to previous version resolves it.",
    isInternal: true,
    createdAt: hoursAgo(2),
  },
  {
    id: "cmt_03",
    ticketId: "tkt_03",
    authorId: "usr_01",
    authorName: "Jean-Philippe Martin",
    content: "Identified the root cause: a runaway query from the reporting module. Killed the process and CPU is back to normal levels. Investigating the query optimization.",
    isInternal: false,
    createdAt: hoursAgo(1),
  },
  {
    id: "cmt_04",
    ticketId: "tkt_02",
    authorId: "usr_03",
    authorName: "Marc-Antoine Dubois",
    content: "SharePoint token cache needs to be cleared after password reset. I've sent instructions to the user and am waiting for confirmation.",
    isInternal: false,
    createdAt: hoursAgo(4),
  },
  {
    id: "cmt_05",
    ticketId: "tkt_05",
    authorId: "usr_05",
    authorName: "Nicolas Bergeron",
    content: "The mail queue is backed up with ~2000 messages. Investigating the transport rules - a new rule was added yesterday that may be causing the delay.",
    isInternal: false,
    createdAt: hoursAgo(5),
  },
];

// ---- Dashboard Stats ----

export function getDashboardStats() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const openTickets = tickets.filter((t) =>
    ["new", "open", "pending"].includes(t.status)
  ).length;

  const unassigned = tickets.filter(
    (t) => !t.assigneeId && !["resolved", "closed"].includes(t.status)
  ).length;

  const overdue = tickets.filter(
    (t) =>
      t.slaDeadline &&
      new Date(t.slaDeadline) < now &&
      !["resolved", "closed"].includes(t.status)
  ).length;

  const ticketsToday = tickets.filter(
    (t) => new Date(t.createdAt) >= todayStart
  ).length;

  const resolvedTickets = tickets.filter((t) => t.resolvedAt);
  const avgResolutionMs =
    resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => {
          const created = new Date(t.createdAt).getTime();
          const resolved = new Date(t.resolvedAt!).getTime();
          return sum + (resolved - created);
        }, 0) / resolvedTickets.length
      : 0;
  const avgResolutionHours = Math.round(avgResolutionMs / (1000 * 60 * 60));

  const totalActive = tickets.filter(
    (t) => !["closed"].includes(t.status)
  ).length;
  const withinSla = tickets.filter(
    (t) =>
      !["closed"].includes(t.status) &&
      (!t.slaDeadline || new Date(t.slaDeadline) >= now || ["resolved"].includes(t.status))
  ).length;
  const slaCompliance =
    totalActive > 0 ? Math.round((withinSla / totalActive) * 100) : 100;

  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const statusCounts = { new: 0, open: 0, pending: 0, resolved: 0, closed: 0 };
  tickets.forEach((t) => {
    priorityCounts[t.priority]++;
    statusCounts[t.status]++;
  });

  // Generate last 7 days volume
  const ticketVolume = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const dayStr = day.toLocaleDateString("en-US", { weekday: "short" });
    // Simulate realistic volume
    const base = [12, 18, 15, 22, 8, 14, 10];
    ticketVolume.push({ date: dayStr, tickets: base[6 - i] });
  }

  const ticketsByOrg = organizations.map((o) => ({
    name: o.name,
    tickets: tickets.filter((t) => t.organizationId === o.id).length,
  }));

  return {
    openTickets,
    unassigned,
    overdue,
    slaCompliance,
    avgResolutionTime: avgResolutionHours,
    ticketsToday,
    ticketsByPriority: [
      { name: "Critical", value: priorityCounts.critical, color: "#EF4444" },
      { name: "High", value: priorityCounts.high, color: "#F97316" },
      { name: "Medium", value: priorityCounts.medium, color: "#EAB308" },
      { name: "Low", value: priorityCounts.low, color: "#22C55E" },
    ],
    ticketsByStatus: statusCounts,
    ticketVolume,
    ticketsByOrg,
  };
}
