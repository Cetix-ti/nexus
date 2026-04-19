// ============================================================================
// PATCH /api/v1/intelligence/maintenance/[id]
//
// Met à jour le statut d'une suggestion (open / accepted / rejected).
// Le cooldown rejet de 30 jours est respecté automatiquement par le job
// qui re-gère les suggestions à partir des signaux.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { updateMaintenanceSuggestionStatus } from "@/lib/ai/jobs/maintenance-suggester";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (
    body.status !== "open" &&
    body.status !== "accepted" &&
    body.status !== "rejected"
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const ok = await updateMaintenanceSuggestionStatus(id, body.status);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
