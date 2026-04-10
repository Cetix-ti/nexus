import type {
  ScheduledIntervention,
  SchedulerTechnician,
  TechnicianAvailability,
} from "./types";

// Generate dates relative to today so the calendar always shows fresh data
function today(): Date {
  return new Date();
}

function dateAt(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// TECHNICIANS
// ============================================================================
export const mockSchedulerTechnicians: SchedulerTechnician[] = [
  {
    id: "tech_marie",
    name: "Marie Tremblay",
    email: "marie@cetix.ca",
    role: "Technicienne Senior",
    skills: ["Réseau", "Microsoft 365", "Sécurité"],
    color: "from-fuchsia-500 to-pink-600",
    isActive: true,
  },
  {
    id: "tech_alex",
    name: "Alexandre Dubois",
    email: "alex.dubois@cetix.ca",
    role: "Technicien Réseau",
    skills: ["Cisco", "Fortinet", "VPN"],
    color: "from-emerald-500 to-teal-600",
    isActive: true,
  },
  {
    id: "tech_sophie",
    name: "Sophie Lavoie",
    email: "sophie.lavoie@cetix.ca",
    role: "Superviseure",
    skills: ["Gestion projet", "Audit", "ITIL"],
    color: "from-amber-500 to-orange-600",
    isActive: true,
  },
  {
    id: "tech_lucas",
    name: "Lucas Bergeron",
    email: "lucas.b@cetix.ca",
    role: "Technicien N1",
    skills: ["Support utilisateur", "Postes de travail"],
    color: "from-violet-500 to-purple-600",
    isActive: true,
  },
  {
    id: "tech_jp",
    name: "Jean-Philippe Côté",
    email: "jp.cote@cetix.ca",
    role: "Directeur des opérations",
    skills: ["Architecture", "Cloud", "Stratégie"],
    color: "from-blue-500 to-indigo-600",
    isActive: true,
  },
];

// ============================================================================
// SCHEDULED INTERVENTIONS
// ============================================================================
export const mockScheduledInterventions: ScheduledIntervention[] = [
  // ---------- TODAY ----------
  {
    id: "sch_001",
    startsAt: dateAt(0, 9, 0),
    endsAt: dateAt(0, 10, 30),
    durationMinutes: 90,
    isAllDay: false,
    title: "Diagnostic VPN — Acme Corp",
    description: "Investigation des déconnexions VPN aléatoires depuis 3 jours",
    type: "remote_intervention",
    status: "in_progress",
    ticketId: "t-001",
    ticketNumber: "INC-1042",
    ticketSubject: "VPN ne se connecte plus",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    siteName: "Bureau principal",
    contactName: "Sophie Gagnon",
    contactPhone: "+1 514 555-0200",
    technicianIds: ["tech_marie"],
    technicianNames: ["Marie Tremblay"],
    primaryTechnicianId: "tech_marie",
    estimatedHours: 1.5,
    isRecurring: false,
    createdAt: dateAt(-2, 10, 0),
    createdBy: "Jean-Philippe Côté",
    updatedAt: dateAt(-1, 14, 0),
  },
  {
    id: "sch_002",
    startsAt: dateAt(0, 11, 0),
    endsAt: dateAt(0, 12, 0),
    durationMinutes: 60,
    isAllDay: false,
    title: "Formation utilisateurs — Nouveau Outlook",
    type: "training",
    status: "scheduled",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    siteName: "Bureau principal — Salle de conférence A",
    siteAddress: "1234 boul. Laurier, Québec",
    contactName: "Robert Martin",
    technicianIds: ["tech_sophie"],
    technicianNames: ["Sophie Lavoie"],
    primaryTechnicianId: "tech_sophie",
    isRecurring: false,
    createdAt: dateAt(-5, 10, 0),
    createdBy: "Jean-Philippe Côté",
    updatedAt: dateAt(-5, 10, 0),
  },
  {
    id: "sch_003",
    startsAt: dateAt(0, 13, 30),
    endsAt: dateAt(0, 16, 0),
    durationMinutes: 150,
    isAllDay: false,
    title: "Intervention sur site — Switch core",
    description: "Remplacement du switch core défectueux",
    type: "onsite_intervention",
    status: "confirmed",
    ticketId: "t-002",
    ticketNumber: "INC-1043",
    organizationId: "org-4",
    organizationName: "Global Finance",
    siteName: "Centre de données — Montréal",
    siteAddress: "789 rue Sherbrooke, Montréal",
    contactName: "Pierre Dufour",
    contactPhone: "+1 514 555-0400",
    technicianIds: ["tech_alex"],
    technicianNames: ["Alexandre Dubois"],
    primaryTechnicianId: "tech_alex",
    travelTimeMinutes: 45,
    estimatedHours: 2.5,
    isRecurring: false,
    createdAt: dateAt(-3, 14, 0),
    createdBy: "Marie Tremblay",
    updatedAt: dateAt(-1, 9, 0),
  },
  {
    id: "sch_004",
    startsAt: dateAt(0, 14, 0),
    endsAt: dateAt(0, 15, 0),
    durationMinutes: 60,
    isAllDay: false,
    title: "Réunion de projet — Migration M365",
    type: "meeting",
    status: "scheduled",
    projectId: "prj_001",
    projectName: "Migration Microsoft 365",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    technicianIds: ["tech_jp", "tech_marie"],
    technicianNames: ["Jean-Philippe Côté", "Marie Tremblay"],
    primaryTechnicianId: "tech_jp",
    isRecurring: true,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
    createdAt: dateAt(-30, 10, 0),
    createdBy: "Jean-Philippe Côté",
    updatedAt: dateAt(-1, 10, 0),
  },
  // ---------- TOMORROW ----------
  {
    id: "sch_005",
    startsAt: dateAt(1, 8, 30),
    endsAt: dateAt(1, 11, 30),
    durationMinutes: 180,
    isAllDay: false,
    title: "Maintenance pare-feu Fortinet",
    description: "Mise à jour firmware + révision règles",
    type: "maintenance",
    status: "scheduled",
    ticketNumber: "MAINT-2025-014",
    organizationId: "org-4",
    organizationName: "Global Finance",
    siteName: "Centre de données — Montréal",
    technicianIds: ["tech_alex"],
    technicianNames: ["Alexandre Dubois"],
    primaryTechnicianId: "tech_alex",
    estimatedHours: 3,
    isRecurring: false,
    createdAt: dateAt(-7, 10, 0),
    createdBy: "Sophie Lavoie",
    updatedAt: dateAt(-7, 10, 0),
  },
  {
    id: "sch_006",
    startsAt: dateAt(1, 9, 0),
    endsAt: dateAt(1, 10, 0),
    durationMinutes: 60,
    isAllDay: false,
    title: "Appel de suivi — Refonte réseau",
    type: "phone_call",
    status: "scheduled",
    projectId: "prj_002",
    projectName: "Refonte infrastructure réseau",
    organizationId: "org-4",
    organizationName: "Global Finance",
    contactName: "Nathalie Bergeron",
    technicianIds: ["tech_jp"],
    technicianNames: ["Jean-Philippe Côté"],
    primaryTechnicianId: "tech_jp",
    isRecurring: false,
    createdAt: dateAt(-2, 10, 0),
    createdBy: "Jean-Philippe Côté",
    updatedAt: dateAt(-2, 10, 0),
  },
  {
    id: "sch_007",
    startsAt: dateAt(1, 13, 0),
    endsAt: dateAt(1, 17, 0),
    durationMinutes: 240,
    isAllDay: false,
    title: "Déploiement postes — Nouvelle agence",
    description: "Installation et configuration de 12 postes pour la nouvelle succursale",
    type: "deployment",
    status: "confirmed",
    projectId: "prj_005",
    projectName: "Déploiement nouvelle agence Acme",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    siteName: "Acme — Sherbrooke",
    siteAddress: "456 rue King, Sherbrooke",
    contactName: "David Bergeron",
    technicianIds: ["tech_lucas", "tech_marie"],
    technicianNames: ["Lucas Bergeron", "Marie Tremblay"],
    primaryTechnicianId: "tech_lucas",
    travelTimeMinutes: 90,
    estimatedHours: 4,
    isRecurring: false,
    createdAt: dateAt(-14, 10, 0),
    createdBy: "Jean-Philippe Côté",
    updatedAt: dateAt(-1, 14, 0),
  },
  // ---------- DAY +2 ----------
  {
    id: "sch_008",
    startsAt: dateAt(2, 10, 0),
    endsAt: dateAt(2, 12, 0),
    durationMinutes: 120,
    isAllDay: false,
    title: "Audit sécurité ISO 27001 — phase 2",
    type: "audit",
    status: "scheduled",
    projectId: "prj_004",
    projectName: "Audit de sécurité ISO 27001",
    organizationId: "org-5",
    organizationName: "HealthCare Plus",
    siteName: "Siège — Lévis",
    technicianIds: ["tech_sophie"],
    technicianNames: ["Sophie Lavoie"],
    primaryTechnicianId: "tech_sophie",
    travelTimeMinutes: 30,
    estimatedHours: 2,
    isRecurring: false,
    createdAt: dateAt(-10, 10, 0),
    createdBy: "Sophie Lavoie",
    updatedAt: dateAt(-1, 10, 0),
  },
  {
    id: "sch_009",
    startsAt: dateAt(2, 14, 0),
    endsAt: dateAt(2, 15, 30),
    durationMinutes: 90,
    isAllDay: false,
    title: "Suivi tickets — TechStart",
    type: "follow_up",
    status: "scheduled",
    organizationId: "org-3",
    organizationName: "TechStart Inc",
    technicianIds: ["tech_marie"],
    technicianNames: ["Marie Tremblay"],
    primaryTechnicianId: "tech_marie",
    isRecurring: false,
    createdAt: dateAt(-1, 10, 0),
    createdBy: "Marie Tremblay",
    updatedAt: dateAt(-1, 10, 0),
  },
  // ---------- DAY +3 ----------
  {
    id: "sch_010",
    startsAt: dateAt(3, 9, 0),
    endsAt: dateAt(3, 11, 0),
    durationMinutes: 120,
    isAllDay: false,
    title: "Migration boîtes courriel — Vague 2",
    type: "remote_intervention",
    status: "scheduled",
    projectId: "prj_001",
    projectName: "Migration Microsoft 365",
    ticketNumber: "TASK-1058",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    technicianIds: ["tech_alex"],
    technicianNames: ["Alexandre Dubois"],
    primaryTechnicianId: "tech_alex",
    estimatedHours: 2,
    isRecurring: false,
    createdAt: dateAt(-7, 10, 0),
    createdBy: "Marie Tremblay",
    updatedAt: dateAt(-1, 14, 0),
  },
  {
    id: "sch_011",
    startsAt: dateAt(3, 14, 0),
    endsAt: dateAt(3, 16, 0),
    durationMinutes: 120,
    isAllDay: false,
    title: "Intervention urgente — Imprimante étage 3",
    type: "onsite_intervention",
    status: "scheduled",
    ticketNumber: "INC-1051",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    siteName: "Bureau principal",
    contactName: "Julien Lavoie",
    technicianIds: ["tech_lucas"],
    technicianNames: ["Lucas Bergeron"],
    primaryTechnicianId: "tech_lucas",
    travelTimeMinutes: 30,
    estimatedHours: 2,
    isRecurring: false,
    createdAt: dateAt(-1, 9, 0),
    createdBy: "Sophie Lavoie",
    updatedAt: dateAt(-1, 9, 0),
  },
  // ---------- DAY +4 ----------
  {
    id: "sch_012",
    startsAt: dateAt(4, 8, 0),
    endsAt: dateAt(4, 17, 0),
    durationMinutes: 540,
    isAllDay: true,
    title: "Formation Cisco — Toute la journée",
    type: "training",
    status: "confirmed",
    organizationId: "org_cetix",
    organizationName: "Cetix",
    technicianIds: ["tech_alex"],
    technicianNames: ["Alexandre Dubois"],
    primaryTechnicianId: "tech_alex",
    isRecurring: false,
    createdAt: dateAt(-30, 10, 0),
    createdBy: "Sophie Lavoie",
    updatedAt: dateAt(-30, 10, 0),
  },
  {
    id: "sch_013",
    startsAt: dateAt(4, 9, 30),
    endsAt: dateAt(4, 11, 0),
    durationMinutes: 90,
    isAllDay: false,
    title: "Configuration backup Veeam",
    type: "deployment",
    status: "scheduled",
    organizationId: "org-3",
    organizationName: "TechStart Inc",
    technicianIds: ["tech_marie"],
    technicianNames: ["Marie Tremblay"],
    primaryTechnicianId: "tech_marie",
    estimatedHours: 1.5,
    isRecurring: false,
    createdAt: dateAt(-3, 10, 0),
    createdBy: "Marie Tremblay",
    updatedAt: dateAt(-3, 10, 0),
  },
  // ---------- YESTERDAY (completed) ----------
  {
    id: "sch_014",
    startsAt: dateAt(-1, 14, 0),
    endsAt: dateAt(-1, 16, 0),
    durationMinutes: 120,
    isAllDay: false,
    title: "Réinitialisation MFA — utilisateur VIP",
    type: "remote_intervention",
    status: "completed",
    ticketNumber: "INC-1031",
    organizationId: "org-4",
    organizationName: "Global Finance",
    contactName: "Catherine Lemieux",
    technicianIds: ["tech_marie"],
    technicianNames: ["Marie Tremblay"],
    primaryTechnicianId: "tech_marie",
    isRecurring: false,
    createdAt: dateAt(-2, 10, 0),
    createdBy: "Marie Tremblay",
    updatedAt: dateAt(-1, 16, 0),
  },
];

// ============================================================================
// AVAILABILITY (per technician, per day)
// ============================================================================
export const mockTechnicianAvailability: TechnicianAvailability[] = (() => {
  const all: TechnicianAvailability[] = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    for (const tech of mockSchedulerTechnicians) {
      const date = isoDate(dayOffset);
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      // Marie has training on day +4 (full day off)
      const isOnLeave =
        (tech.id === "tech_alex" && dayOffset === 4) ||
        (tech.id === "tech_lucas" && dayOffset === 7);
      const workStart = new Date(d);
      workStart.setHours(8, 30, 0, 0);
      const workEnd = new Date(d);
      workEnd.setHours(17, 30, 0, 0);

      // Compute scheduled minutes from interventions
      const scheduledMinutes = mockScheduledInterventions
        .filter((iv) => iv.technicianIds.includes(tech.id))
        .filter((iv) => {
          const ivDate = new Date(iv.startsAt).toISOString().slice(0, 10);
          return ivDate === date;
        })
        .reduce((acc, iv) => acc + iv.durationMinutes, 0);

      const totalCapacity = isWeekend || isOnLeave ? 0 : 9 * 60;
      all.push({
        technicianId: tech.id,
        technicianName: tech.name,
        date,
        workStartAt: workStart.toISOString(),
        workEndAt: workEnd.toISOString(),
        isOnLeave,
        leaveReason: isOnLeave ? (tech.id === "tech_alex" ? "training" : "vacation") : undefined,
        isOnCall: tech.id === "tech_alex" && dayOffset === 6,
        scheduledMinutes,
        remainingMinutes: Math.max(0, totalCapacity - scheduledMinutes),
      });
    }
  }
  return all;
})();

// ============================================================================
// HELPERS
// ============================================================================
export function getInterventionsForDate(date: Date): ScheduledIntervention[] {
  const target = date.toISOString().slice(0, 10);
  return mockScheduledInterventions.filter((iv) => {
    const ivDate = new Date(iv.startsAt).toISOString().slice(0, 10);
    return ivDate === target;
  });
}

export function getInterventionsForWeek(weekStart: Date): ScheduledIntervention[] {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return mockScheduledInterventions.filter((iv) => {
    const t = new Date(iv.startsAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
}

export function getInterventionsForTechnician(
  techId: string,
  weekStart: Date
): ScheduledIntervention[] {
  const interventions = getInterventionsForWeek(weekStart);
  return interventions.filter((iv) => iv.technicianIds.includes(techId));
}
