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
  // `source` accepte soit un seul code ("ad_email") soit plusieurs
  // séparés par virgule ("wazuh_email,wazuh_api") pour que l'onglet
  // Wazuh puisse agréger les deux pipelines.
  const sourceRaw = url.searchParams.get("source");
  const sourceList = sourceRaw
    ? sourceRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const kind = url.searchParams.get("kind") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const orgId = url.searchParams.get("organizationId") || undefined;
  const assigned = url.searchParams.get("assigned"); // "me" → moi ; sinon tous
  // Cap par défaut baissé de 200 à 100 — l'UI agrège par endpoint et un
  // tenant qui a plus de 100 incidents OUVERTS simultanément est
  // pathologique. Les anciens incidents sont visibles via les filtres.
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

  const assigneeFilter =
    assigned === "me"
      ? { assigneeId: me.id }
      : assigned === "unassigned"
      ? { assigneeId: null }
      : {};

  // Filtre priorité : "main" = incidents importants (default),
  // "low" = section "moins importantes", "all" = les deux.
  const priorityParam = url.searchParams.get("priority") ?? "main";
  const priorityFilter =
    priorityParam === "low"
      ? { isLowPriority: true }
      : priorityParam === "all"
      ? {}
      : { isLowPriority: false };

  const incidents = await prisma.securityIncident.findMany({
    where: {
      ...(sourceList.length === 1
        ? { source: sourceList[0] }
        : sourceList.length > 1
          ? { source: { in: sourceList } }
          : {}),
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(orgId ? { organizationId: orgId } : {}),
      ...assigneeFilter,
      ...priorityFilter,
    },
    include: {
      organization: { select: { id: true, name: true, clientCode: true } },
      assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      ticket: { select: { id: true, number: true, subject: true, status: true } },
      // On n'envoie pas toutes les alertes (volume potentiellement
      // énorme) — juste les 5 dernières pour l'aperçu "liste" (la fiche
      // détail GET /incidents/[id] renvoie l'historique complet avec
      // `summary`). `summary` est exclu ici : il pèse jusqu'à 500 chars
      // par alerte et n'est jamais affiché dans la vue liste.
      alerts: {
        select: {
          id: true,
          receivedAt: true,
          severity: true,
          title: true,
        },
        orderBy: { receivedAt: "desc" },
        take: 5,
      },
    },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
  });

  return NextResponse.json(incidents);
}
