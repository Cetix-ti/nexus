// ============================================================================
// GET /api/v1/ai/pending-facts
//
// Vue globale des faits AiMemory en attente de validation, toutes organisations
// confondues. Utile après un bulk-extract-facts pour qu'un SUPERVISOR+ puisse
// passer rapidement en revue tout ce que l'IA a proposé sans avoir à visiter
// chaque org une par une.
//
// Filtrage :
//   - verifiedAt = null ET rejectedAt = null
//   - exclut les faits "manual:*" (déjà auto-validés, ne devraient pas tomber
//     ici mais filet de sécurité)
//   - scope commence par "org:" (on ignore les faits globaux/user)
//
// Réponse : facts avec orgId/orgName/orgSlug résolus + total par org.
// Limite hard à 500 pour éviter un payload énorme ; si c'est la limite,
// l'admin doit faire son triage avant d'en demander plus.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET() {
  const __aiGuard = await requireAiPermission("ai.view");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  const rows = await prisma.aiMemory.findMany({
    where: {
      verifiedAt: null,
      rejectedAt: null,
      scope: { startsWith: "org:" },
      NOT: { source: { startsWith: "manual:" } },
    },
    select: {
      id: true,
      scope: true,
      category: true,
      content: true,
      source: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Résolution des org ids → noms en un seul query groupé.
  const orgIds = Array.from(
    new Set(
      rows
        .map((r) => (r.scope.startsWith("org:") ? r.scope.slice(4) : null))
        .filter((x): x is string => x !== null),
    ),
  );
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true, slug: true },
  });
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  // Résolution des tickets sources — pour que l'admin clique et vérifie
  // l'évidence avant de valider.
  const TICKET_SOURCE_RE = /^extracted:ticket:(.+)$/;
  const ticketIds = Array.from(
    new Set(
      rows
        .map((r) => {
          const m = r.source?.match(TICKET_SOURCE_RE);
          return m ? m[1] : null;
        })
        .filter((x): x is string => x !== null),
    ),
  );
  const tickets = ticketIds.length
    ? await prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, number: true, subject: true },
      })
    : [];
  const ticketMap = new Map(tickets.map((t) => [t.id, t]));

  const facts = rows.map((r) => {
    const orgId = r.scope.startsWith("org:") ? r.scope.slice(4) : "";
    const org = orgMap.get(orgId);
    const sourceMatch = r.source?.match(TICKET_SOURCE_RE);
    const sourceTicket = sourceMatch ? ticketMap.get(sourceMatch[1]) : null;
    return {
      id: r.id,
      orgId,
      orgName: org?.name ?? "(organisation supprimée)",
      orgSlug: org?.slug ?? null,
      category: r.category,
      content: r.content,
      source: r.source,
      sourceTicket: sourceTicket
        ? {
            id: sourceTicket.id,
            number: sourceTicket.number,
            subject: sourceTicket.subject,
          }
        : null,
      createdAt: r.createdAt,
    };
  });

  // Compte par org pour affichage résumé.
  const byOrg: Record<string, { orgId: string; orgName: string; count: number }> =
    {};
  for (const f of facts) {
    if (!byOrg[f.orgId]) {
      byOrg[f.orgId] = { orgId: f.orgId, orgName: f.orgName, count: 0 };
    }
    byOrg[f.orgId].count += 1;
  }

  return NextResponse.json({
    total: facts.length,
    truncated: facts.length === 500,
    byOrg: Object.values(byOrg).sort((a, b) => b.count - a.count),
    facts,
  });
}
