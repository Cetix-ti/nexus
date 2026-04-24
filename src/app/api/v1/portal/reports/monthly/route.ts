// ============================================================================
// GET /api/v1/portal/reports/monthly  (portal) : rapports publiés pour l'org
//
// Permission : canSeeBillingReports OU portalRole === "ADMIN".
// Ne retourne que les rapports publishedToPortal=true scopés à l'org du
// portal user courant. Pas moyen de lister les rapports d'une autre org.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET() {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canSeeBillingReports && user.portalRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.monthlyClientReport.findMany({
    where: {
      organizationId: user.organizationId,
      publishedToPortal: true,
    },
    orderBy: { period: "desc" },
    select: {
      id: true,
      period: true,
      generatedAt: true,
      publishedAt: true,
      fileSizeBytes: true,
    },
    take: 60,
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      period: r.period.toISOString().slice(0, 7),
      generatedAt: r.generatedAt.toISOString(),
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      fileSizeBytes: r.fileSizeBytes,
    })),
  });
}
