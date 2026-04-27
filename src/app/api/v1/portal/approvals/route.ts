import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";

/** GET — list pending approvals for the current portal user */
export async function GET() {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!user.permissions.canAccessPortal) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const approvals = await prisma.ticketApproval.findMany({
    where: {
      approverEmail: { equals: user.email, mode: "insensitive" },
    },
    include: {
      ticket: {
        select: {
          id: true,
          number: true,
          subject: true,
          description: true,
          descriptionHtml: true,
          status: true,
          priority: true,
          type: true,
          createdAt: true,
          organization: { select: { name: true } },
          requester: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Portail client : tickets toujours non-internes (filtre business).
  const clientPrefix = await getClientTicketPrefix();

  // Strip basique du HTML pour produire un excerpt texte propre. La
  // description peut contenir du HTML (emails ingérés, Tiptap), et la
  // simple slice() précédente affichait les balises brutes côté UI.
  // Pour un rendu riche, on expose aussi descriptionHtml.
  function plainExcerpt(html: string | null, raw: string | null, max = 500): string {
    const source = html || raw || "";
    const stripped = source
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, max);
  }

  return NextResponse.json({
    success: true,
    data: approvals.map((a) => ({
      id: a.id,
      ticketId: a.ticketId,
      role: a.role,
      status: a.status,
      comment: a.comment,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      ticket: {
        id: a.ticket.id,
        number: a.ticket.number,
        displayNumber: formatTicketNumber(a.ticket.number, false, clientPrefix),
        subject: a.ticket.subject,
        // Texte propre (sans balises) — affiché dans la liste / aperçu
        description: plainExcerpt(a.ticket.descriptionHtml, a.ticket.description, 500),
        // HTML riche complet — pour un rendu fidèle dans une zone "Voir
        // tout" (avec images inline base64, mise en forme, etc.)
        descriptionHtml: a.ticket.descriptionHtml ?? null,
        status: a.ticket.status,
        priority: a.ticket.priority,
        type: a.ticket.type,
        organizationName: a.ticket.organization?.name ?? "—",
        requesterName: a.ticket.requester
          ? `${a.ticket.requester.firstName} ${a.ticket.requester.lastName}`
          : "—",
        createdAt: a.ticket.createdAt.toISOString(),
      },
    })),
    meta: {
      total: approvals.length,
      pending: approvals.filter((a) => a.status === "PENDING").length,
    },
  });
}

/** PATCH — approve or reject a specific approval */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json();
  const { approvalId, decision, comment } = body;

  if (!approvalId || !["APPROVED", "REJECTED"].includes(decision)) {
    return NextResponse.json(
      { error: "approvalId et decision (APPROVED|REJECTED) requis" },
      { status: 400 },
    );
  }

  // Verify this approval belongs to the current user
  const approval = await prisma.ticketApproval.findUnique({
    where: { id: approvalId },
    include: { ticket: { select: { id: true, organizationId: true } } },
  });

  if (!approval) {
    return NextResponse.json({ error: "Approbation introuvable" }, { status: 404 });
  }

  if (approval.approverEmail.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  if (approval.ticket.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Update the approval
  await prisma.ticketApproval.update({
    where: { id: approvalId },
    data: {
      status: decision,
      comment: comment || null,
      decidedAt: new Date(),
    },
  });

  // Recalculate overall ticket approval status
  const allApprovals = await prisma.ticketApproval.findMany({
    where: { ticketId: approval.ticketId },
  });

  let overallStatus: "PENDING" | "APPROVED" | "REJECTED" = "PENDING";
  if (allApprovals.some((a) => a.status === "REJECTED")) {
    overallStatus = "REJECTED";
  } else if (allApprovals.every((a) => a.status === "APPROVED")) {
    overallStatus = "APPROVED";
  }

  await prisma.ticket.update({
    where: { id: approval.ticketId },
    data: { approvalStatus: overallStatus },
  });

  // Notification aux agents watchers (assignee, créateur, collaborateurs)
  // que l'approbateur a rendu sa décision — fire-and-forget, respect prefs.
  import("@/lib/approvers/notifications")
    .then((m) =>
      m.notifyApprovalDecided({
        ticketId: approval.ticketId,
        decision,
        approverName: approval.approverName || user.email,
        comment: comment || null,
      }),
    )
    .catch(() => {});

  // Create activity log
  await prisma.activity.create({
    data: {
      ticketId: approval.ticketId,
      action: "approval_decision",
      field: "approvalStatus",
      oldValue: "PENDING",
      newValue: decision,
      metadata: {
        approverName: approval.approverName,
        approverEmail: approval.approverEmail,
        comment: comment || null,
        content: `${approval.approverName} a ${decision === "APPROVED" ? "approuvé" : "rejeté"} le ticket`,
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      approvalId,
      decision,
      overallStatus,
    },
  });
}
