// ============================================================================
// auto-trigger.ts — déclenchement automatique du workflow d'approbation à la
// création d'un ticket (par portail OU par email-to-ticket OU par API interne).
//
// Logique commune :
//   1. L'org a au moins un OrgApprover actif scope=ALL_TICKETS
//   2. Le requester n'est PAS lui-même un approbateur (cf. matching)
//   → on crée les TicketApproval + flag requiresApproval=true + notify
//
// Avant d'extraire ce helper, le hook existait UNIQUEMENT dans la route
// portail. Email-to-ticket créait des tickets SANS jamais déclencher
// l'approbation (bug TK-28688/89/90). Ce helper centralise le pipeline.
// ============================================================================

import prisma from "@/lib/prisma";

interface AutoTriggerInput {
  ticketId: string;
  organizationId: string;
  /** Le requester : contactId (privilégié) + email (fallback pour matching). */
  requester: { contactId?: string | null; email: string | null };
}

interface AutoTriggerResult {
  triggered: boolean;
  approvalCount: number;
  reason?: string;
}

/**
 * Déclenche le workflow d'approbation pour le ticket si l'org a des
 * approbateurs configurés ET le requester n'est pas lui-même approbateur.
 * Best-effort : un échec ici ne doit pas bloquer la création du ticket.
 */
export async function triggerApprovalsForNewTicket(
  input: AutoTriggerInput,
): Promise<AutoTriggerResult> {
  try {
    const approvers = await prisma.orgApprover.findMany({
      where: {
        organizationId: input.organizationId,
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

    if (approvers.length === 0) {
      return { triggered: false, approvalCount: 0, reason: "no_approvers_configured" };
    }

    const reqEmail = (input.requester.email ?? "").trim().toLowerCase();
    const isRequesterAnApprover = approvers.some(
      (a) =>
        (input.requester.contactId && a.contactId === input.requester.contactId) ||
        (reqEmail && a.contactEmail.trim().toLowerCase() === reqEmail),
    );
    if (isRequesterAnApprover) {
      return { triggered: false, approvalCount: 0, reason: "requester_is_approver" };
    }

    const approvalData = approvers
      .filter((a) => !!a.contactEmail)
      .map((a, i) => ({
        ticketId: input.ticketId,
        approverId: a.contactId ?? "",
        approverName: a.contactName,
        approverEmail: a.contactEmail.trim().toLowerCase(),
        role: i === 0 ? "primary" : "secondary",
      }));
    if (approvalData.length === 0) {
      return { triggered: false, approvalCount: 0, reason: "no_valid_approver_emails" };
    }

    await prisma.$transaction([
      prisma.ticketApproval.createMany({ data: approvalData }),
      prisma.ticket.update({
        where: { id: input.ticketId },
        data: { requiresApproval: true, approvalStatus: "PENDING" },
      }),
    ]);

    // Notification fire-and-forget. L'allowlist dev-safety reste gérée
    // par notifyApprovalRequest.
    import("@/lib/approvers/notifications")
      .then(({ notifyApprovalRequest }) =>
        notifyApprovalRequest(input.ticketId).catch((e) =>
          console.warn("[approval-auto-trigger] notify failed:", e),
        ),
      )
      .catch(() => {});

    return { triggered: true, approvalCount: approvalData.length };
  } catch (err) {
    console.error("[approval-auto-trigger] failed:", err);
    return {
      triggered: false,
      approvalCount: 0,
      reason: err instanceof Error ? `error: ${err.message}` : "error",
    };
  }
}
