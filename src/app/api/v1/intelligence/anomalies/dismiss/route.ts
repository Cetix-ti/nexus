// ============================================================================
// POST /api/v1/intelligence/anomalies/dismiss
//
// Marque une anomalie comme "écartée" (ack humain). Le pattern est supprimé
// pour qu'elle ne remonte plus dans le dashboard, mais l'historique reste
// dans les audits. Body: { contactId, detectedAt } pour identifier l'entrée.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    contactId?: string;
    detectedAt?: string;
  };
  if (!body.contactId || !body.detectedAt) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // La key est construite à partir du hash de la date ISO (précision heure).
  // Cf. requester-anomaly : key = `${contactId}|${iso.slice(0,13)}`.
  const hourPart = body.detectedAt.slice(0, 13);
  const key = `${body.contactId}|${hourPart}`;

  await prisma.aiPattern.deleteMany({
    where: { scope: "requester:anomaly", kind: "event", key },
  });

  return NextResponse.json({ ok: true });
}
