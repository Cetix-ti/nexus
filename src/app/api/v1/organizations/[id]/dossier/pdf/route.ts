// Génère le PDF dossier 360° pour une organisation, stream en réponse.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertUserOrgAccess } from "@/lib/auth/org-access";
import { renderDossierToPdf } from "@/lib/reports/dossier/pdf";

export const maxDuration = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const guard = await assertUserOrgAccess(me, id);
  if (!guard.ok) return guard.res;

  const org = await prisma.organization.findUnique({ where: { id }, select: { name: true, slug: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sanitize slug pour header Content-Disposition (pas de / ni quote).
  const safeSlug = (org.slug || "org").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64);

  try {
    const pdf = await renderDossierToPdf(id);
    const filename = `dossier-360-${safeSlug}-${new Date().toISOString().slice(0, 10)}.pdf`;
    // AuditLog non-bloquant — trace qui a téléchargé quel dossier.
    try {
      await prisma.auditLog.create({
        data: {
          action: "org.dossier_pdf.download",
          entityType: "Organization",
          entityId: id,
          userId: me.id,
          userEmail: me.email,
          organizationId: id,
        },
      });
    } catch { /* non bloquant */ }
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PDF render failed" }, { status: 500 });
  }
}
