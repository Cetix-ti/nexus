// ============================================================================
// /api/v1/organizations/[id]/hour-bank
//
// Configuration UI de la banque d'heures pour un client (Phase 2B).
//
// GET : retourne la config existante (objet JSON ou {}).
// PUT : remplace la config (admin only, scope par org appliqué).
//
// IMPORTANT : ce blob est le shape UI. Le moteur de facturation continue
// de lire `Contract.settings.hourBank` qui a un shape plus restreint.
// Les deux doivent être maintenus alignés manuellement pour l'instant.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { userCanAccessOrg } from "@/lib/auth/org-scope";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await userCanAccessOrg(me.id, me.role, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await prisma.orgHourBankConfig.findUnique({
    where: { organizationId: id },
  });
  return NextResponse.json({ data: row?.config ?? {} });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!(await userCanAccessOrg(me.id, me.role, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON requis" }, { status: 400 });
  }
  const config = JSON.parse(JSON.stringify(body)); // strip non-serializable

  await prisma.orgHourBankConfig.upsert({
    where: { organizationId: id },
    create: { organizationId: id, config },
    update: { config },
  });
  return NextResponse.json({ ok: true });
}
