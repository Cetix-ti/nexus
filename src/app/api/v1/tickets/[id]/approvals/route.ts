import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

/** GET — list approvals for a ticket */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const approvals = await prisma.ticketApproval.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, data: approvals });
}

/** POST — add approvers to a ticket */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  if (!Array.isArray(body.approvers) || body.approvers.length === 0) {
    return NextResponse.json({ error: "Au moins un approbateur requis" }, { status: 400 });
  }

  // Verify ticket exists
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  // Create approval records and update ticket
  const approvalData = body.approvers.map((a: any, i: number) => ({
    ticketId: id,
    approverId: a.contactId || a.id || "",
    approverName: a.name || a.contactName || "",
    approverEmail: a.email || a.contactEmail || "",
    role: i === 0 ? "primary" : "secondary",
  }));

  await prisma.$transaction([
    prisma.ticketApproval.createMany({ data: approvalData }),
    prisma.ticket.update({
      where: { id },
      data: {
        requiresApproval: true,
        approvalStatus: "PENDING",
      },
    }),
  ]);

  const created = await prisma.ticketApproval.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
}

/** PATCH — approve or reject (used by portal or admin) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth required — either agent or portal user
  const me = await getCurrentUser();
  const portalUser = me ? null : await getCurrentPortalUser();
  if (!me && !portalUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const { approvalId, decision, comment } = body;
  if (!approvalId || !["APPROVED", "REJECTED"].includes(decision)) {
    return NextResponse.json({ error: "approvalId et decision (APPROVED|REJECTED) requis" }, { status: 400 });
  }

  // Verify the approval exists and the caller is authorized (approver or agent)
  const approval = await prisma.ticketApproval.findUnique({
    where: { id: approvalId },
    select: { id: true, approverId: true, ticketId: true },
  });
  if (!approval || approval.ticketId !== id) {
    return NextResponse.json({ error: "Approbation introuvable" }, { status: 404 });
  }
  if (portalUser) {
    // Portal user: must be the assigned approver (check via contact email)
    const approver = await prisma.orgApprover.findUnique({
      where: { id: approval.approverId },
      select: { contactId: true },
    });
    if (!approver || approver.contactId !== portalUser.contactId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Update the individual approval
  await prisma.ticketApproval.update({
    where: { id: approvalId },
    data: {
      status: decision,
      comment: comment || null,
      decidedAt: new Date(),
    },
  });

  // Check all approvals for this ticket to determine overall status
  const allApprovals = await prisma.ticketApproval.findMany({
    where: { ticketId: id },
  });

  let overallStatus: "PENDING" | "APPROVED" | "REJECTED" = "PENDING";
  const hasRejection = allApprovals.some((a) => a.status === "REJECTED");
  const allApproved = allApprovals.every((a) => a.status === "APPROVED");

  if (hasRejection) {
    overallStatus = "REJECTED";
  } else if (allApproved) {
    overallStatus = "APPROVED";
  }

  await prisma.ticket.update({
    where: { id },
    data: { approvalStatus: overallStatus },
  });

  return NextResponse.json({
    success: true,
    data: { approvalStatus: overallStatus },
  });
}
