// ============================================================================
// /api/v1/ai/memory/[id]
//
// PATCH : valider, rejeter ou éditer le contenu d'un fait AiMemory.
//   - Body verify : { action: "verify" }
//   - Body reject : { action: "reject" }
//   - Body edit   : { content: "nouveau texte" [, category: "convention" ...] }
//     → met à jour content/category sans changer l'état verify/reject. Utile
//       pour qu'un admin corrige la formulation IA avant de valider.
// DELETE : supprimer définitivement.
//
// Réservé SUPERVISOR+ — l'acte d'approuver/rejeter/éditer un fait IA demande
// jugement MSP, pas n'importe quel agent.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;

  const existing = await prisma.aiMemory.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Fait introuvable" }, { status: 404 });
  }

  if (action === "verify") {
    const updated = await prisma.aiMemory.update({
      where: { id },
      data: {
        verifiedAt: new Date(),
        verifiedBy: me.id,
        rejectedAt: null,
        rejectedBy: null,
      },
    });
    return NextResponse.json({ memory: updated });
  }

  if (action === "reject") {
    const updated = await prisma.aiMemory.update({
      where: { id },
      data: {
        rejectedAt: new Date(),
        rejectedBy: me.id,
        verifiedAt: null,
        verifiedBy: null,
      },
    });
    return NextResponse.json({ memory: updated });
  }

  // Édition du contenu / de la catégorie — sans action explicite.
  if (action === undefined || action === "update") {
    const content =
      typeof body.content === "string" ? body.content.trim() : undefined;
    const validCategories = [
      "convention",
      "quirk",
      "preference",
      "incident_pattern",
      "procedure",
    ];
    const rawCat =
      typeof body.category === "string" ? body.category.toLowerCase() : undefined;
    const category =
      rawCat && validCategories.includes(rawCat) ? rawCat : undefined;

    if (!content && !category) {
      return NextResponse.json(
        { error: "content ou category requis pour une édition" },
        { status: 400 },
      );
    }
    if (content !== undefined && content.length < 5) {
      return NextResponse.json(
        { error: "Le contenu doit avoir au moins 5 caractères" },
        { status: 400 },
      );
    }

    const updated = await prisma.aiMemory.update({
      where: { id },
      data: {
        ...(content !== undefined ? { content: content.slice(0, 2000) } : {}),
        ...(category ? { category } : {}),
      },
    });
    return NextResponse.json({ memory: updated });
  }

  return NextResponse.json(
    { error: "action doit être 'verify', 'reject' ou 'update'" },
    { status: 400 },
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  const { id } = await params;
  try {
    await prisma.aiMemory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Fait introuvable" }, { status: 404 });
  }
}
