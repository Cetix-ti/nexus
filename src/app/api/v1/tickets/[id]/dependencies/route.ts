// ============================================================================
// /api/v1/tickets/[id]/dependencies — dépendances chronologiques.
//
// GET renvoie { upstreams, downstreams, blocked } :
//   - upstreams   : tickets que ce ticket attend (amont).
//   - downstreams : tickets qui attendent ce ticket (aval).
//   - blocked     : true si au moins un upstream n'est pas RESOLVED/CLOSED.
//
// POST { upstreamId } crée une dépendance. DELETE ?linkId=xxx la retire.
// Cycles empêchés côté serveur par une vérif BFS simple.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

function isDone(status: string): boolean {
  const s = status.toUpperCase();
  return s === "RESOLVED" || s === "CLOSED";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const [up, down] = await Promise.all([
    prisma.ticketDependency.findMany({
      where: { ticketId: id },
      include: {
        upstream: {
          select: { id: true, number: true, subject: true, status: true },
        },
      },
    }),
    prisma.ticketDependency.findMany({
      where: { upstreamId: id },
      include: {
        ticket: {
          select: { id: true, number: true, subject: true, status: true },
        },
      },
    }),
  ]);

  const blocked = up.some((d) => !isDone(d.upstream.status));

  return NextResponse.json({
    data: {
      upstreams: up.map((d) => ({
        linkId: d.id,
        id: d.upstream.id,
        number: d.upstream.number,
        subject: d.upstream.subject,
        status: d.upstream.status,
        done: isDone(d.upstream.status),
      })),
      downstreams: down.map((d) => ({
        linkId: d.id,
        id: d.ticket.id,
        number: d.ticket.number,
        subject: d.ticket.subject,
        status: d.ticket.status,
      })),
      blocked,
    },
  });
}

// Détecte si ajouter upstreamId → ticketId créerait un cycle.
// On fait un BFS depuis upstreamId en suivant SES propres upstreams : si on
// rencontre ticketId, il y a un cycle.
async function wouldCreateCycle(ticketId: string, upstreamId: string): Promise<boolean> {
  if (ticketId === upstreamId) return true;
  const visited = new Set<string>([upstreamId]);
  let frontier: string[] = [upstreamId];
  while (frontier.length > 0) {
    const rows = await prisma.ticketDependency.findMany({
      where: { ticketId: { in: frontier } },
      select: { upstreamId: true },
    });
    const next: string[] = [];
    for (const r of rows) {
      if (r.upstreamId === ticketId) return true;
      if (!visited.has(r.upstreamId)) {
        visited.add(r.upstreamId);
        next.push(r.upstreamId);
      }
    }
    frontier = next;
  }
  return false;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body?.upstreamId) return NextResponse.json({ error: "upstreamId requis" }, { status: 400 });
  if (body.upstreamId === id) {
    return NextResponse.json({ error: "Un ticket ne peut pas dépendre de lui-même." }, { status: 400 });
  }

  if (await wouldCreateCycle(id, String(body.upstreamId))) {
    return NextResponse.json({ error: "Dépendance cyclique interdite." }, { status: 400 });
  }

  try {
    const row = await prisma.ticketDependency.create({
      data: { ticketId: id, upstreamId: String(body.upstreamId) },
    });
    return NextResponse.json({ data: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Dépendance déjà existante." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const linkId = req.nextUrl.searchParams.get("linkId");
  if (!linkId) return NextResponse.json({ error: "linkId requis" }, { status: 400 });
  await prisma.ticketDependency.deleteMany({
    where: { id: linkId, ticketId: id },
  });
  return NextResponse.json({ success: true });
}
