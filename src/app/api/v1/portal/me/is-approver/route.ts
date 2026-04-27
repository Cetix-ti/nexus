import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

/**
 * GET /api/v1/portal/me/is-approver
 *
 * Retourne `{ isApprover: boolean, pendingCount: number }` pour
 * l'utilisateur portail courant. Utilisé par le layout portail pour
 * conditionner l'affichage de l'entrée "Approbations" dans la sidebar.
 *
 * Un user est "approbateur" si AU MOINS UNE des conditions suivantes
 * est vraie :
 *   1. Il est listé comme `OrgApprover` actif pour son org (config
 *      explicite dans Paramètres > Approbateurs)
 *   2. Il a au moins une `TicketApproval` en attente dans son inbox
 *      (rétro-compat : si l'admin n'a pas formalisé la liste mais
 *      qu'on lui a quand même attribué une approbation)
 */
export async function GET() {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ isApprover: false, pendingCount: 0 });

  const email = user.email.trim().toLowerCase();

  const [orgApprover, pendingCount] = await Promise.all([
    prisma.orgApprover.findFirst({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        OR: [
          { contactEmail: { equals: email, mode: "insensitive" } },
          ...(user.contactId ? [{ contactId: user.contactId }] : []),
        ],
      },
      select: { id: true },
    }),
    prisma.ticketApproval.count({
      where: {
        approverEmail: { equals: email, mode: "insensitive" },
        status: "PENDING",
      },
    }),
  ]);

  const isApprover = !!orgApprover || pendingCount > 0;
  return NextResponse.json({ isApprover, pendingCount });
}
