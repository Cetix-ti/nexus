// ============================================================================
// GET    /api/v1/dashboards/published — liste des dashboards publiés
//                                        (optionnellement filtrés par
//                                        dashboardKey ou organizationId).
// POST   /api/v1/dashboards/published — publie (ou met à jour) un snapshot.
// DELETE /api/v1/dashboards/published?id=X — retire une publication.
//
// Réservé SUPER_ADMIN / MSP_ADMIN. Le `config` est un snapshot FIGÉ du
// dashboard + widgets (sérialisé par l'UI agent au moment du publish).
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!hasMinimumRole(me.role, "MSP_ADMIN") || me.role.startsWith("CLIENT_")) {
    return { error: forbidden() };
  }
  return { me };
}

export async function GET(req: Request) {
  const { me, error } = await requireAdmin();
  if (error) return error;
  void me;

  const url = new URL(req.url);
  const dashboardKey = url.searchParams.get("dashboardKey") || undefined;
  const organizationId = url.searchParams.get("organizationId") || undefined;

  const rows = await prisma.publishedDashboard.findMany({
    where: {
      ...(dashboardKey ? { dashboardKey } : {}),
      ...(organizationId ? { organizationId } : {}),
    },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    dashboardKey: r.dashboardKey,
    label: r.label,
    description: r.description,
    organizationId: r.organizationId,
    organizationName: r.organization?.name ?? null,
    config: r.config,
    publishedById: r.publishedById,
    publishedAt: r.publishedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
}

const postSchema = z.object({
  dashboardKey: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  organizationId: z.string().optional().nullable(),
  config: z.object({
    widgets: z.array(z.any()),
    layout: z.array(z.any()),
  }),
});

export async function POST(req: Request) {
  const { me, error } = await requireAdmin();
  if (error) return error;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation échouée", issues: parsed.error.issues }, { status: 400 });
  }

  const { dashboardKey, label, description, organizationId, config } = parsed.data;

  // Si organizationId fourni, vérifier qu'il existe (évite les grants fantômes).
  if (organizationId) {
    const exists = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ error: "Organisation inconnue" }, { status: 404 });
  }

  // Upsert : 1 seule publication par (dashboardKey, organizationId). Si on
  // re-publie, on remplace le snapshot + label + description.
  const existing = await prisma.publishedDashboard.findFirst({
    where: { dashboardKey, organizationId: organizationId ?? null },
    select: { id: true },
  });
  const row = existing
    ? await prisma.publishedDashboard.update({
        where: { id: existing.id },
        data: { label, description: description ?? null, config },
      })
    : await prisma.publishedDashboard.create({
        data: {
          dashboardKey, label, description: description ?? null,
          organizationId: organizationId ?? null,
          config: config as any,
          publishedById: me.id,
        },
      });

  return NextResponse.json({ id: row.id, dashboardKey: row.dashboardKey, updatedAt: row.updatedAt.toISOString() });
}

export async function DELETE(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  await prisma.publishedDashboard.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
