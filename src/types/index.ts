// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

// ============================================================================
// Ticket Types
// ============================================================================

export interface TicketFilters {
  status?: string[];
  priority?: string[];
  type?: string[];
  assigneeId?: string;
  organizationId?: string;
  categoryId?: string;
  queueId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  isOverdue?: boolean;
  isEscalated?: boolean;
  slaBreached?: boolean;
}

export interface TicketSummary {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  type: string;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  requester?: { id: string; firstName: string; lastName: string } | null;
  organization: { id: string; name: string };
  category?: { id: string; name: string } | null;
  isOverdue: boolean;
  isEscalated: boolean;
  slaBreached: boolean;
  createdAt: string;
  updatedAt: string;
  dueAt?: string | null;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardStats {
  tickets: {
    total: number;
    open: number;
    inProgress: number;
    waitingClient: number;
    resolved: number;
    overdue: number;
    slaBreached: number;
    unassigned: number;
  };
  byPriority: { priority: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number }[];
  recentActivity: {
    id: string;
    action: string;
    ticketId: string;
    ticketNumber: number;
    ticketSubject: string;
    userName: string;
    createdAt: string;
  }[];
  trends: {
    date: string;
    created: number;
    resolved: number;
  }[];
}

// ============================================================================
// View Types
// ============================================================================

export type ViewMode = "list" | "kanban";

export interface SavedView {
  id: string;
  name: string;
  filters: TicketFilters;
  isDefault: boolean;
}

// ============================================================================
// Enum Constants (for client-side use without Prisma dependency)
// ============================================================================

export const TicketStatus = {
  NEW: "NEW",
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_CLIENT: "WAITING_CLIENT",
  WAITING_VENDOR: "WAITING_VENDOR",
  SCHEDULED: "SCHEDULED",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;

export type TicketStatusType = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TicketPriority = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type TicketPriorityType =
  (typeof TicketPriority)[keyof typeof TicketPriority];

export const TicketUrgency = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type TicketUrgencyType =
  (typeof TicketUrgency)[keyof typeof TicketUrgency];

export const TicketImpact = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type TicketImpactType =
  (typeof TicketImpact)[keyof typeof TicketImpact];

export const TicketType = {
  INCIDENT: "INCIDENT",
  SERVICE_REQUEST: "SERVICE_REQUEST",
  PROBLEM: "PROBLEM",
  CHANGE: "CHANGE",
  ALERT: "ALERT",
} as const;

export type TicketTypeType = (typeof TicketType)[keyof typeof TicketType];

export const TicketSource = {
  PORTAL: "PORTAL",
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  CHAT: "CHAT",
  API: "API",
  MONITORING: "MONITORING",
  AUTOMATION: "AUTOMATION",
} as const;

export type TicketSourceType =
  (typeof TicketSource)[keyof typeof TicketSource];

export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  MSP_ADMIN: "MSP_ADMIN",
  SUPERVISOR: "SUPERVISOR",
  TECHNICIAN: "TECHNICIAN",
  CLIENT_ADMIN: "CLIENT_ADMIN",
  CLIENT_USER: "CLIENT_USER",
  READ_ONLY: "READ_ONLY",
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];
