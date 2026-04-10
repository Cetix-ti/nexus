import prisma from "@/lib/prisma";

export async function logAudit(input: {
  userId?: string;
  userEmail?: string;
  organizationId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  return prisma.auditLog.create({ data: input });
}

export async function listAudit(options?: {
  organizationId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      organizationId: options?.organizationId,
      entityType: options?.entityType,
      entityId: options?.entityId,
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 100,
  });
}
