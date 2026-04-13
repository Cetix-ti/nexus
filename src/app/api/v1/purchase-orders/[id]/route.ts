import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      organization: { select: { id: true, name: true } },
      items: true,
    },
  });
  if (!po) return NextResponse.json({ error: "Bon de commande introuvable" }, { status: 404 });

  return NextResponse.json(po);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return NextResponse.json({ error: "Bon de commande introuvable" }, { status: 404 });

  const data: Record<string, unknown> = {};

  // Status transitions
  if (body.status) {
    const s = body.status as string;

    // Approve
    if (s === "APPROVED") {
      if (po.status !== "SUBMITTED") {
        return NextResponse.json({ error: "Seul un PO soumis peut être approuvé" }, { status: 400 });
      }
      data.status = "APPROVED";
      data.approvedById = me.id;
      data.approvedAt = new Date();
    }
    // Reject → back to draft
    else if (s === "REJECTED") {
      if (po.status !== "SUBMITTED") {
        return NextResponse.json({ error: "Seul un PO soumis peut être rejeté" }, { status: 400 });
      }
      data.status = "DRAFT";
      data.approvedById = null;
      data.approvedAt = null;
    }
    // Order (after approval)
    else if (s === "ORDERED") {
      if (po.status !== "APPROVED") {
        return NextResponse.json({ error: "Le PO doit être approuvé avant d'être commandé" }, { status: 400 });
      }
      data.status = "ORDERED";
    }
    // Receive
    else if (s === "RECEIVED") {
      data.status = "RECEIVED";
      data.receivedDate = new Date();
    }
    // Cancel
    else if (s === "CANCELLED") {
      data.status = "CANCELLED";
    }
    // Re-submit (draft → submitted)
    else if (s === "SUBMITTED") {
      if (po.status !== "DRAFT") {
        return NextResponse.json({ error: "Seul un brouillon peut être soumis" }, { status: 400 });
      }
      data.status = "SUBMITTED";
      data.submittedAt = new Date();
    }
    else {
      data.status = s;
    }
  }

  // Other updatable fields
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.expectedDate !== undefined) data.expectedDate = body.expectedDate ? new Date(body.expectedDate) : null;

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data,
    include: {
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      organization: { select: { id: true, name: true } },
      items: true,
    },
  });

  return NextResponse.json(updated);
}
