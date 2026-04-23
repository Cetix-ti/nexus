// Route portail client — expose les particularités visibles selon le rôle
// portail du contact connecté. INTERNAL jamais exposé, CLIENT_ADMIN réservé
// aux ADMIN, CLIENT_ALL ouvert.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { portalVisibilityWhere } from "@/lib/portal/visibility";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!portalUser.permissions.canSeeParticularities) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = {
    organizationId: portalUser.organizationId,
    status: "ACTIVE" as const,
    ...portalVisibilityWhere(portalUser.portalRole),
  };

  const items = await prisma.particularity.findMany({
    where,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      visibility: true,
      tags: true,
      updatedAt: true,
      category: { select: { name: true, icon: true, color: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json(items);
}
