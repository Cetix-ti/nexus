// ============================================================================
// /api/v1/time-entries/[id]/audit
//
// GET — historique complet des actions sur une saisie de temps.
// Pour transparence/conformité, accessible au propriétaire de la saisie
// ET aux SUPERVISOR+. Hydrate l'identité de l'acteur quand disponible.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    select: { id: true, agentId: true, organizationId: true },
  });
  if (!entry) {
    return NextResponse.json({ error: "Saisie introuvable" }, { status: 404 });
  }
  // Owner ou SUPERVISOR+
  const isOwner = entry.agentId === me.id;
  const isSup = hasMinimumRole(me.role, "SUPERVISOR");
  if (!isOwner && !isSup) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const logs = await prisma.timeEntryAuditLog.findMany({
    where: { timeEntryId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  // Hydrate les acteurs en bulk (évite N+1).
  const actorIds = Array.from(
    new Set(logs.map((l) => l.actorUserId).filter((x): x is string => !!x)),
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return NextResponse.json({
    data: logs.map((l) => {
      const actor = l.actorUserId ? actorMap.get(l.actorUserId) ?? null : null;
      return {
        id: l.id,
        action: l.action,
        actor: actor
          ? {
              id: actor.id,
              fullName: `${actor.firstName} ${actor.lastName}`.trim() || actor.email,
              email: actor.email,
            }
          : null,
        from: l.fromValue,
        to: l.toValue,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
      };
    }),
  });
}
