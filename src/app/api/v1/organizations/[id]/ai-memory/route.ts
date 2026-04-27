// ============================================================================
// /api/v1/organizations/[id]/ai-memory
//
// GET  : liste les faits AiMemory pour une organisation (scope=org:xxx)
//        Query params : ?status=pending|verified|rejected|all
// POST : ajoute un fait manuel (admin) — validé automatiquement (source=manual)
//
// Réservé TECHNICIAN+ pour la visibilité, SUPERVISOR+ pour ajouter.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Consultation mémoire IA → ai.view
  const guard = await requireAiPermission("ai.view");
  if (!guard.ok) return guard.res;
  const { id } = await params;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";

  const where: Record<string, unknown> = { scope: `org:${id}` };
  if (status === "pending") {
    where.verifiedAt = null;
    where.rejectedAt = null;
  } else if (status === "verified") {
    where.verifiedAt = { not: null };
  } else if (status === "rejected") {
    where.rejectedAt = { not: null };
  }

  const memories = await prisma.aiMemory.findMany({
    where,
    orderBy: [
      { rejectedAt: { sort: "desc", nulls: "first" } },
      { verifiedAt: { sort: "desc", nulls: "first" } },
      { createdAt: "desc" },
    ],
    take: 200,
  });

  return NextResponse.json({ memories });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Ajout manuel de faits → ai.manage (modifie l'état IA durablement)
  const guard = await requireAiPermission("ai.manage");
  if (!guard.ok) return guard.res;
  const me = guard.me;
  const { id } = await params;

  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length < 5) {
    return NextResponse.json(
      { error: "Le contenu du fait doit avoir au moins 5 caractères." },
      { status: 400 },
    );
  }
  const rawCategory = String(body.category ?? "convention").toLowerCase();
  const validCategories = [
    "convention",
    "quirk",
    "preference",
    "incident_pattern",
    "procedure",
  ];
  const category = validCategories.includes(rawCategory) ? rawCategory : "convention";

  const memory = await prisma.aiMemory.create({
    data: {
      scope: `org:${id}`,
      category,
      content: content.slice(0, 2000),
      source: `manual:${me.id}`,
      // Faits manuels = auto-validés (créateur = admin humain).
      verifiedAt: new Date(),
      verifiedBy: me.id,
    },
  });
  return NextResponse.json({ memory }, { status: 201 });
}
