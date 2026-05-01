// ============================================================================
// POST /api/v1/reports/monthly/[id]/pdf-with-graphs   (agent)
//
// Variante du PDF mensuel avec annexe « Graphiques » : reçoit en body les
// snapshots des dashboards (lus depuis localStorage agent) qui doivent être
// joints au rapport. L'agent voit le résultat dans son navigateur — pas de
// persistance.
//
// Body :
//   {
//     dashboards: DashboardSnapshot[],
//     hideRates?: boolean    // défaut true (version client sans montants)
//   }
//
// Sécurité :
//   - Auth agent (rôle non-CLIENT_*).
//   - Le rapport [id] doit exister et appartenir à une org accessible.
//   - On ne stocke PAS le PDF sur disque : généré à la volée et streamé.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { renderReportToPdf } from "@/lib/reports/monthly/pdf";
import { buildReportFilename } from "@/lib/reports/monthly/filename";
import {
  putSnapshot,
  type DashboardSnapshot,
} from "@/lib/reports/monthly/dashboard-snapshot-cache";

export const dynamic = "force-dynamic";

interface RequestBody {
  dashboards?: DashboardSnapshot[];
  hideRates?: boolean;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const dashboards = Array.isArray(body.dashboards) ? body.dashboards : [];
  if (dashboards.length === 0) {
    return NextResponse.json(
      { error: "Aucun dashboard fourni — utilise /pdf pour la version sans graphiques." },
      { status: 400 },
    );
  }
  // Limite de sécurité : on ne traite pas plus de 5 dashboards à la fois
  // (évite des PDFs gigantesques + protège contre des payloads abusifs).
  if (dashboards.length > 5) {
    return NextResponse.json({ error: "Maximum 5 dashboards à la fois" }, { status: 400 });
  }

  const meta = await prisma.monthlyClientReport.findUnique({
    where: { id },
    select: {
      organizationId: true,
      period: true,
      organization: { select: { slug: true, clientCode: true } },
    },
  });
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cache le snapshot et appelle le renderer avec la clé.
  const snapshotKey = putSnapshot(dashboards, meta.organizationId);
  const hideRates = body.hideRates !== false; // défaut true

  try {
    const pdf = await renderReportToPdf(id, { hideRates, snapshotKey });
    const filename = buildReportFilename({
      clientCode: meta.organization.clientCode,
      slug: meta.organization.slug,
      period: meta.period,
      withAmounts: !hideRates,
    }).replace(/\.pdf$/, "-GRAPHIQUES.pdf");

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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports/monthly/pdf-with-graphs]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
