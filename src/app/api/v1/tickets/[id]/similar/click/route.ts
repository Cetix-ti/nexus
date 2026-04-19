// ============================================================================
// POST /api/v1/tickets/[id]/similar/click
//
// Signal de feedback implicite : le tech a cliqué sur un ticket proposé
// dans le widget "Tickets similaires". On persiste le clic pour alimenter
// l'auto-apprentissage (boosting des tokens qui génèrent des clics,
// calibration des seuils par bucket).
//
// Appelé par le widget côté client avec fetch("...", {keepalive: true})
// pour que le ping parte même si le tech navigue immédiatement.
//
// Body : { clickedTicketId, bucket, score?, semanticSim?, matchedTokens? }
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const VALID_BUCKETS = new Set([
  "sameRequester",
  "sameClientOpen",
  "sameClientResolved",
  "otherClientsResolved",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sourceTicketId } = await params;
  const body = await req.json().catch(() => ({}));

  const clickedTicketId = typeof body.clickedTicketId === "string" ? body.clickedTicketId : null;
  const bucket = typeof body.bucket === "string" && VALID_BUCKETS.has(body.bucket) ? body.bucket : null;
  if (!clickedTicketId || !bucket) {
    return NextResponse.json({ error: "clickedTicketId + bucket requis" }, { status: 400 });
  }
  if (clickedTicketId === sourceTicketId) {
    return NextResponse.json({ ok: true, skipped: "self-click" });
  }

  const score = typeof body.score === "number" ? body.score : null;
  const semanticSim = typeof body.semanticSim === "number" ? body.semanticSim : null;
  const matchedTokens = Array.isArray(body.matchedTokens)
    ? body.matchedTokens.filter((t: unknown): t is string => typeof t === "string").slice(0, 20)
    : [];
  const dwellMs = typeof body.dwellMs === "number" ? body.dwellMs : null;

  try {
    await prisma.similarTicketClick.create({
      data: {
        userId: me.id,
        sourceTicketId,
        clickedTicketId,
        bucket,
        score,
        semanticSim,
        matchedTokens,
        dwellMs,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Tolérant : si le ticket source ou cible est supprimé entre-temps,
    // on log et on ne fait rien péter côté client.
    console.warn("[similar-click] insert failed:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
