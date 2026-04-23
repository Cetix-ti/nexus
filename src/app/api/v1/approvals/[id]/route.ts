import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

// Peut décider : admins MSP + délégués explicitement listés pour l'org.
const DECIDER_ADMIN_ROLES = ["SUPER_ADMIN", "MSP_ADMIN", "SUPERVISOR"] as const;

async function canDecide(userId: string, userRole: string, organizationId: string | null): Promise<boolean> {
  if ((DECIDER_ADMIN_ROLES as readonly string[]).includes(userRole)) return true;
  if (!organizationId) return false;
  const delegate = await prisma.approvalDelegate.findFirst({
    where: { userId, organizationId },
    select: { id: true },
  });
  return Boolean(delegate);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const decision = String(body?.decision ?? "").toUpperCase();
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(decision)) {
    return NextResponse.json({ error: "decision invalide" }, { status: 400 });
  }
  const req_ = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!req_) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req_.status !== "PENDING") return NextResponse.json({ error: "Demande déjà décidée" }, { status: 400 });

  // CANCELLED : seul le requester (ou un admin) peut annuler sa propre demande.
  if (decision === "CANCELLED") {
    const isAdmin = (DECIDER_ADMIN_ROLES as readonly string[]).includes(me.role);
    if (!isAdmin && req_.requestedByUserId !== me.id) {
      return NextResponse.json({ error: "Seul le demandeur ou un admin peut annuler." }, { status: 403 });
    }
  } else {
    // APPROVED / REJECTED : admin MSP ou délégué explicite pour l'org.
    const allowed = await canDecide(me.id, me.role, req_.organizationId);
    if (!allowed) return NextResponse.json({ error: "Non délégué pour cette organisation." }, { status: 403 });
  }

  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: decision as "APPROVED" | "REJECTED" | "CANCELLED",
      decidedByUserId: me.id,
      decidedAt: new Date(),
      decisionNote: body?.decisionNote || null,
    },
  });

  // Effets secondaires : bornés à la même org que la demande pour empêcher
  // qu'une approbation cross-org altère l'instance d'un autre client.
  if (decision === "APPROVED" && updated.targetType === "gpo_instance" && updated.action === "deploy") {
    await prisma.gpoInstance.updateMany({
      where: { id: updated.targetId, organizationId: updated.organizationId ?? undefined },
      data: { status: "APPROVED", lastApprovalId: updated.id },
    });
  }
  return NextResponse.json(updated);
}
