// ============================================================================
// POST /api/v1/tickets/[id]/follow-ups
//
// Crée en batch des tickets de SUIVI liés à un ticket parent. Utilisé
// principalement par l'UI close-audit après que l'agent ait sélectionné
// les suggestions de suivi à transformer en vraies tâches.
//
// Body : {
//   followUps: [
//     { title: string, rationale?: string, priority?: "low"|"medium"|"high", dueInDays?: number }
//   ]
// }
//
// Les tickets créés :
//   - héritent de l'organizationId + categoryId + requesterId du parent
//   - type = SERVICE_REQUEST (tâche planifiée, pas un incident)
//   - source = PORTAL (créé depuis Nexus)
//   - description = rationale (si présent)
//   - dueAt = now + dueInDays * 24h (si présent)
//
// Ces tickets deviennent indépendants (on ne met pas de FK parent) — c'est
// voulu pour qu'ils apparaissent naturellement dans les listes d'agents et
// ne soient pas noyés dans une relation cachée. Le lien est documenté dans
// la description ("Suivi du ticket #123").
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { createTicket } from "@/lib/tickets/service";

interface FollowUpInput {
  title: string;
  rationale?: string;
  priority?: "low" | "medium" | "high";
  dueInDays?: number;
}

const PRIORITY_MAP: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};

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

  const parent = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      subject: true,
      organizationId: true,
      categoryId: true,
      requesterId: true,
      assigneeId: true,
    },
  });
  if (!parent) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const input: FollowUpInput[] = Array.isArray(body.followUps)
    ? (body.followUps as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x) => ({
          title: String(x.title ?? "").trim(),
          rationale:
            typeof x.rationale === "string" ? x.rationale.trim() : undefined,
          priority:
            x.priority === "low" || x.priority === "medium" || x.priority === "high"
              ? (x.priority as "low" | "medium" | "high")
              : undefined,
          dueInDays:
            typeof x.dueInDays === "number" && Number.isFinite(x.dueInDays)
              ? Math.max(0, Math.min(60, Math.round(x.dueInDays)))
              : undefined,
        }))
        .filter((x) => x.title.length > 0)
        .slice(0, 5)
    : [];

  if (input.length === 0) {
    return NextResponse.json(
      { error: "Au moins un followUp avec title est requis." },
      { status: 400 },
    );
  }

  const created: Array<{
    id: string;
    number: string;
    subject: string;
  }> = [];
  for (const f of input) {
    const description =
      [
        f.rationale ?? "",
        "",
        `— Suivi automatique du ticket #${parent.number} « ${parent.subject} »`,
      ]
        .filter(Boolean)
        .join("\n")
        .trim();

    const dueAt =
      f.dueInDays != null
        ? new Date(Date.now() + f.dueInDays * 24 * 60 * 60 * 1000)
        : null;

    const t = await createTicket({
      organizationId: parent.organizationId,
      subject: f.title,
      description,
      priority: PRIORITY_MAP[f.priority ?? "medium"] ?? "MEDIUM",
      type: "SERVICE_REQUEST",
      source: "PORTAL",
      categoryId: parent.categoryId,
      requesterId: parent.requesterId,
      assigneeId: parent.assigneeId,
      creatorId: me.id,
    });
    created.push({ id: t.id, number: t.number, subject: t.subject });

    // Applique dueAt séparément (createTicket ne l'expose pas dans l'interface)
    if (dueAt) {
      await prisma.ticket.update({
        where: { id: t.id },
        data: { dueAt },
      });
    }
  }

  return NextResponse.json({ created, count: created.length }, { status: 201 });
}
