// ============================================================================
// /api/v1/users/labor-cost
//
// GET  : liste des agents (TECHNICIAN, SUPERVISOR, MSP_ADMIN, SUPER_ADMIN)
//        avec leur hourlyCost. Réservé aux users avec capabilité "finances".
// PATCH: { userId, hourlyCost } — met à jour le taux horaire d'un agent.
//        Réservé "finances".
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasCapability } from "@/lib/auth-utils";
import { UserRole } from "@prisma/client";

const STAFF_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.MSP_ADMIN, UserRole.SUPERVISOR, UserRole.TECHNICIAN];

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasCapability(me, "finances")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      role: { in: STAFF_ROLES },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      hourlyCost: true,
    },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
  return NextResponse.json({ data: users });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasCapability(me, "finances")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }
  // null = effacer le taux. Number sinon, ≥0.
  let hourlyCost: number | null;
  if (body.hourlyCost === null || body.hourlyCost === "") {
    hourlyCost = null;
  } else {
    const n = Number(body.hourlyCost);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "hourlyCost invalide" }, { status: 400 });
    }
    hourlyCost = Math.round(n * 100) / 100;
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (!STAFF_ROLES.includes(target.role)) {
    return NextResponse.json(
      { error: "Le coût horaire ne s'applique qu'aux agents internes" },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { hourlyCost },
    select: { id: true, hourlyCost: true },
  });
  return NextResponse.json({ data: updated });
}
