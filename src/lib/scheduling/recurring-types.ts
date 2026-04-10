// ============================================================================
// RECURRING TICKET TEMPLATES
// Configures tickets that should be auto-created on a recurring schedule.
// Stored as templates with an RRULE-like recurrence definition.
// ============================================================================

import type {
  TicketPriority,
  TicketUrgency,
  TicketImpact,
  TicketType,
  TicketSource,
} from "@/lib/mock-data";

export type RecurrenceFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "custom";

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> =
  {
    daily: "Quotidien",
    weekly: "Hebdomadaire",
    monthly: "Mensuel",
    yearly: "Annuel",
    custom: "Personnalisé",
  };

/**
 * Day of week — Monday = 1 ... Sunday = 7 (ISO).
 */
export type WeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAY_LABELS: Record<WeekDay, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mer",
  4: "Jeu",
  5: "Ven",
  6: "Sam",
  7: "Dim",
};

export const WEEKDAY_LONG: Record<WeekDay, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
  7: "Dimanche",
};

export type MonthlyPattern =
  | "day_of_month" // ex: le 15 de chaque mois
  | "first_weekday" // ex: 1er lundi du mois
  | "last_weekday" // ex: dernier vendredi du mois
  | "nth_weekday"; // ex: 2e mardi du mois

export const MONTHLY_PATTERN_LABELS: Record<MonthlyPattern, string> = {
  day_of_month: "Jour fixe du mois",
  first_weekday: "Premier jour spécifique",
  last_weekday: "Dernier jour spécifique",
  nth_weekday: "Nième jour spécifique",
};

/**
 * Schedule definition. Combine the fields based on `frequency`.
 */
export interface RecurrenceSchedule {
  frequency: RecurrenceFrequency;
  // Common
  interval: number; // ex: tous les 2 jours / 3 semaines / 6 mois
  startDate: string; // ISO datetime — first occurrence
  endDate?: string; // ISO datetime — stop after this date
  occurrenceCount?: number; // OR stop after N occurrences
  // Time of day for the auto-created ticket (HH:mm)
  timeOfDay: string;
  // Weekly
  daysOfWeek?: WeekDay[]; // ex: [1, 3, 5] for Mon/Wed/Fri
  // Monthly
  monthlyPattern?: MonthlyPattern;
  dayOfMonth?: number; // 1-31 (used with day_of_month)
  weekdayOrdinal?: number; // 1-5, -1=last (used with nth_weekday/last_weekday)
  weekdayInMonth?: WeekDay;
  // Yearly
  monthOfYear?: number; // 1-12
}

/**
 * The recurring ticket template defines what ticket gets created on each
 * occurrence. All fields below are copied verbatim into the new ticket.
 */
export interface RecurringTicketTemplate {
  id: string;
  name: string; // friendly name shown in the planner UI
  description?: string;
  // Owner
  organizationId: string;
  organizationName: string;
  createdBy: string;
  // Ticket payload
  ticketSubject: string;
  ticketDescription: string;
  ticketType: TicketType;
  ticketPriority: TicketPriority;
  ticketUrgency: TicketUrgency;
  ticketImpact: TicketImpact;
  ticketSource: TicketSource;
  defaultAssigneeId?: string;
  defaultAssigneeName?: string;
  defaultQueueId?: string;
  defaultQueueName?: string;
  defaultCategory?: string;
  defaultSubcategory?: string;
  defaultRequesterId?: string;
  defaultRequesterName?: string;
  defaultTags: string[];
  // Schedule
  schedule: RecurrenceSchedule;
  // State
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  totalRunsCount: number;
  // Audit
  createdAt: string;
  updatedAt: string;
}

/**
 * One recorded occurrence of a recurring template (history).
 */
