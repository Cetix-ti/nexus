// ============================================================================
// POST /api/v1/ai/data-export
//
// Droit d'accès (Loi 25, article 32) — retourne l'ensemble des données IA
// associées à une organisation sous forme d'un JSON structuré downloadable.
// Permet à un client de vérifier TOUT ce que Nexus a traité via IA sur son
// compte : invocations, mémoires extraites, feedback agrégé, consent actif.
//
// Scope : SUPERVISOR+ (cetix admin) OU client admin de la même org via portail.
// Body : { organizationId: string }
// Réponse : JSON structuré — l'UI déclenche un download côté navigateur.
//
// Volume typique : 1 an de données = ~5-20 MB par org. Gros clients = plus.
// Pas de pagination pour l'instant (CAI attend un dump complet).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : "";
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId requis" },
      { status: 400 },
    );
  }

  // Autorisation : staff (SUPERVISOR+) peut exporter toute org ; admin client
  // peut exporter son own org uniquement.
  const isStaff = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isStaff) {
    const membership = await prisma.userOrganization.findFirst({
      where: {
        userId: me.id,
        organizationId,
        role: { in: ["CLIENT_ADMIN"] },
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, clientCode: true },
  });
  if (!org) {
    return NextResponse.json(
      { error: "Organisation introuvable" },
      { status: 404 },
    );
  }

  const [invocations, memories, consent] = await Promise.all([
    prisma.aiInvocation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiMemory.findMany({
      where: { scope: `org:${organizationId}` },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiConsent.findUnique({ where: { organizationId } }),
  ]);

  // SimilarTicketClick + AiAuditResult : pas de champ organizationId direct,
  // on résout via les ids (tickets de l'org ou invocations de l'org).
  const orgTicketIds = (
    await prisma.ticket.findMany({
      where: { organizationId },
      select: { id: true },
    })
  ).map((t) => t.id);

  const [resolvedClicks, auditResults] = await Promise.all([
    orgTicketIds.length > 0
      ? prisma.similarTicketClick.findMany({
          where: { sourceTicketId: { in: orgTicketIds } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    invocations.length > 0
      ? prisma.aiAuditResult.findMany({
          where: { invocationId: { in: invocations.map((i) => i.id) } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  // Log d'accès pour audit CAI (qui a exporté quoi, quand).
  try {
    await prisma.auditLog.create({
      data: {
        action: "ai.data_export",
        entityType: "Organization",
        entityId: organizationId,
        userId: me.id,
        userEmail: me.email ?? null,
        organizationId,
        metadata: {
          rowsExported: {
            invocations: invocations.length,
            memories: memories.length,
            auditResults: auditResults.length,
            similarClicks: resolvedClicks.length,
          },
        },
      },
    });
  } catch {
    /* non bloquant */
  }

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      organization: org,
      consent: consent ?? { note: "Aucun consent explicite (défauts appliqués)" },
      invocations,
      memories,
      similarClicks: resolvedClicks,
      auditResults,
      // Note pour le client : ce JSON contient uniquement les données
      // traitées par Nexus/IA. Les données sources (tickets, assets,
      // contacts) ne sont PAS incluses — usage des endpoints standards
      // pour y accéder.
      _meta: {
        schema: "nexus-ai-export-v1",
        coverage: [
          "AiInvocation (appels IA + audit trail)",
          "AiMemory (faits appris, scope org)",
          "AiConsent (consentement actif)",
          "SimilarTicketClick (clics tickets similaires sur tickets de l'org)",
          "AiAuditResult (verdicts du juge IA sur les invocations de l'org)",
        ],
        notes: [
          "AiCategoryFeedback est une table globale sans lien org — exclue volontairement de l'export.",
          "AiPattern et centroids sont globaux/anonymisés — non-identifiables pour une org.",
        ],
      },
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="nexus-ai-export-${org.clientCode ?? organizationId}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    },
  );
}
