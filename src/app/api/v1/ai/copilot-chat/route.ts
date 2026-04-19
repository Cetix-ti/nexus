// ============================================================================
// POST /api/v1/ai/copilot-chat
//
// Question libre posée par un technicien dans le contexte d'un ticket. Le
// copilote charge le contexte (ticket, historique, similaires, faits client)
// et répond en JSON structuré.
//
// Body : { ticketId: string, question: string }
// Retour : { answer: string, citedTicketNumbers: number[] }
//
// TECHNICIAN+ requis (un tech a besoin de pouvoir l'invoquer sur les
// tickets dont il a la responsabilité).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { askCopilot } from "@/lib/ai/features/copilot-chat";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "TECHNICIAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ticketId =
    typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  const question =
    typeof body.question === "string" ? body.question.trim() : "";

  if (!ticketId) {
    return NextResponse.json({ error: "ticketId requis" }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "question requise" }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json(
      { error: "Question trop longue (max 2000 caractères)" },
      { status: 400 },
    );
  }

  const result = await askCopilot({ ticketId, question });
  if (!result) {
    return NextResponse.json(
      { error: "Le copilote n'a pas pu répondre — réessaye dans un instant." },
      { status: 502 },
    );
  }
  // Expose invocationId (stocké sur le résultat par askCopilot) pour que
  // l'UI puisse afficher les boutons de feedback (thumbs up/down) et câbler
  // le learner copilot_chat. Note : `askCopilot` n'exposait pas l'invocationId
  // — ajouté en même temps que P0-2 (FeedbackButtons partagé).
  return NextResponse.json(result);
}
