// GET/PATCH /api/v1/security-center/incidents/[id]
// GET : fiche détaillée d'un incident (avec historique complet des alertes).
// PATCH : mise à jour d'un incident (status, assignee).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const VALID_STATUSES = ["open", "investigating", "waiting_client", "resolved", "closed"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const incident = await prisma.securityIncident.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, clientCode: true } },
      assignee: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      ticket: { select: { id: true, number: true, subject: true, status: true } },
      // Historique complet — la fiche affiche toutes les alertes, pas
      // seulement les 20 dernières comme dans la liste.
      alerts: {
        select: {
          id: true,
          receivedAt: true,
          severity: true,
          title: true,
          summary: true,
        },
        orderBy: { receivedAt: "desc" },
      },
    },
  });

  if (!incident) {
    return NextResponse.json({ error: "Incident introuvable" }, { status: 404 });
  }
  return NextResponse.json(incident);
}

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
