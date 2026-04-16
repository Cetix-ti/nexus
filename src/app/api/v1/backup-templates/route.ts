// ============================================================================
// GET  /api/v1/backup-templates
//   → Liste les templates (colonne 1) + les tickets en traitement (colonne 2).
//
// POST /api/v1/backup-templates/refresh
//   → Régénère les templates à partir des dernières alertes Veeam FAILED.
//     Garde le titre édité par l'agent si modifié. Ne touche pas aux tickets
//     colonne 2.
//
// Implémentation : les 2 routes sont dans ce fichier pour simplicité —
// le « refresh » étant un action POST non-RESTful pur, on utilise plutôt
// une sous-route /refresh distincte (cf. ./refresh/route.ts).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { listInProcessingTickets } from "@/lib/backup-kanban/service";
import { formatTicketNumber, getClientTicketPrefix } from "@/lib/tenant-settings/service";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [templates, tickets, clientPrefix] = await Promise.all([
    prisma.backupTicketTemplate.findMany({
      orderBy: { latestAlertAt: "desc" },
      include: {
        organization: {
          select: { id: true, name: true, logo: true, clientCode: true },
        },
      },
    }),
    listInProcessingTickets(),
    getClientTicketPrefix(),
  ]);

  // Enrichit chaque ticket avec displayNumber (TK-xxxx / INT-xxxx).
  const enrichedTickets = tickets.map((t) => ({
    ...t,
    displayNumber: formatTicketNumber(t.number, t.isInternal, clientPrefix),
  }));

  return NextResponse.json({
    templates,
    tickets: enrichedTickets,
  });
}
