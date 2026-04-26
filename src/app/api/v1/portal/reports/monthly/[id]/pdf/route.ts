// ============================================================================
// GET /api/v1/portal/reports/monthly/[id]/pdf  (portal) : télécharge PDF
//
// Permission : canSeeBillingReports OU portalRole === "ADMIN", et le
// rapport doit appartenir à l'org du portal user ET être publié.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { readReportPdfOrGenerate } from "@/lib/reports/monthly/service";
import { renderReportToPdf } from "@/lib/reports/monthly/pdf";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canSeeBillingReports && user.portalRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const requestedVariant = url.searchParams.get("variant"); // "hours_only" | null
  const forceDownload = url.searchParams.get("download") === "1";

  const meta = await prisma.monthlyClientReport.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      publishedToPortal: true,
      period: true,
      organization: {
        select: { slug: true, clientPortalReportVariant: true },
      },
    },
  });
  if (
    !meta ||
    meta.organizationId !== user.organizationId ||
    !meta.publishedToPortal
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Phase 7 — toggle par-org : applique la politique de variante exposée
  // au portail client. Trois modes :
  //   BOTH       : client peut télécharger les deux variantes
  //   WITH_RATES : seule la version complète $ est accessible
  //   HOURS_ONLY : seule la version heures-seulement est accessible
  const orgVariant = meta.organization.clientPortalReportVariant ?? "BOTH";
  const wantsHoursOnly = requestedVariant === "hours_only";
  if (wantsHoursOnly && orgVariant === "WITH_RATES") {
    return NextResponse.json({ error: "Variante non disponible" }, { status: 403 });
  }
  if (!wantsHoursOnly && orgVariant === "HOURS_ONLY") {
    // Le client demande la version $ alors que l'org expose seulement
    // la version heures — on refuse plutôt que de servir la version $
    // par mégarde.
    return NextResponse.json({ error: "Variante non disponible" }, { status: 403 });
  }

  try {
    const pdf = wantsHoursOnly
      ? await renderReportToPdf(id, { hideRates: true })
      : await readReportPdfOrGenerate(id);
    const periodStr = meta.period.toISOString().slice(0, 7);
    const suffix = wantsHoursOnly ? "-heures" : "";
    const filename = `rapport-${meta.organization.slug}-${periodStr}${suffix}.pdf`;
    const disposition = forceDownload
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
