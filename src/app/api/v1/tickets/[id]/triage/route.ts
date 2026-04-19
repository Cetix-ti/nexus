// ============================================================================
// Triage IA manuel — endpoints GET + POST pour la fiche ticket.
//
// POST : relance le triage (utile si le ticket a été édité, ou si le triage
//        initial est vieux et les catégories ont évolué depuis). Retourne
//        le résultat frais + l'invocationId.
// GET  : récupère le DERNIER triage logué dans AiInvocation pour ce ticket.
//        Réponse null si aucun triage n'a encore été lancé.
//
// Les écritures auto-conservatives (catégorie, priorité) ne sont PAS
// refaites par le POST — l'endpoint manuel est purement consultatif. Le
// tech peut appliquer les suggestions via les boutons de l'UI qui
// appelleront les endpoints PATCH standard du ticket.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { triageTicket } from "@/lib/ai/features/triage";

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
    where: { ticketId: id, feature: "triage", status: "ok" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      modelName: true,
      response: true,
      latencyMs: true,
      costCents: true,
      createdAt: true,
      humanAction: true,
    },
  });
  if (!row || !row.response) {
    return NextResponse.json({ triage: null });
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(row.response);
  } catch {
    // Réponse tronquée ou invalide — on renvoie l'invocation sans parsed
    // pour que l'UI affiche un état dégradé plutôt que 500.
  }
  return NextResponse.json({
    triage: {
      invocationId: row.id,
      provider: row.provider,
      modelName: row.modelName,
      latencyMs: row.latencyMs,
      costCents: row.costCents,
      generatedAt: row.createdAt,
      humanAction: row.humanAction,
      result: parsed,
    },
  });
}

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

  // Vérifie que le ticket existe et que l'utilisateur peut l'éditer
  // (on réutilise la visibilité standard : staff voit tout).
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
  }

  const result = await triageTicket(id);
  if (!result) {
    return NextResponse.json(
      { error: "Le triage n'a pas pu être généré (voir logs serveur)." },
      { status: 502 },
    );
  }

  // Récupère l'invocationId frais pour que l'UI puisse remonter
  // l'humanAction via /api/v1/ai/invocations/[id]/action (à créer plus tard).
  const invocation = await prisma.aiInvocation.findFirst({
    where: { ticketId: id, feature: "triage" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return NextResponse.json({
    result,
    invocationId: invocation?.id,
  });
}
