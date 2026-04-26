// ============================================================================
// /api/v1/me/dashboards
//
// Dashboards / rapports personnalisés de l'utilisateur courant (Phase 5).
//
// GET : liste des dashboards de l'utilisateur. Si l'option
//       `?migrate=1` est passée avec un body localStorage existant,
//       on migre les rapports custom du navigateur vers la DB.
// PUT : remplace l'ensemble des dashboards de l'utilisateur (sync bulk).
//       Accepte le shape natif de l'UI (id/label/description/category/
//       widgets/organizationIds/tags). Le serveur stocke `widgets` et
//       métadonnées en config JSON.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface UiReport {
  id: string;
  label: string;
  description?: string;
  category?: string;
  widgets?: unknown[];
  organizationIds?: string[];
  organizationId?: string; // legacy
  tags?: string[];
  parentId?: string | null;
}

function rowToUi(r: {
  id: string;
  slug: string | null;
  label: string;
  description: string;
  category: string;
  config: unknown;
}): UiReport {
  const cfg = (r.config as Record<string, unknown>) ?? {};
  return {
    id: r.slug ?? r.id,
    label: r.label,
    description: r.description,
    category: r.category,
    widgets: Array.isArray(cfg.widgets) ? (cfg.widgets as unknown[]) : [],
    organizationIds: Array.isArray(cfg.organizationIds)
      ? (cfg.organizationIds as string[])
      : [],
    tags: Array.isArray(cfg.tags) ? (cfg.tags as string[]) : [],
    parentId:
      typeof cfg.parentId === "string"
        ? (cfg.parentId as string)
        : null,
  };
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.userDashboard.findMany({
    where: { userId: me.id, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ data: rows.map(rowToUi) });
}

export async function PUT(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reports = Array.isArray((body as { reports?: unknown })?.reports)
    ? ((body as { reports: UiReport[] }).reports as UiReport[])
    : null;
  if (!reports) {
    return NextResponse.json(
      { error: "Body { reports: [...] } requis" },
      { status: 400 },
    );
  }
  // Validation sommaire — chaque rapport doit avoir id et label.
  for (const r of reports) {
    if (!r?.id || !r?.label) {
      return NextResponse.json(
        { error: "Chaque rapport doit avoir id et label" },
        { status: 400 },
      );
    }
  }

  // Sync : delete-all puis recreate. Pour ~100 dashboards par user,
  // c'est négligeable et plus simple qu'un diff.
  await prisma.$transaction(async (tx) => {
    await tx.userDashboard.deleteMany({ where: { userId: me.id } });
    for (const r of reports) {
      // Migration legacy organizationId → organizationIds.
      const orgIds = Array.from(
        new Set([
          ...(Array.isArray(r.organizationIds) ? r.organizationIds : []),
          ...(r.organizationId ? [r.organizationId] : []),
        ]),
      );
      await tx.userDashboard.create({
        data: {
          userId: me.id,
          slug: r.id,
          label: r.label,
          description: r.description ?? "",
          category: (r.category ?? "complet") as string,
          config: JSON.parse(
            JSON.stringify({
              widgets: Array.isArray(r.widgets) ? r.widgets : [],
              organizationIds: orgIds,
              tags: Array.isArray(r.tags) ? r.tags : [],
              parentId: r.parentId ?? null,
            }),
          ),
        },
      });
    }
  });

  const rows = await prisma.userDashboard.findMany({
    where: { userId: me.id, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ data: rows.map(rowToUi) });
}
