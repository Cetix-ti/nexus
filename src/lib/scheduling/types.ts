// ============================================================================
// NEXUS SCHEDULING DOMAIN — Types
// MSP-grade ticket scheduling: timeline, calendar, dispatch, technician planning
// ============================================================================

export type InterventionType =
  | "remote_intervention"   // Intervention à distance
  | "onsite_intervention"   // Intervention sur site
  | "phone_call"            // Appel téléphonique
  | "training"              // Formation
  | "meeting"               // Réunion
  | "maintenance"           // Maintenance planifiée
  | "deployment"            // Déploiement
  | "audit"                 // Audit
  | "follow_up"             // Suivi
  | "internal";             // Tâche interne

export const INTERVENTION_TYPE_LABELS: Record<InterventionType, string> = {
  remote_intervention: "Intervention à distance",
  onsite_intervention: "Intervention sur site",
  phone_call: "Appel téléphonique",
  training: "Formation",
  meeting: "Réunion",
  maintenance: "Maintenance planifiée",
  deployment: "Déploiement",
  audit: "Audit",
  follow_up: "Suivi",
  internal: "Tâche interne",
};

export const INTERVENTION_TYPE_COLORS: Record<
  InterventionType,
  { bg: string; text: string; ring: string; dot: string; border: string }
> = {
  remote_intervention: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200/70", dot: "bg-blue-500", border: "border-l-blue-500" },
  onsite_intervention: { bg: "bg-cyan-50", text: "text-cyan-700", ring: "ring-cyan-200/70", dot: "bg-cyan-500", border: "border-l-cyan-500" },
  phone_call: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200/70", dot: "bg-violet-500", border: "border-l-violet-500" },
  training: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200/70", dot: "bg-emerald-500", border: "border-l-emerald-500" },
  meeting: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", ring: "ring-fuchsia-200/70", dot: "bg-fuchsia-500", border: "border-l-fuchsia-500" },
  maintenance: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200/70", dot: "bg-amber-500", border: "border-l-amber-500" },
  deployment: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200/70", dot: "bg-indigo-500", border: "border-l-indigo-500" },
  audit: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200/70", dot: "bg-rose-500", border: "border-l-rose-500" },
  follow_up: { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-200/70", dot: "bg-slate-400", border: "border-l-slate-400" },
  internal: { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-200/70", dot: "bg-slate-400", border: "border-l-slate-400" },
};

export type InterventionStatus =
  | "draft"          // Brouillon
  | "scheduled"      // Planifiée
  | "confirmed"      // Confirmée par le client
  | "in_progress"    // En cours
  | "completed"      // Terminée
  | "cancelled"      // Annulée
  | "rescheduled"    // Reportée
  | "no_show";       // Client absent

export const INTERVENTION_STATUS_LABELS: Record<InterventionStatus, string> = {
  draft: "Brouillon",
  scheduled: "Planifiée",
  confirmed: "Confirmée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
  rescheduled: "Reportée",
  no_show: "Client absent",
};

/**
 * A scheduled intervention — links a ticket (or standalone) to a technician
 * at a specific time slot.
 */
export interface ScheduledIntervention {
  id: string;
  // Time
  startsAt: string;          // ISO datetime
  endsAt: string;            // ISO datetime
  durationMinutes: number;   // computed for convenience
  isAllDay: boolean;
  // What
  title: string;
  description?: string;
  type: InterventionType;
  status: InterventionStatus;
  // Linked ticket (optional — interventions can also be standalone)
  ticketId?: string;
  ticketNumber?: string;
  ticketSubject?: string;
  // Project link (optional)
  projectId?: string;
  projectName?: string;
  // Client
  organizationId: string;
  organizationName: string;
  siteId?: string;
  siteName?: string;
  siteAddress?: string;
  // Contact
  contactName?: string;
  contactPhone?: string;
  // Assigned technicians (can be multiple for big jobs)
  technicianIds: string[];
  technicianNames: string[];
  primaryTechnicianId?: string;
  // Scheduling details
  travelTimeMinutes?: number;     // additional travel time
  estimatedHours?: number;         // expected work hours
  // Recurrence (optional, RRULE-style)
  isRecurring: boolean;
  recurrenceRule?: string;         // e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR"
  parentInterventionId?: string;   // if this is a generated occurrence
  // Confirmation
  clientConfirmedAt?: string;
  clientNotes?: string;
  // Audit
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  // Visual
  color?: string;                  // optional override
}

/**
 * Technician availability window
 */
export interface TechnicianAvailability {
  technicianId: string;
  technicianName: string;
  date: string;                    // ISO date
  // Working hours
  workStartAt: string;             // ISO datetime
  workEndAt: string;
  // Time off / leaves
  isOnLeave: boolean;
  leaveReason?: "vacation" | "sick" | "training" | "other";
  // On-call?
  isOnCall: boolean;
  // Total scheduled minutes
  scheduledMinutes: number;
  // Total capacity in minutes (work hours - already scheduled)
  remainingMinutes: number;
}

/**
 * Technician basic info for the scheduler
 */
export interface SchedulerTechnician {
  id: string;
  name: string;
  email: string;
  role: string;
  skills: string[];
  color: string;       // gradient class for avatars/blocks
  isActive: boolean;
}

/**
 * Time slot for the calendar grid
 */
export interface TimeSlot {
  date: Date;
  hour: number;
  label: string;
}

export type SchedulerView = "day" | "week" | "month" | "timeline" | "list";

export const SCHEDULER_VIEW_LABELS: Record<SchedulerView, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
  timeline: "Chronologie",
  list: "Liste",
};
