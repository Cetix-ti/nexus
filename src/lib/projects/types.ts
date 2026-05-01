// ============================================================================
// NEXUS PROJECTS DOMAIN — Types
// MSP-grade project management with client portal visibility
// ============================================================================

export type ProjectStatus =
  | "draft"           // Brouillon
  | "planning"        // Planification
  | "active"          // En cours
  | "on_hold"         // En pause
  | "at_risk"         // À risque
  | "completed"       // Terminé
  | "cancelled"       // Annulé
  | "archived";       // Archivé

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Brouillon",
  planning: "Planification",
  active: "En cours",
  on_hold: "En pause",
  at_risk: "À risque",
  completed: "Terminé",
  cancelled: "Annulé",
  archived: "Archivé",
};

export const PROJECT_STATUS_COLORS: Record<
  ProjectStatus,
  { bg: string; text: string; ring: string; dot: string }
> = {
  draft: { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-200", dot: "bg-slate-400" },
  planning: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", dot: "bg-violet-500" },
  active: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", dot: "bg-blue-500" },
  on_hold: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", dot: "bg-amber-500" },
  at_risk: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200", dot: "bg-red-500" },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  cancelled: { bg: "bg-slate-50", text: "text-slate-500", ring: "ring-slate-200", dot: "bg-slate-300" },
  archived: { bg: "bg-slate-50", text: "text-slate-500", ring: "ring-slate-200", dot: "bg-slate-300" },
};

export type ProjectPriority = "critical" | "high" | "medium" | "low";

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  critical: "Critique",
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
};

export type ProjectType =
  | "implementation"     // Implémentation
  | "migration"          // Migration
  | "deployment"         // Déploiement
  | "upgrade"            // Mise à jour
  | "audit"              // Audit
  | "consulting"         // Consultation
  | "development"        // Développement
  | "maintenance"        // Maintenance
  | "infrastructure"     // Infrastructure
  | "other";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  implementation: "Implémentation",
  migration: "Migration",
  deployment: "Déploiement",
  upgrade: "Mise à jour",
  audit: "Audit",
  consulting: "Consultation",
  development: "Développement",
  maintenance: "Maintenance",
  infrastructure: "Infrastructure",
  other: "Autre",
};

// ----------------------------------------------------------------------------
// PHASES
// ----------------------------------------------------------------------------
export type PhaseStatus = "not_started" | "in_progress" | "completed" | "blocked";

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  not_started: "Non démarrée",
  in_progress: "En cours",
  completed: "Terminée",
  blocked: "Bloquée",
};

export interface ProjectPhase {
  id: string;
  projectId: string;
  name: string;
  description: string;
  order: number;
  status: PhaseStatus;
  progressPercent: number;       // 0-100
  startDate?: string;
  endDate?: string;
  isVisibleToClient: boolean;
  taskIds: string[];
  milestoneIds: string[];
}

// ----------------------------------------------------------------------------
// MILESTONES
// ----------------------------------------------------------------------------
export type MilestoneStatus = "upcoming" | "approaching" | "achieved" | "missed";

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  upcoming: "À venir",
  approaching: "Bientôt",
  achieved: "Atteint",
  missed: "Manqué",
};

export interface ProjectMilestone {
  id: string;
  projectId: string;
  phaseId?: string;
  name: string;
  description: string;
  targetDate: string;
  achievedDate?: string;
  status: MilestoneStatus;
  isVisibleToClient: boolean;
  isCriticalPath: boolean;
}

// ----------------------------------------------------------------------------
// TASKS
// ----------------------------------------------------------------------------
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "completed"
  | "cancelled";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  in_review: "En revue",
  blocked: "Bloquée",
  completed: "Terminée",
  cancelled: "Annulée",
};

export const TASK_STATUS_COLORS: Record<
  TaskStatus,
  { bg: string; text: string; dot: string }
> = {
  todo: { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-400" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_review: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  blocked: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  cancelled: { bg: "bg-slate-50", text: "text-slate-400", dot: "bg-slate-300" },
};

export interface ProjectTask {
  id: string;
  projectId: string;
  phaseId?: string;
  parentTaskId?: string;        // for sub-tasks
  name: string;
  description: string;
  status: TaskStatus;
  priority: ProjectPriority;
  assigneeId?: string;
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  estimatedHours?: number;
  actualHours?: number;
  progressPercent: number;
  isVisibleToClient: boolean;
  dependsOn: string[];           // other task ids
  order: number;
}

// ----------------------------------------------------------------------------
// PROJECT VISIBILITY
// ----------------------------------------------------------------------------
export interface ProjectVisibilitySettings {
  showProject: boolean;          // Show project at all in client portal
  showPhases: boolean;
  showMilestones: boolean;
  showTasks: boolean;            // Only client-visible tasks
  showLinkedTickets: boolean;
  showTimeConsumed: boolean;
  showBudgetVsActual: boolean;
  showInternalNotes: boolean;
  showActivity: boolean;
  showTeamMembers: boolean;
}

export const DEFAULT_VISIBILITY: ProjectVisibilitySettings = {
  showProject: false,
  showPhases: true,
  showMilestones: true,
  showTasks: true,
  showLinkedTickets: true,
  showTimeConsumed: false,
  showBudgetVsActual: false,
  showInternalNotes: false,
  showActivity: true,
  showTeamMembers: true,
};

// ----------------------------------------------------------------------------
// PROJECT MEMBERS
// ----------------------------------------------------------------------------
export type ProjectRole =
  | "project_manager"   // Gestionnaire de projet
  | "lead"              // Responsable technique
  | "contributor"       // Contributeur
  | "reviewer"          // Réviseur
  | "observer";         // Observateur

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  project_manager: "Gestionnaire",
  lead: "Responsable",
  contributor: "Contributeur",
  reviewer: "Réviseur",
  observer: "Observateur",
};

