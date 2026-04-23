// Inbox approbations : demandes PENDING où l'utilisateur connecté est délégué
// (via ApprovalDelegate) pour au moins une org concernée.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Les délégués par org pour cet agent
  const delegates = await prisma.approvalDelegate.findMany({
    where: { userId: me.id },
    select: { organizationId: true, scope: true },
  });

  // Fallback : super-admin / msp-admin voient toutes les demandes
  const isAdmin = ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR"].includes(me.role);
  const orgsScope = isAdmin ? undefined : delegates.map((d) => d.organizationId);

  const where: Record<string, unknown> = { status: "PENDING" };
  if (!isAdmin) {
    if (!orgsScope || orgsScope.length === 0) return NextResponse.json([]);
    where.organizationId = { in: orgsScope };
  }

  const items = await prisma.approvalRequest.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      requestedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });
  return NextResponse.json(items);
}
