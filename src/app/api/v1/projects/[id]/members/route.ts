// ============================================================================
// /api/v1/projects/[id]/members — équipe d'un projet (CRUD).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface Ctx { params: Promise<{ id: string }>; }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    success: true,
    data: members.map((m) => {
      const isContact = !m.userId && !!m.contactId;
      const person = isContact ? m.contact : m.user;
      return {
        id: m.id,
        userId: m.userId ?? null,
        contactId: m.contactId ?? null,
        memberType: isContact ? "contact" : "agent",
        agentName: person ? `${person.firstName} ${person.lastName}`.trim() : "—",
        agentEmail: person?.email ?? "",
        role: m.role,
        allocatedHoursPerWeek: m.allocatedHoursPerWeek,
      };
    }),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();

  // userId XOR contactId : exactement l'un des deux. Évite les doublons
  // (un agent et un contact référencés sur le même membership).
  const hasUser = typeof body.userId === "string" && body.userId.trim() !== "";
  const hasContact = typeof body.contactId === "string" && body.contactId.trim() !== "";
  if (!hasUser && !hasContact) {
    return NextResponse.json({ error: "userId ou contactId requis" }, { status: 400 });
  }
  if (hasUser && hasContact) {
    return NextResponse.json({ error: "Choisir userId OU contactId, pas les deux" }, { status: 400 });
  }

  // Si contact fourni : valide qu'il appartient bien à l'organisation
  // du projet. Pas d'embarqué de contact d'une autre org.
  if (hasContact) {
    const project = await prisma.project.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    const contact = await prisma.contact.findUnique({
      where: { id: String(body.contactId) },
      select: { organizationId: true },
    });
    if (!contact || contact.organizationId !== project.organizationId) {
      return NextResponse.json({ error: "Contact invalide pour ce projet" }, { status: 400 });
    }
  }

  try {
    const member = await prisma.projectMember.create({
      data: {
        projectId: id,
        userId: hasUser ? String(body.userId) : null,
        contactId: hasContact ? String(body.contactId) : null,
        role: body.role ?? "contributor",
        allocatedHoursPerWeek:
          body.allocatedHoursPerWeek != null ? Number(body.allocatedHoursPerWeek) : null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    const isContact = !member.userId && !!member.contactId;
    const person = isContact ? member.contact : member.user;
    return NextResponse.json({
      success: true,
      data: {
        id: member.id,
        userId: member.userId ?? null,
        contactId: member.contactId ?? null,
        memberType: isContact ? "contact" : "agent",
        agentName: person ? `${person.firstName} ${person.lastName}`.trim() : "—",
        agentEmail: person?.email ?? "",
        role: member.role,
        allocatedHoursPerWeek: member.allocatedHoursPerWeek,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Ce membre fait déjà partie du projet." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId requis" }, { status: 400 });
  await prisma.projectMember.deleteMany({
    where: { id: memberId, projectId: id },
  });
  return NextResponse.json({ success: true });
}
