import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { portalVisibilityWhere } from "@/lib/portal/visibility";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!portalUser.permissions.canSeeSoftware) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = {
    organizationId: portalUser.organizationId,
    status: "ACTIVE" as const,
    ...portalVisibilityWhere(portalUser.portalRole),
  };

  const items = await prisma.softwareInstance.findMany({
    where,
    select: {
      id: true,
      name: true,
      vendor: true,
      version: true,
      bodyOverride: true,
      visibility: true,
      tags: true,
      updatedAt: true,
      category: { select: { name: true, icon: true, color: true } },
      template: { select: { body: true } },
      installers: {
        where: { OR: [{ scope: "GLOBAL" }, { scope: "ORG" }] },
        select: { id: true, title: true, filename: true, sizeBytes: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json(items);
}
