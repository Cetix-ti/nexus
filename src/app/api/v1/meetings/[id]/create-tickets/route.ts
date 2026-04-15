import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * POST /api/v1/meetings/[id]/create-tickets
 * Body: { tickets: [{ subject, description, priority, assigneeId? }] }
 *
 * Crée des tickets INTERNES (isInternal=true) liés à la rencontre.
 * Ils apparaissent dans /internal-tickets et plus dans /tickets.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const input: Array<{
    subject: string;
    description?: string;
    priority?: string;
    assigneeId?: string;
  }> = body.tickets ?? [];

  if (!Array.isArray(input) || input.length === 0) {
    return NextResponse.json({ error: "tickets[] requis" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!meeting) return NextResponse.json({ error: "Meeting introuvable" }, { status: 404 });

  // Les tickets internes n'ont pas d'organisation client — on les accroche
  // à la première organisation marquée comme "Cetix" (interne) ou, à
  // défaut, à la première org active. Sans ce champ dédié, on réutilise
  // l'organizationId existant (requis par le schéma Ticket).
  const cetixOrg =
    (await prisma.organization.findFirst({
      where: {
        OR: [
          { clientCode: "CTX" },
          { name: { equals: "Cetix", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    })) ??
    (await prisma.organization.findFirst({ select: { id: true } }));

  if (!cetixOrg) {
    return NextResponse.json(
      { error: "Aucune organisation pour rattacher les tickets internes" },
      { status: 500 },
    );
  }

  const priorityMap: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
    low: "LOW",
    medium: "MEDIUM",
    high: "HIGH",
    critical: "CRITICAL",
  };

  const created: Array<{ id: string; number: number; subject: string }> = [];
  for (const t of input) {
    if (!t.subject) continue;
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: cetixOrg.id,
        creatorId: me.id,
        assigneeId: t.assigneeId ?? null,
        subject: t.subject,
        description:
          (t.description ?? "") +
          `\n\n— Généré depuis la rencontre « ${meeting.title} »`,
        status: "NEW",
        priority: priorityMap[(t.priority ?? "medium").toLowerCase()] ?? "MEDIUM",
        type: "SERVICE_REQUEST",
        source: "PORTAL",
        isInternal: true,
        meetingId: id,
      },
      select: { id: true, number: true, subject: true },
    });
    created.push(ticket);
  }

  return NextResponse.json({ created, count: created.length }, { status: 201 });
}
