// GET /api/v1/security-center/incidents
// Liste paginée + filtrée des incidents de sécurité.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const source = url.searchParams.get("source") || undefined;
  const kind = url.searchParams.get("kind") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const orgId = url.searchParams.get("organizationId") || undefined;
  const assigned = url.searchParams.get("assigned"); // "me" → moi ; sinon tous
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500);

  const assigneeFilter =
    assigned === "me"
      ? { assigneeId: me.id }
      : assigned === "unassigned"
      ? { assigneeId: null }
      : {};

  const incidents = await prisma.securityIncident.findMany({
    where: {
      ...(source ? { source } : {}),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(orgId ? { organizationId: orgId } : {}),
      ...assigneeFilter,
    },
    include: {
      organization: { select: { id: true, name: true, clientCode: true } },
      assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      ticket: { select: { id: true, number: true, subject: true, status: true } },
      // On n'envoie pas toutes les alertes (volume potentiellement
      // énorme) — juste les 20 dernières pour l'historique affichable.
      alerts: {
        select: {
          id: true,
          receivedAt: true,
          severity: true,
          title: true,
          summary: true,
        },
        orderBy: { receivedAt: "desc" },
        take: 20,
      },
    },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
  });

  return NextResponse.json(incidents);
}
