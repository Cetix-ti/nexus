// Rejette un bug (won't fix / by design / duplicate).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const bug = await prisma.bugReport.findUnique({ where: { id }, select: { status: true } });
  if (!bug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (["FIXED"].includes(bug.status)) {
    return NextResponse.json({ error: `Bug déjà fixé — impossible de rejeter.` }, { status: 400 });
  }

  const updated = await prisma.bugReport.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectedByUserId: me.id,
      rejectionReason: body?.reason ? String(body.reason).slice(0, 2000) : null,
    },
  });
  return NextResponse.json(updated);
}
