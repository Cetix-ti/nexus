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

  // Politique de variante exposée au portail client (Phase 7) — drive
  // l'UI : afficher 1 ou 2 boutons de téléchargement par rapport.
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { clientPortalReportVariant: true, enabledModules: true },
  });
  const variantPolicy = org?.clientPortalReportVariant ?? "BOTH";
  // Phase 10F : module billing_reports désactivé pour cette org → 403,
  // l'UI portail traite ça comme "section non disponible".
  const modules = Array.isArray(org?.enabledModules) ? org!.enabledModules : [];
  const moduleEnabled = modules.length === 0 || modules.includes("billing_reports");
  if (!moduleEnabled) {
    return NextResponse.json({ error: "Module non activé" }, { status: 403 });
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
    variantPolicy,
    items: rows.map((r) => ({
      id: r.id,
      period: r.period.toISOString().slice(0, 7),
      generatedAt: r.generatedAt.toISOString(),
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      fileSizeBytes: r.fileSizeBytes,
    })),
  });
}
