// ============================================================================
// POST /api/v1/tickets/[id]/ai-assist
//
// Déclenche l'assistant de réponse IA — brouillon + diagnostic + commandes
// + tickets similaires résolus. Retourne le résultat structuré. Ne modifie
// RIEN côté ticket : l'UI affiche le résultat dans un panneau, le tech
// copie/édite ce qu'il veut.
//
// GET renvoie la dernière invocation response_assist pour ce ticket (si
// l'UI veut afficher le résultat précédent sans relancer).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assistResponse } from "@/lib/ai/features/response-assist";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const result = await assistResponse(id);
  if (!result) {
    return NextResponse.json(
      { error: "L'assistance IA n'a pas pu être générée." },
      { status: 502 },
    );
  }

  const invocation = await prisma.aiInvocation.findFirst({
    where: { ticketId: id, feature: "response_assist" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return NextResponse.json({
    result,
    invocationId: invocation?.id,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const row = await prisma.aiInvocation.findFirst({
    where: { ticketId: id, feature: "response_assist", status: "ok" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      modelName: true,
      response: true,
      latencyMs: true,
      costCents: true,
      createdAt: true,
    },
  });
  if (!row || !row.response) {
    return NextResponse.json({ assist: null });
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(row.response);
  } catch {
    // Invalide → renvoie null, UI relance
  }
  return NextResponse.json({
    assist: {
      invocationId: row.id,
      provider: row.provider,
      modelName: row.modelName,
      latencyMs: row.latencyMs,
      costCents: row.costCents,
      generatedAt: row.createdAt,
      result: parsed,
    },
  });
}
