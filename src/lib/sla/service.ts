import prisma from "@/lib/prisma";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;
type Priority = (typeof PRIORITIES)[number];

export interface SlaProfile {
  low: { firstResponseHours: number; resolutionHours: number };
  medium: { firstResponseHours: number; resolutionHours: number };
  high: { firstResponseHours: number; resolutionHours: number };
  critical: { firstResponseHours: number; resolutionHours: number };
}

function rowToProfile(row: any): SlaProfile {
  return {
    low: { firstResponseHours: row.lowFirstResponseHours, resolutionHours: row.lowResolutionHours },
    medium: { firstResponseHours: row.mediumFirstResponseHours, resolutionHours: row.mediumResolutionHours },
    high: { firstResponseHours: row.highFirstResponseHours, resolutionHours: row.highResolutionHours },
    critical: { firstResponseHours: row.criticalFirstResponseHours, resolutionHours: row.criticalResolutionHours },
  };
}

function profileToData(p: SlaProfile) {
  return {
    lowFirstResponseHours: p.low.firstResponseHours,
    lowResolutionHours: p.low.resolutionHours,
    mediumFirstResponseHours: p.medium.firstResponseHours,
    mediumResolutionHours: p.medium.resolutionHours,
    highFirstResponseHours: p.high.firstResponseHours,
    highResolutionHours: p.high.resolutionHours,
    criticalFirstResponseHours: p.critical.firstResponseHours,
    criticalResolutionHours: p.critical.resolutionHours,
  };
}

export async function getGlobalProfile(): Promise<SlaProfile> {
  let row = await prisma.globalSlaProfile.findUnique({ where: { id: "global" } });
  if (!row) {
    row = await prisma.globalSlaProfile.create({ data: { id: "global" } });
  }
  return rowToProfile(row);
}

export async function setGlobalProfile(profile: SlaProfile): Promise<SlaProfile> {
  const row = await prisma.globalSlaProfile.upsert({
    where: { id: "global" },
    create: { id: "global", ...profileToData(profile) },
    update: profileToData(profile),
  });
  return rowToProfile(row);
}

export async function getOrgOverride(orgId: string): Promise<SlaProfile | null> {
  const row = await prisma.orgSlaOverride.findUnique({ where: { organizationId: orgId } });
  return row ? rowToProfile(row) : null;
}

export async function setOrgOverride(orgId: string, profile: SlaProfile): Promise<SlaProfile> {
  const row = await prisma.orgSlaOverride.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...profileToData(profile) },
    update: profileToData(profile),
  });
  return rowToProfile(row);
}

export async function deleteOrgOverride(orgId: string): Promise<void> {
  try {
    await prisma.orgSlaOverride.delete({ where: { organizationId: orgId } });
  } catch {
    /* not found */
  }
}

export async function listAllOverrides() {
  return prisma.orgSlaOverride.findMany();
}

// ---------------------------------------------------------------------------
// SLA Enforcement Engine
// Recalculates isOverdue, slaBreached, and dueAt for all open tickets.
// Should be called periodically (cron every 5-15 minutes) or on ticket update.
// ---------------------------------------------------------------------------

const OPEN_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "PENDING", "WAITING_CLIENT", "WAITING_VENDOR", "SCHEDULED"];

/** Resolve the effective SLA profile for a given org (org override → global fallback). */
async function resolveProfile(orgId: string, globalProfile: SlaProfile): Promise<SlaProfile> {
  const override = await getOrgOverride(orgId);
  return override ?? globalProfile;
}

/** Run SLA enforcement across all open tickets. Returns count of updated tickets. */
export async function enforceSla(): Promise<{ checked: number; updated: number; breached: number }> {
  const globalProfile = await getGlobalProfile();
  const now = new Date();
  let updated = 0;
  let breached = 0;

  // Fetch all open tickets with their org
  const tickets = await prisma.ticket.findMany({
    where: { status: { in: OPEN_STATUSES as any } },
    select: {
      id: true,
      priority: true,
      organizationId: true,
      createdAt: true,
      firstResponseAt: true,
      dueAt: true,
      isOverdue: true,
      slaBreached: true,
    },
  });

  // Cache org profiles to avoid repeated lookups
  const profileCache = new Map<string, SlaProfile>();

  for (const ticket of tickets) {
    let profile = profileCache.get(ticket.organizationId);
    if (!profile) {
      profile = await resolveProfile(ticket.organizationId, globalProfile);
      profileCache.set(ticket.organizationId, profile);
    }

    const priorityKey = ticket.priority.toLowerCase() as Priority;
    const slaConfig = profile[priorityKey];
    if (!slaConfig) continue;

    // Calculate due date based on resolution hours
    const resolutionMs = slaConfig.resolutionHours * 60 * 60 * 1000;
    const expectedDueAt = new Date(ticket.createdAt.getTime() + resolutionMs);

    // Determine status
    const isNowOverdue = now > expectedDueAt;
    const isNowBreached = isNowOverdue; // Breached = past due date

    // Check if first response SLA was breached
    const firstResponseMs = slaConfig.firstResponseHours * 60 * 60 * 1000;
    const firstResponseDeadline = new Date(ticket.createdAt.getTime() + firstResponseMs);
    const firstResponseBreached = !ticket.firstResponseAt && now > firstResponseDeadline;

    const shouldBreach = isNowBreached || firstResponseBreached;

    // Only update if something changed
    if (
      ticket.dueAt?.getTime() !== expectedDueAt.getTime() ||
      ticket.isOverdue !== isNowOverdue ||
      ticket.slaBreached !== shouldBreach
    ) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          dueAt: expectedDueAt,
          isOverdue: isNowOverdue,
          slaBreached: shouldBreach,
        },
      });
      updated++;
      if (shouldBreach && !ticket.slaBreached) breached++;
    }
  }

  return { checked: tickets.length, updated, breached };
}

/** Run SLA enforcement for a single ticket (called on ticket create/update). */
export async function enforceSlaForTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      priority: true,
      organizationId: true,
      createdAt: true,
      firstResponseAt: true,
      status: true,
    },
  });
  if (!ticket || !OPEN_STATUSES.includes(ticket.status)) return;

  const globalProfile = await getGlobalProfile();
  const profile = await resolveProfile(ticket.organizationId, globalProfile);
  const priorityKey = ticket.priority.toLowerCase() as Priority;
  const slaConfig = profile[priorityKey];
  if (!slaConfig) return;

  const now = new Date();
  const resolutionMs = slaConfig.resolutionHours * 60 * 60 * 1000;
  const expectedDueAt = new Date(ticket.createdAt.getTime() + resolutionMs);
  const isOverdue = now > expectedDueAt;

  const firstResponseMs = slaConfig.firstResponseHours * 60 * 60 * 1000;
  const firstResponseDeadline = new Date(ticket.createdAt.getTime() + firstResponseMs);
  const firstResponseBreached = !ticket.firstResponseAt && now > firstResponseDeadline;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      dueAt: expectedDueAt,
      isOverdue,
      slaBreached: isOverdue || firstResponseBreached,
    },
  });
}
