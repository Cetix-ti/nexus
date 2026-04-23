import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const decision = String(body?.decision ?? "").toUpperCase(); // APPROVED | REJECTED | CANCELLED
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(decision)) {
    return NextResponse.json({ error: "decision invalide" }, { status: 400 });
  }
  const req_ = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!req_) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req_.status !== "PENDING") return NextResponse.json({ error: "Demande déjà décidée" }, { status: 400 });

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: decision as "APPROVED" | "REJECTED" | "CANCELLED",
      decidedByUserId: me.id,
      decidedAt: new Date(),
      decisionNote: body?.decisionNote || null,
    },
  });

  // Effets secondaires : si approval d'un déploiement GPO, marquer l'instance APPROVED.
  if (decision === "APPROVED" && updated.targetType === "gpo_instance" && updated.action === "deploy") {
    await prisma.gpoInstance.updateMany({
      where: { id: updated.targetId },
      data: { status: "APPROVED", lastApprovalId: updated.id },
    });
  }
  return NextResponse.json(updated);
}
