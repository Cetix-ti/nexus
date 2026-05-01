// ============================================================================
// /api/v1/tickets/[id]/viewers
//
// Présence des agents sur la page d'un ticket. Heartbeat client toutes
// les 15s + lecture des autres viewers actifs (lastSeenAt > now - 30s).
//
//   POST   → upsert (ticketId, userId) + bump lastSeenAt   (heartbeat)
//   GET    → liste des autres viewers actifs (exclut soi-même)
//   DELETE → supprime sa propre entrée (cleanup au unmount)
//
// Tous les endpoints exigent un agent authentifié. Les CLIENT_* ne sont
// pas trackés (le portail client n'a pas la fonctionnalité présence).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_SECONDS = 30;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  // Garde minimale : on confirme que le ticket existe — sinon le FK
  // upsert remonterait une erreur Prisma cryptique.
  const ticket = await prisma.ticket.findUnique({
    where: { id }, select: { id: true },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.ticketViewer.upsert({
    where: { ticketId_userId: { ticketId: id, userId: me.id } },
    create: { ticketId: id, userId: me.id },
    update: { lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_SECONDS * 1000);
  const viewers = await prisma.ticketViewer.findMany({
    where: {
      ticketId: id,
      lastSeenAt: { gte: cutoff },
      userId: { not: me.id },
    },
    select: {
      userId: true,
      lastSeenAt: true,
      user: {
        select: { firstName: true, lastName: true, avatar: true, email: true },
      },
    },
    orderBy: { lastSeenAt: "desc" },
  });
  return NextResponse.json({
    viewers: viewers.map((v) => ({
      userId: v.userId,
      name: `${v.user.firstName} ${v.user.lastName}`.trim() || v.user.email,
      avatar: v.user.avatar ?? null,
      lastSeenAt: v.lastSeenAt.toISOString(),
    })),
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.ticketViewer
    .delete({
      where: { ticketId_userId: { ticketId: id, userId: me.id } },
    })
    .catch(() => {
      // Pas d'entrée à supprimer = rien à faire (idempotent)
    });
  return NextResponse.json({ ok: true });
}
