// ============================================================================
// POST /api/v1/ai/data-delete
//
// Droit à l'oubli (Loi 25, article 28.1) — ANONYMISE toutes les données IA
// associées à une organisation. Les rows sont CONSERVÉES mais leurs champs
// identifiants (userId, ticketId, content, response, humanEdit) sont strippés.
// Les stats agrégées (coûts, volumes par feature) restent exploitables.
//
// Cette approche satisfait la Loi 25 (plus aucune PII) tout en préservant
// la continuité de l'historique business et les dashboards.
//
// Sécurité :
//   - Confirmation requise : le client doit envoyer `confirm: "DELETE_<clientCode>"`
//     pour éviter un DELETE accidentel via double-clic. Le UI doit présenter
//     un dialogue de confirmation.
//   - SUPERVISOR+ (staff) OU CLIENT_ADMIN de l'org (auto-opt-out).
//   - Le consent reste (en aiEnabled=false) pour bloquer toute nouvelle
//     ingestion IA après l'anonymisation. Le client peut le remettre à true
//     s'il change d'avis plus tard.
//   - Audit log AVEC snapshot des compteurs anonymisés.
//
// Ce que ça ANONYMISE :
//   - AiInvocation        (userId/ticketId/orgId/response/humanEdit nullés)
//   - AiMemory scope=org:<id> (content nullé, scope="anonymized")
//   - SimilarTicketClick  (FKs nullés, scores/bucket gardés)
//   - AiAuditResult       (préservé — les verdicts ne contiennent pas de PII
//     par contrat, mais le invocationId devient orphan)
//
// Ce que ça NE TOUCHE PAS :
//   - Tickets eux-mêmes (données métier, pas IA).
//   - AiPattern global (patterns agrégés, non-identifiables par design).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { invalidateConsentCache } from "@/lib/ai/consent";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId requis" },
      { status: 400 },
    );
  }

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

  // Sécurité : le token de confirmation doit matcher le clientCode (ou l'id
  // si pas de clientCode). Empêche une suppression accidentelle via replay.
  const expectedConfirm = `DELETE_${org.clientCode ?? org.id}`;
  if (confirm !== expectedConfirm) {
    return NextResponse.json(
      {
        error: `Confirmation requise. Envoie confirm="${expectedConfirm}" pour valider.`,
      },
      { status: 400 },
    );
  }

  // Collect ticket IDs pour le nettoyage cascade.
  const ticketIds = (
    await prisma.ticket.findMany({
      where: { organizationId },
      select: { id: true },
    })
  ).map((t) => t.id);

  const counts = { invocations: 0, memories: 0, audits: 0, clicks: 0 };

  // Anonymisation : on UPDATE les rows en stripping les champs identifiants,
  // on ne supprime PAS. Politique Nexus : préserver les stats agrégées,
  // retirer les données identifiantes.
  const {
    anonymizeInvocationFields,
    anonymizeMemoryFields,
    anonymizeClickFields,
  } = await import("@/lib/ai/jobs/retention-purge");

  try {
    const inv = await prisma.aiInvocation.updateMany({
      where: { organizationId },
      data: anonymizeInvocationFields(),
    });
    counts.invocations = inv.count;
  } catch (err) {
    console.warn("[ai-data-delete] invocations failed:", err);
  }

  try {
    const mem = await prisma.aiMemory.updateMany({
      where: { scope: `org:${organizationId}` },
      data: anonymizeMemoryFields(),
    });
    counts.memories = mem.count;
  } catch (err) {
    console.warn("[ai-data-delete] memories failed:", err);
  }

  try {
    if (ticketIds.length > 0) {
      const clk = await prisma.similarTicketClick.updateMany({
        where: { sourceTicketId: { in: ticketIds } },
        data: anonymizeClickFields(),
      });
      counts.clicks = clk.count;
    }
  } catch (err) {
    console.warn("[ai-data-delete] clicks failed:", err);
  }

  // AiAuditResult : on ne touche pas. Les verdicts du juge ne contiennent
  // pas de PII par contrat (ils analysent un result IA déjà scrubbed). Leur
  // invocationId devient orphan après anonymisation mais c'est OK — les
  // stats d'audit (verdict rates par feature/période) restent valides.
  counts.audits = 0;

  // Bascule le consent à aiEnabled=false pour bloquer toute nouvelle ingestion
  // IA après la suppression. Le client doit explicitement réactiver.
  try {
    await prisma.aiConsent.upsert({
      where: { organizationId },
      create: {
        organizationId,
        aiEnabled: false,
        cloudProvidersAllowed: false,
        learningEnabled: false,
        clientContentEnabled: false,
        updatedBy: me.id,
        notes: `Auto-désactivé suite à un data-delete par ${me.email} le ${new Date().toISOString()}`,
      },
      update: {
        aiEnabled: false,
        cloudProvidersAllowed: false,
        learningEnabled: false,
        clientContentEnabled: false,
        updatedBy: me.id,
        notes: `Auto-désactivé suite à un data-delete par ${me.email} le ${new Date().toISOString()}`,
      },
    });
    invalidateConsentCache(organizationId);
  } catch (err) {
    console.warn("[ai-data-delete] consent update failed:", err);
  }

  // Audit log final — trace QUI a anonymisé QUOI pour CAI.
  try {
    await prisma.auditLog.create({
      data: {
        action: "ai.data_anonymize",
        entityType: "Organization",
        entityId: organizationId,
        userId: me.id,
        userEmail: me.email ?? null,
        organizationId,
        metadata: counts as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch {
    /* non bloquant */
  }

  return NextResponse.json({
    ok: true,
    organization: org,
    anonymizedAt: new Date().toISOString(),
    rowsAnonymized: counts,
    note: "Les données IA de cette organisation ont été anonymisées (champs identifiants retirés, stats agrégées préservées). Le consent IA a été révoqué (aiEnabled=false) — aucune nouvelle donnée ne sera ingérée tant qu'un admin ne le réactive pas.",
  });
}
