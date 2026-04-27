import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createTicket, listTickets } from "@/lib/tickets/service";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.permissions.canAccessPortal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;

  // Query DB with organization filter — no client-side filtering needed
  let result = await listTickets({
    organizationId: user.organizationId,
    status: sp.get("status") || undefined,
    search: sp.get("search") || undefined,
  });

  // Standard users only see their own tickets
  if (!user.permissions.canSeeAllOrgTickets) {
    result = result.filter((t) => t.requesterEmail === user.email);
  }

  return NextResponse.json({
    success: true,
    data: result,
    meta: {
      total: result.length,
      organizationId: user.organizationId,
      scope: user.permissions.canSeeAllOrgTickets ? "all_org" : "own_only",
    },
  });
}

/**
 * POST /api/v1/portal/tickets — portal-side ticket creation.
 * Forces requesterId = current contact and organizationId = contact's org.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canAccessPortal || !user.permissions.canCreateTickets) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  if (!body.subject || typeof body.subject !== "string") {
    return NextResponse.json({ error: "subject requis" }, { status: 422 });
  }

  // Resolve category by name if provided
  let categoryId: string | null = null;
  if (body.category && typeof body.category === "string") {
    const cat = await prisma.category.findFirst({
      where: { name: { equals: body.category, mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id ?? null;
  }

  // Resolve a creator User — portal users don't have User records, so use
  // a system fallback (first active SUPER_ADMIN or MSP_ADMIN).
  let creatorId = "";
  const sysUser = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (sysUser) creatorId = sysUser.id;

  try {
    const ticket = await createTicket({
      subject: body.subject.trim(),
      description: body.description || "",
      status: "NEW",
      priority: (body.priority || "medium").toUpperCase(),
      type: "INCIDENT",
      source: "PORTAL",
      organizationId: user.organizationId,
      requesterId: user.contactId,
      categoryId,
      creatorId,
    });

    // Workflow d'approbation automatique côté portail.
    //
    // Logique : si l'org a au moins un OrgApprover actif AVEC scope
    // ALL_TICKETS, et que le contact qui crée le ticket n'est PAS lui-
    // même un approbateur (c-à-d : il est un utilisateur "standard"),
    // on déclenche l'approbation. L'approbateur reçoit un email avec un
    // lien vers le portail pour décider.
    //
    // Si le contact EST un approbateur, on n'exige pas qu'il s'approuve
    // lui-même — son ticket est créé directement (cohérent avec la
    // sémantique "auto-approbation" implicite pour les approbateurs).
    try {
      const approvers = await prisma.orgApprover.findMany({
        where: {
          organizationId: user.organizationId,
          isActive: true,
          scope: "ALL_TICKETS",
        },
        select: {
          id: true,
          contactId: true,
          contactName: true,
          contactEmail: true,
          isPrimary: true,
        },
        orderBy: [{ isPrimary: "desc" }, { level: "asc" }],
      });

      // Le requester est-il lui-même un approbateur ? Match par contactId
      // (privilégié) ou par email normalisé (fallback si la row OrgApprover
      // n'a pas de contactId lié).
      const isRequesterAnApprover = approvers.some(
        (a) =>
          a.contactId === user.contactId ||
          a.contactEmail.trim().toLowerCase() === user.email.trim().toLowerCase(),
      );

      if (approvers.length > 0 && !isRequesterAnApprover) {
        const approvalData = approvers
          .filter((a) => !!a.contactEmail)
          .map((a, i) => ({
            ticketId: ticket.id,
            approverId: a.contactId ?? "",
            approverName: a.contactName,
            approverEmail: a.contactEmail.trim().toLowerCase(),
            role: i === 0 ? "primary" : "secondary",
          }));

        if (approvalData.length > 0) {
          await prisma.$transaction([
            prisma.ticketApproval.createMany({ data: approvalData }),
            prisma.ticket.update({
              where: { id: ticket.id },
              data: { requiresApproval: true, approvalStatus: "PENDING" },
            }),
          ]);

          // Envoi des emails de demande d'approbation — fire-and-forget,
          // gated par l'allowlist dev-safety dans notifyApprovalRequest.
          import("@/lib/approvers/notifications")
            .then(({ notifyApprovalRequest }) =>
              notifyApprovalRequest(ticket.id).catch((e) =>
                console.warn("[portal/tickets] approval notify failed:", e),
              ),
            )
            .catch(() => {});
        }
      }
    } catch (e) {
      // L'approbation est best-effort : si elle échoue, on ne bloque
      // pas la création du ticket. Logue pour investigation.
      console.error("[portal/tickets] approval workflow failed:", e);
    }

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (err) {
    console.error("[portal/tickets POST]", err);
    return NextResponse.json(
      { error: "Erreur lors de la création du ticket" },
      { status: 500 },
    );
  }
}
