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
