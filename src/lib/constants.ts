// ============================================================================
// App Constants
// ============================================================================

export const APP_NAME = "Nexus";
export const ITEMS_PER_PAGE = 25;

// ============================================================================
// Role Hierarchy (lower number = higher privilege)
// ============================================================================

export type UserRole =
  | "SUPER_ADMIN"
  | "MSP_ADMIN"
  | "SUPERVISOR"
  | "TECHNICIAN"
  | "CLIENT_ADMIN"
  | "CLIENT_USER"
  | "READ_ONLY";

export const ROLES_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 0,
  MSP_ADMIN: 1,
  SUPERVISOR: 2,
  TECHNICIAN: 3,
  CLIENT_ADMIN: 4,
  CLIENT_USER: 5,
  READ_ONLY: 6,
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MSP_ADMIN: "MSP Admin",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Technician",
  CLIENT_ADMIN: "Client Admin",
  CLIENT_USER: "Client User",
  READ_ONLY: "Read Only",
};

// ============================================================================
// Ticket Status Configuration
// ============================================================================

export const TICKET_STATUS_CONFIG = {
  NEW: {
    label: "New",
    color: "#3B82F6", // blue-500
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
    icon: "CirclePlus",
  },
  OPEN: {
    label: "Open",
    color: "#8B5CF6", // violet-500
    bgColor: "bg-violet-100",
    textColor: "text-violet-700",
    icon: "CircleDot",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "#F59E0B", // amber-500
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
    icon: "Loader",
  },
  WAITING_CLIENT: {
    label: "Waiting on Client",
    color: "#EC4899", // pink-500
    bgColor: "bg-pink-100",
    textColor: "text-pink-700",
    icon: "Clock",
  },
  WAITING_VENDOR: {
    label: "Waiting on Vendor",
    color: "#F97316", // orange-500
    bgColor: "bg-orange-100",
    textColor: "text-orange-700",
    icon: "Clock",
  },
  SCHEDULED: {
    label: "Scheduled",
    color: "#06B6D4", // cyan-500
    bgColor: "bg-cyan-100",
    textColor: "text-cyan-700",
    icon: "CalendarClock",
  },
  RESOLVED: {
    label: "Resolved",
    color: "#10B981", // emerald-500
    bgColor: "bg-emerald-100",
    textColor: "text-emerald-700",
    icon: "CheckCircle2",
  },
  CLOSED: {
    label: "Closed",
    color: "#6B7280", // gray-500
    bgColor: "bg-gray-100",
    textColor: "text-gray-700",
    icon: "XCircle",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "#EF4444", // red-500
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    icon: "Ban",
  },
} as const;

// ============================================================================
// Ticket Priority Configuration
// ============================================================================

export const TICKET_PRIORITY_CONFIG = {
  CRITICAL: {
    label: "Critical",
    color: "#EF4444", // red-500
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    icon: "AlertTriangle",
    sortOrder: 0,
  },
  HIGH: {
    label: "High",
    color: "#F97316", // orange-500
    bgColor: "bg-orange-100",
    textColor: "text-orange-700",
    icon: "ArrowUp",
    sortOrder: 1,
  },
  MEDIUM: {
    label: "Medium",
    color: "#F59E0B", // amber-500
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
    icon: "Minus",
    sortOrder: 2,
  },
  LOW: {
    label: "Low",
    color: "#10B981", // emerald-500
    bgColor: "bg-emerald-100",
    textColor: "text-emerald-700",
    icon: "ArrowDown",
    sortOrder: 3,
  },
} as const;

// ============================================================================
// Ticket Type Configuration
// ============================================================================

export const TICKET_TYPE_CONFIG = {
  INCIDENT: {
    label: "Incident",
    color: "#EF4444",
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    icon: "Zap",
  },
  SERVICE_REQUEST: {
    label: "Service Request",
    color: "#3B82F6",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
    icon: "FileText",
  },
  PROBLEM: {
    label: "Problem",
    color: "#8B5CF6",
    bgColor: "bg-violet-100",
    textColor: "text-violet-700",
    icon: "AlertCircle",
  },
  CHANGE: {
    label: "Change",
    color: "#06B6D4",
    bgColor: "bg-cyan-100",
    textColor: "text-cyan-700",
    icon: "RefreshCw",
  },
  ALERT: {
    label: "Alert",
    color: "#F59E0B",
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
    icon: "Bell",
  },
} as const;

// ============================================================================
// Ticket Source Configuration
// ============================================================================

export const TICKET_SOURCE_CONFIG = {
  PORTAL: { label: "Portal", icon: "Globe" },
  EMAIL: { label: "Email", icon: "Mail" },
  PHONE: { label: "Phone", icon: "Phone" },
  CHAT: { label: "Chat", icon: "MessageSquare" },
  API: { label: "API", icon: "Code" },
  MONITORING: { label: "Monitoring", icon: "Activity" },
  AUTOMATION: { label: "Automation", icon: "Bot" },
} as const;
