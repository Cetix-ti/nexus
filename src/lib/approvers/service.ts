import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function scopeToDb(s: string): any {
  return s.toUpperCase();
}
function scopeToUi(s: string): any {
  return s.toLowerCase();
}

function flatten(row: any) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    contactId: row.contactId,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    jobTitle: row.jobTitle,
    level: row.level,
    isPrimary: row.isPrimary,
    scope: scopeToUi(row.scope),
    scopeMinAmount: row.scopeMinAmount,
    notifyByEmail: row.notifyByEmail,
    notifyBySms: row.notifyBySms,
    isActive: row.isActive,
    totalApproved: row.totalApproved,
    totalRejected: row.totalRejected,
    averageResponseHours: row.averageResponseHours,
    addedBy: row.addedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listApprovers(orgId: string) {
  const rows = await prisma.orgApprover.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: [{ isPrimary: "desc" }, { level: "asc" }],
  });
  return rows.map(flatten);
}

export async function createApprover(input: any) {
  const data: Prisma.OrgApproverCreateInput = {
    organizationId: input.organizationId,
    contactId: input.contactId,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    jobTitle: input.jobTitle,
    level: input.level || 1,
    isPrimary: input.isPrimary || false,
    scope: scopeToDb(input.scope || "all_tickets"),
    scopeMinAmount: input.scopeMinAmount,
    notifyByEmail: input.notifyByEmail ?? true,
    notifyBySms: input.notifyBySms ?? false,
    addedBy: input.addedBy,
  };
  const row = await prisma.orgApprover.create({ data });
  return flatten(row);
}

export async function updateApprover(id: string, patch: any) {
  if (patch.scope) patch.scope = scopeToDb(patch.scope);
  const row = await prisma.orgApprover.update({ where: { id }, data: patch });
  return flatten(row);
}

export async function deleteApprover(id: string) {
  await prisma.orgApprover.delete({ where: { id } });
}

export async function setPrimary(orgId: string, id: string) {
  await prisma.$transaction([
    prisma.orgApprover.updateMany({
      where: { organizationId: orgId },
      data: { isPrimary: false },
    }),
    prisma.orgApprover.update({ where: { id }, data: { isPrimary: true } }),
  ]);
}
