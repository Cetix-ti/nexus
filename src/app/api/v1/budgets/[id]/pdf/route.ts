// Génère le PDF du budget pour une org, stream en réponse.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import { renderBudgetToPdf } from "@/lib/reports/budget/pdf";

export const maxDuration = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const b = await prisma.budget.findUnique({
    where: { id },
    select: { organizationId: true, fiscalYear: true, organization: { select: { slug: true } } },
  });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await assertSameOrg(me, b.organizationId);
  if (!guard.ok) return guard.res;

  const safeSlug = (b.organization.slug || "org").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64);

  try {
    const pdf = await renderBudgetToPdf(id);
    const filename = `budget-${b.fiscalYear}-${safeSlug}.pdf`;
    // AuditLog non-bloquant.
    try {
      await prisma.auditLog.create({
        data: {
          action: "budget.pdf.download",
          entityType: "Budget",
          entityId: id,
          userId: me.id,
          userEmail: me.email,
          organizationId: b.organizationId,
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
