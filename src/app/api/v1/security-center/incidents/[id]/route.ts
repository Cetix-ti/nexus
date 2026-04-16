// PATCH /api/v1/security-center/incidents/[id]
// Mise à jour d'un incident (status, assignee).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const VALID_STATUSES = ["open", "investigating", "waiting_client", "resolved", "closed"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Status invalide" }, { status: 400 });
    }
    data.status = body.status;
  }
  if ("assigneeId" in body) {
    data.assigneeId = body.assigneeId || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  try {
    const updated = await prisma.securityIncident.update({
      where: { id },
      data,
      include: {
        organization: { select: { id: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[security/incident PATCH]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
