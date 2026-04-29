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
import { buildReportFilename } from "@/lib/reports/monthly/filename";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canSeeBillingReports && user.portalRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const meta = await prisma.monthlyClientReport.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      publishedToPortal: true,
      period: true,
      organization: { select: { slug: true, clientCode: true } },
    },
  });
  if (
    !meta ||
    meta.organizationId !== user.organizationId ||
    !meta.publishedToPortal
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const pdf = await readReportPdfOrGenerate(id);
    const filename = buildReportFilename({
      clientCode: meta.organization.clientCode,
      slug: meta.organization.slug,
      period: meta.period,
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
