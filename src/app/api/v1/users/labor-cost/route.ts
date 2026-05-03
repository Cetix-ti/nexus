// ============================================================================
// /api/v1/users/labor-cost
//
// GET    : liste agents staff avec leur taux courant + historique.
// POST   : { userId, hourlyCost, effectiveFrom } — ajoute (ou écrase)
//          une entrée d'historique. effectiveFrom est obligatoire
//          (ISO date). Le taux s'applique à partir de cette date.
// DELETE : ?entryId=xxx — supprime une entrée d'historique.
//
// Réservé aux users avec capabilité "finances".
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasCapability } from "@/lib/auth-utils";
import { UserRole } from "@prisma/client";
import {
  setHourlyCost,
  deleteHourlyCostEntry,
  listHourlyCostHistory,
  getCurrentHourlyCost,
} from "@/lib/billing/hourly-cost";

const STAFF_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.MSP_ADMIN,
  UserRole.SUPERVISOR,
  UserRole.TECHNICIAN,
];

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasCapability(me, "finances")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
    },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  // Pour chaque agent, on charge son historique en parallèle. Le taux
  // "courant" (affiché dans l'UI) est le plus récent (= première
  // entrée de l'historique trié desc).
  const results = await Promise.all(
    users.map(async (u) => {
      const history = await listHourlyCostHistory(u.id);
      const current = history[0]?.hourlyCost ?? null;
      return {
        ...u,
        hourlyCost: current,
        history: history.map((h) => ({
          id: h.id,
          hourlyCost: h.hourlyCost,
          effectiveFrom: h.effectiveFrom.toISOString(),
          createdAt: h.createdAt.toISOString(),
        })),
      };
    }),
  );
  return NextResponse.json({ data: results });
}

export async function POST(req: NextRequest) {
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
  const cost = Number(body.hourlyCost);
  if (!Number.isFinite(cost) || cost < 0) {
    return NextResponse.json({ error: "hourlyCost invalide" }, { status: 400 });
  }
  const effectiveFromStr = typeof body.effectiveFrom === "string" ? body.effectiveFrom : null;
  if (!effectiveFromStr) {
    return NextResponse.json({ error: "effectiveFrom requis (ISO date)" }, { status: 400 });
  }
  const effectiveFrom = new Date(effectiveFromStr);
  if (Number.isNaN(effectiveFrom.getTime())) {
    return NextResponse.json({ error: "effectiveFrom invalide" }, { status: 400 });
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

  await setHourlyCost(userId, Math.round(cost * 100) / 100, effectiveFrom);
  const current = await getCurrentHourlyCost(userId);
  return NextResponse.json({ data: { userId, hourlyCost: current } });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasCapability(me, "finances")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const entryId = req.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "entryId requis" }, { status: 400 });
  }
  await deleteHourlyCostEntry(entryId);
  return NextResponse.json({ success: true });
}
