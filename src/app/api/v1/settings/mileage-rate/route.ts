// ============================================================================
// GET  /api/v1/settings/mileage-rate — lit le taux agent ($/km) global
// PUT  /api/v1/settings/mileage-rate — met à jour le taux global
//
// Réservé SUPER_ADMIN / MSP_ADMIN. Le taux s'applique uniformément à
// tous les agents et tous les clients (cf. lib/billing/global-mileage).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  getGlobalAgentRatePerKm,
  setGlobalAgentRatePerKm,
} from "@/lib/billing/global-mileage";

function canEdit(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "MSP_ADMIN";
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await getGlobalAgentRatePerKm();
  return NextResponse.json({ rate });
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = Number(body.rate);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 10) {
    return NextResponse.json({ error: "Taux invalide (0 < rate <= 10)" }, { status: 400 });
  }
  const saved = await setGlobalAgentRatePerKm(raw);
  return NextResponse.json({ rate: saved });
}