export interface ProjectMember {
  id: string;
  projectId: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  role: ProjectRole;
  allocatedHoursPerWeek?: number;
}

// ----------------------------------------------------------------------------
// PROJECT ACTIVITY
// ----------------------------------------------------------------------------
export type ActivityType =
  | "created"
  | "status_change"
  | "phase_completed"
  | "milestone_achieved"
  | "task_completed"
  | "ticket_linked"
  | "member_added"
  | "comment"
  | "file_uploaded"
  | "budget_updated";

export interface ProjectActivity {
  id: string;
  projectId: string;
  type: ActivityType;
  authorName: string;
  content: string;
  metadata?: Record<string, string | number>;
  isVisibleToClient: boolean;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// PROJECT (main entity)
// ----------------------------------------------------------------------------
export interface Project {
  id: string;
  code: string;                  // PRJ-2025-001
  name: string;
  description: string;
  // Client
  organizationId: string;
  organizationName: string;
  organizationLogo?: string | null;
  // Classification
  type: ProjectType;
  status: ProjectStatus;
  priority: ProjectPriority;
  // Internal owner
  managerId: string;
  managerName: string;
  // Dates
  startDate: string;
  targetEndDate: string;
  actualEndDate?: string;
  // Progress
  progressPercent: number;       // 0-100
  // Budget
  budgetHours?: number;
  consumedHours: number;
  budgetAmount?: number;
  consumedAmount: number;
  // Visibility
  isVisibleToClient: boolean;
  /** Tout le temps saisi sur les tickets de ce projet est forcé "billable". */
  isFullyBillable?: boolean;
  visibilitySettings: ProjectVisibilitySettings;
  // Relations (denormalized counts for list view)
  phaseCount: number;
  milestoneCount: number;
  taskCount: number;
  completedTaskCount: number;
  linkedTicketCount: number;
  memberCount: number;
  // Tags
  tags: string[];
  // Risk
  isAtRisk: boolean;
  riskNotes?: string;
  // Soft delete
  isArchived: boolean;
  // Audit
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// CLIENT PORTAL PERMISSIONS
// ----------------------------------------------------------------------------

/**
 * Permissions accordées à un contact client pour accéder au portail
 */
export interface ClientPortalPermissions {
  contactId: string;
  organizationId: string;
  // Access
  canAccessPortal: boolean;
  // Tickets
  canSeeOwnTickets: boolean;
  canSeeAllOrganizationTickets: boolean;
  canCreateTickets: boolean;
  // Projects
  canSeeProjects: boolean;
  canSeeProjectDetails: boolean;
  canSeeProjectTasks: boolean;
  canSeeProjectLinkedTickets: boolean;
  // Reports
  canSeeReports: boolean;
  canSeeBillingReports: boolean;
  canSeeTimeReports: boolean;
  canSeeHourBankBalance: boolean;
  // Documents (future)
  canSeeDocuments: boolean;
  // Team
  canSeeTeamMembers: boolean;
  // Role
  portalRole: "viewer" | "manager" | "admin";
}

export const PORTAL_ROLE_LABELS: Record<
  ClientPortalPermissions["portalRole"],
  string
> = {
  viewer: "Lecture seule",
  manager: "Gestionnaire client",
  admin: "Administrateur client",
};

export const DEFAULT_VIEWER_PERMISSIONS: Omit<
  ClientPortalPermissions,
  "contactId" | "organizationId"
> = {
  canAccessPortal: true,
  canSeeOwnTickets: true,
  canSeeAllOrganizationTickets: false,
  canCreateTickets: true,
  canSeeProjects: false,
  canSeeProjectDetails: false,
  canSeeProjectTasks: false,
  canSeeProjectLinkedTickets: false,
  canSeeReports: false,
  canSeeBillingReports: false,
  canSeeTimeReports: false,
  canSeeHourBankBalance: false,
  canSeeDocuments: false,
  canSeeTeamMembers: false,
  portalRole: "viewer",
};

export const DEFAULT_MANAGER_PERMISSIONS: Omit<
  ClientPortalPermissions,
  "contactId" | "organizationId"
> = {
  canAccessPortal: true,
  canSeeOwnTickets: true,
  canSeeAllOrganizationTickets: true,
  canCreateTickets: true,
  canSeeProjects: true,
  canSeeProjectDetails: true,
  canSeeProjectTasks: true,
  canSeeProjectLinkedTickets: true,
  canSeeReports: true,
  canSeeBillingReports: false,
  canSeeTimeReports: true,
  canSeeHourBankBalance: true,
  canSeeDocuments: true,
  canSeeTeamMembers: true,
  portalRole: "manager",
};

export const DEFAULT_ADMIN_PERMISSIONS: Omit<
  ClientPortalPermissions,
  "contactId" | "organizationId"
> = {
  canAccessPortal: true,
  canSeeOwnTickets: true,
  canSeeAllOrganizationTickets: true,
  canCreateTickets: true,
  canSeeProjects: true,
  canSeeProjectDetails: true,
  canSeeProjectTasks: true,
  canSeeProjectLinkedTickets: true,
  canSeeReports: true,
  canSeeBillingReports: true,
  canSeeTimeReports: true,
  canSeeHourBankBalance: true,
  canSeeDocuments: true,
  canSeeTeamMembers: true,
  portalRole: "admin",
};
