// ============================================================================
// POST /api/v1/tickets/[id]/triage-feedback
//
// Feedback EXPLICITE sur les différentes facettes du triage IA :
//   - field="priority"  → verdict sur la priorité suggérée
//   - field="duplicate" → verdict sur le ticket-doublon proposé
//   - field="type"      → verdict sur le type (INCIDENT/SERVICE_REQUEST/...)
//
// Stocké dans AiPattern(scope="triage:feedback:<field>", kind="pair",
// key="<ticketId>|<valeur>"). Agrégé par le learner dédié au champ pour
// dériver des pénalités/boosts globaux.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const VALID_FIELDS = new Set(["priority", "duplicate", "type"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: ticketId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    field?: string;
    value?: string;
    verdict?: "bad" | "good";
  };
  if (
    !body.field ||
    !VALID_FIELDS.has(body.field) ||
    !body.value ||
    !body.verdict ||
    (body.verdict !== "bad" && body.verdict !== "good")
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const key = `${ticketId}|${body.value}`;
  await prisma.aiPattern.upsert({
    where: {
      scope_kind_key: {
        scope: `triage:feedback:${body.field}`,
        kind: "pair",
        key,
      },
    },
    create: {
      scope: `triage:feedback:${body.field}`,
      kind: "pair",
      key,
      value: {
        ticketId,
        field: body.field,
        suggestedValue: body.value,
        verdict: body.verdict,
        userId: me.id,
        markedAt: new Date().toISOString(),
      } as never,
      sampleCount: 1,
      confidence: body.verdict === "bad" ? 1 : 0.8,
    },
    update: {
      value: {
        ticketId,
        field: body.field,
        suggestedValue: body.value,
        verdict: body.verdict,
        userId: me.id,
        markedAt: new Date().toISOString(),
      } as never,
      confidence: body.verdict === "bad" ? 1 : 0.8,
    },
  });

  return NextResponse.json({ ok: true });
}
