// ============================================================================
// GET  /api/v1/supervision — liste les relations de supervision
// POST /api/v1/supervision — crée une relation superviseur → agent
// DELETE /api/v1/supervision?id=xxx — supprime une relation
//
// Accessible par SUPER_ADMIN uniquement pour POST/DELETE.
// GET retourne les relations du user connecté (ses supervisés).
// ?all=true retourne TOUTES les relations (pour settings admin).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true";

  const where = all && (me.role === "SUPER_ADMIN" || me.role === "MSP_ADMIN")
    ? {}
    : { supervisorId: me.id };

  const rows = await prisma.agentSupervision.findMany({
    where,
    include: {
      supervisor: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      agent: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, role: true } },
    },
    orderBy: [{ supervisor: { firstName: "asc" } }, { agent: { firstName: "asc" } }],
  });

  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { supervisorId?: string; agentId?: string }
    | null;
  if (!body?.supervisorId || !body?.agentId) {
    return NextResponse.json({ error: "supervisorId et agentId requis" }, { status: 400 });
  }
  if (body.supervisorId === body.agentId) {
    return NextResponse.json({ error: "Un agent ne peut pas se superviser lui-même" }, { status: 400 });
  }

  const existing = await prisma.agentSupervision.findUnique({
    where: { supervisorId_agentId: { supervisorId: body.supervisorId, agentId: body.agentId } },
  });
  if (existing) return NextResponse.json({ item: existing }, { status: 200 });

  const created = await prisma.agentSupervision.create({
    data: { supervisorId: body.supervisorId, agentId: body.agentId },
    include: {
      supervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return NextResponse.json({ item: created }, { status: 201 });
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  await prisma.agentSupervision.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
