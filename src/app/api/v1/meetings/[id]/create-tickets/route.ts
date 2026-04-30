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

  // Les tickets internes s'accrochent à l'organisation marquée
  // `isInternal=true` (Cetix). Si aucune org interne n'existe encore
  // (base non-seedée), on refuse explicitement plutôt que de créer les
  // tickets dans une org client au hasard — ce qui pollue les rapports.
  const internalOrg = await prisma.organization.findFirst({
    where: { isInternal: true },
    select: { id: true, name: true },
  });
  if (!internalOrg) {
    return NextResponse.json(
      {
        error:
          "Aucune organisation interne définie. Marque l'organisation Cetix comme interne dans Paramètres → Organisations avant de créer des tickets internes.",
      },
      { status: 412 },
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
        organizationId: internalOrg.id,
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

    // Triage IA fire-and-forget — auto-catégorisation systématique.
    import("@/lib/ai/features/triage")
      .then((m) => m.triageTicketAsync(ticket.id))
      .catch(() => {});
  }

  return NextResponse.json({ created, count: created.length }, { status: 201 });
}
