// ============================================================================
// GET /api/v1/reports/monthly/[id]/pdf   (agent) : stream PDF
//
// Régénère le PDF si le payload existe mais pas le fichier. Utile si le
// fichier a été supprimé manuellement ou si une migration a rendu l'ancien
// PDF obsolète.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { readReportPdfOrGenerate } from "@/lib/reports/monthly/service";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const meta = await prisma.monthlyClientReport.findUnique({
    where: { id },
    select: {
      period: true,
      organization: { select: { slug: true, name: true } },
    },
  });
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const pdf = await readReportPdfOrGenerate(id);
    const periodStr = meta.period.toISOString().slice(0, 7);
    const filename = `rapport-${meta.organization.slug}-${periodStr}.pdf`;

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
