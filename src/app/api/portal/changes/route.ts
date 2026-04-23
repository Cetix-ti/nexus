// Portail client — Changements publiés + `exposeToClientAdmin` + rôle admin.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { portalVisibilityWhere } from "@/lib/portal/visibility";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!portalUser.permissions.canSeeChanges) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.change.findMany({
    where: {
      organizationId: portalUser.organizationId,
      status: "PUBLISHED",
      exposeToClientAdmin: true,
      mergedIntoId: null,
      ...portalVisibilityWhere(portalUser.portalRole),
    },
    select: {
      id: true, title: true, summary: true, body: true,
      category: true, impact: true, changeDate: true, publishedAt: true,
    },
    orderBy: [{ changeDate: "desc" }],
    take: 100,
  });
  return NextResponse.json(items);
}
