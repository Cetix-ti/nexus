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
import { renderReportToPdf } from "@/lib/reports/monthly/pdf";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const variant = new URL(req.url).searchParams.get("variant");

  const meta = await prisma.monthlyClientReport.findUnique({
    where: { id },
    select: {
      period: true,
      organization: { select: { slug: true, name: true } },
    },
  });
  if (!meta) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Variante "heures seulement" : toujours générée à la volée, pas
    // persistée. Le fichier sur disque reste la version $ "officielle"
    // pour ne pas dupliquer le stockage.
    const pdf =
      variant === "hours_only"
        ? await renderReportToPdf(id, { hideRates: true })
        : await readReportPdfOrGenerate(id);
    const periodStr = meta.period.toISOString().slice(0, 7);
    const suffix = variant === "hours_only" ? "-heures" : "";
    const filename = `rapport-${meta.organization.slug}-${periodStr}${suffix}.pdf`;

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
