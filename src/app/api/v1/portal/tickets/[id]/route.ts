import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!user.permissions.canAccessPortal) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { id } = await params;

  // Visibilité des commentaires côté portail :
  //  - PUBLIC          : tout le monde
  //  - ADMIN_APPROVERS : admins portail + approbateurs (même org)
  //  - INTERNAL        : agents seulement → JAMAIS exposé au portail
  // Un user portail "élargi" est admin OU listé dans org_approvers
  // pour son organisation. Dans les deux cas il peut voir les notes
  // ADMIN_APPROVERS, sinon il ne voit que les PUBLIC.
  const isPortalAdmin = user.portalRole === "ADMIN";
  let isApprover = false;
  if (!isPortalAdmin) {
    const approverRow = await prisma.orgApprover.findFirst({
      where: {
        organizationId: user.organizationId,
        contactEmail: user.email,
        isActive: true,
      },
      select: { id: true },
    });
    isApprover = !!approverRow;
  }
  const allowedVisibilities = isPortalAdmin || isApprover
    ? ["PUBLIC", "ADMIN_APPROVERS"]
    : ["PUBLIC"];

  // Find ticket by id or number, scoped to the portal user's organization
  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [{ id }, { number: parseInt(id) || -1 }],
      organizationId: user.organizationId,
    },
    include: {
      organization: { select: { name: true } },
      requester: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      assignee: {
        select: { firstName: true, lastName: true, avatar: true },
      },
      category: { select: { name: true } },
      queue: { select: { name: true } },
      approvals: {
        // decidedAt + comment exposés au requester pour qu'il sache
        // QUAND l'approbateur a tranché (visibilité sur le délai
        // d'approbation — si ça a pris 3 jours, ce n'est pas Cetix qui
        // a tardé, c'est l'approbateur).
        select: {
          id: true,
          approverName: true,
          approverEmail: true,
          status: true,
          decidedAt: true,
          comment: true,
          createdAt: true,
        },
      },
      comments: {
        // Filtre par visibility selon le rôle. INTERNAL est exclu
        // dans les deux cas — agents only.
        where: {
          isInternal: false,
          visibility: { in: allowedVisibilities },
        },
        include: {
          author: {
            select: { firstName: true, lastName: true, avatar: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json(
      { success: false, error: "Billet introuvable" },
      { status: 404 },
    );
  }

  // Standard portal users can only see their own tickets
  if (!user.permissions.canSeeAllOrgTickets) {
    if (ticket.requester?.email?.toLowerCase() !== user.email) {
      return NextResponse.json(
        { success: false, error: "Accès refusé" },
        { status: 403 },
      );
    }
  }

  const clientPrefix = await getClientTicketPrefix();

  return NextResponse.json({
    success: true,
    data: {
      id: ticket.id,
      number: ticket.number,
      // Portail client : org est toujours non-interne → préfixe client.
      displayNumber: formatTicketNumber(ticket.number, false, clientPrefix),
      subject: ticket.subject,
      description: ticket.description,
      // HTML safe (sanitizé par le pipeline d'ingestion). Le portail
      // l'affichera via dangerouslySetInnerHTML pour préserver le fil
      // de conversation Outlook complet.
      descriptionHtml: ticket.descriptionHtml ?? null,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      organizationName: ticket.organization?.name ?? "—",
      requesterName: ticket.requester
        ? `${ticket.requester.firstName} ${ticket.requester.lastName}`
        : "—",
      requesterEmail: ticket.requester?.email ?? "",
      assigneeName: ticket.assignee
        ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
        : null,
      assigneeAvatar: ticket.assignee?.avatar ?? null,
      categoryName: ticket.category?.name ?? "—",
      queueName: ticket.queue?.name ?? "—",
      // Approval workflow — exposé pour la bannière "En attente
      // d'approbation" + l'overlay statut côté portail.
      requiresApproval: ticket.requiresApproval,
      approvalStatus: ticket.approvalStatus?.toLowerCase() ?? "not_required",
      approvalLockOverride: ticket.approvalLockOverride,
      approvers: ticket.approvals.map((a) => ({
        id: a.id,
        name: a.approverName,
        email: a.approverEmail,
        status: a.status.toLowerCase(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
        comment: a.comment ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      dueAt: ticket.dueAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      comments: ticket.comments.map((c) => ({
        id: c.id,
        authorName: c.author
          ? `${c.author.firstName} ${c.author.lastName}`
          : "Système",
        authorAvatar: c.author?.avatar ?? null,
        content: c.body,
        // Même logique que sur la fiche agent : on expose le HTML
        // sanitizé pour que le portail rende fidèlement les replies
        // par courriel (tableaux, signatures, fils Outlook).
        contentHtml: c.bodyHtml ?? null,
        source: (c as { source?: string | null }).source ?? null,
        isInternal: false,
        // visibility pour que le portail puisse afficher un badge
        // "Visible aux admins+approbateurs" sur les notes restreintes.
        visibility: c.visibility,
        createdAt: c.createdAt.toISOString(),
      })),
      // Hint pour l'UI portail : indique si l'utilisateur courant a
      // accès aux notes ADMIN_APPROVERS — pour activer le sélecteur
      // de visibilité dans le composer.
      portalCanWritePrivateNotes: isPortalAdmin || isApprover,
    },
  });
}