export interface RecurringRun {
  id: string;
  templateId: string;
  templateName: string;
  scheduledFor: string;
  ranAt: string;
  status: "success" | "failed" | "skipped";
  createdTicketId?: string;
  createdTicketNumber?: string;
  errorMessage?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a human-friendly description of a schedule, in French.
 */
export function describeSchedule(s: RecurrenceSchedule): string {
  const time = s.timeOfDay || "08:00";
  const interval = s.interval || 1;

  switch (s.frequency) {
    case "daily":
      if (interval === 1) return `Tous les jours à ${time}`;
      return `Tous les ${interval} jours à ${time}`;
    case "weekly": {
      const days = (s.daysOfWeek || []).map((d) => WEEKDAY_LONG[d]);
      const dayList = days.length > 0 ? days.join(", ") : "—";
      if (interval === 1) return `Chaque semaine, ${dayList} à ${time}`;
      return `Toutes les ${interval} semaines, ${dayList} à ${time}`;
    }
    case "monthly": {
      if (s.monthlyPattern === "day_of_month") {
        const day = s.dayOfMonth || 1;
        if (interval === 1) return `Le ${day} de chaque mois à ${time}`;
        return `Le ${day} tous les ${interval} mois à ${time}`;
      }
      if (s.monthlyPattern === "first_weekday") {
        return `Le premier ${
          WEEKDAY_LONG[s.weekdayInMonth || 1].toLowerCase()
        } de chaque mois à ${time}`;
      }
      if (s.monthlyPattern === "last_weekday") {
        return `Le dernier ${
          WEEKDAY_LONG[s.weekdayInMonth || 5].toLowerCase()
        } de chaque mois à ${time}`;
      }
      if (s.monthlyPattern === "nth_weekday") {
        const ord = s.weekdayOrdinal || 1;
        return `Le ${ord}e ${
          WEEKDAY_LONG[s.weekdayInMonth || 1].toLowerCase()
        } de chaque mois à ${time}`;
      }
      return `Chaque mois à ${time}`;
    }
    case "yearly": {
      const months = [
        "janvier",
        "février",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "août",
        "septembre",
        "octobre",
        "novembre",
        "décembre",
      ];
      const month = months[(s.monthOfYear || 1) - 1];
      const day = s.dayOfMonth || 1;
      return `Le ${day} ${month} de chaque année à ${time}`;
    }
    default:
      return "Calendrier personnalisé";
  }
}

/**
 * Compute the next run datetime from a schedule, starting from a reference
 * date. Returns null if the schedule has ended.
 */
export function computeNextRun(
  schedule: RecurrenceSchedule,
  from: Date = new Date()
): Date | null {
  if (schedule.endDate && new Date(schedule.endDate).getTime() < from.getTime())
    return null;

  const [hh, mm] = (schedule.timeOfDay || "08:00").split(":").map(Number);
  const start = new Date(schedule.startDate);
  if (start.getTime() > from.getTime()) {
    const next = new Date(start);
    next.setHours(hh, mm, 0, 0);
    return next;
  }

  switch (schedule.frequency) {
    case "daily": {
      const next = new Date(from);
      next.setHours(hh, mm, 0, 0);
      if (next <= from) next.setDate(next.getDate() + (schedule.interval || 1));
      return next;
    }
    case "weekly": {
      const days = schedule.daysOfWeek || [];
      if (days.length === 0) return null;
      const next = new Date(from);
      next.setHours(hh, mm, 0, 0);
      // Find the next matching weekday
      for (let i = 0; i < 14; i++) {
        const d = new Date(next);
        d.setDate(d.getDate() + i);
        // ISO weekday: 1=Mon..7=Sun
        const wd = ((d.getDay() + 6) % 7) + 1;
        if (days.includes(wd as WeekDay) && d > from) return d;
      }
      return null;
    }
    case "monthly": {
      const next = new Date(from);
      next.setHours(hh, mm, 0, 0);
      if (schedule.monthlyPattern === "day_of_month") {
        const day = schedule.dayOfMonth || 1;
        next.setDate(day);
        if (next <= from)
          next.setMonth(next.getMonth() + (schedule.interval || 1));
        return next;
      }
      // Approximate for nth_weekday / first / last — return first of next month
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      return next;
    }
    case "yearly": {
      const next = new Date(from);
      next.setMonth((schedule.monthOfYear || 1) - 1);
      next.setDate(schedule.dayOfMonth || 1);
      next.setHours(hh, mm, 0, 0);
      if (next <= from) next.setFullYear(next.getFullYear() + 1);
      return next;
    }
    default:
      return null;
  }
}
