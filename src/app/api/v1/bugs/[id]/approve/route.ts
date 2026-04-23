// Approuve un bug pour auto-fix nocturne. Change statut → APPROVED_FOR_FIX.
// Le worker nocturne le prendra ensuite.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const bug = await prisma.bugReport.findUnique({ where: { id }, select: { status: true } });
  if (!bug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["NEW", "TRIAGED", "REJECTED"].includes(bug.status)) {
    return NextResponse.json({ error: `Impossible d'approuver un bug en statut ${bug.status}` }, { status: 400 });
  }

  const updated = await prisma.bugReport.update({
    where: { id },
    data: {
      status: "APPROVED_FOR_FIX",
      approvedForAutoFixAt: new Date(),
      approvedByUserId: me.id,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
    },
  });
  return NextResponse.json(updated);
}
