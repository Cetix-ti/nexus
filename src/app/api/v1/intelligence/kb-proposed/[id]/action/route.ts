// ============================================================================
// POST /api/v1/intelligence/kb-proposed/[id]/action
//
// Actions sur un article proposé par l'IA :
//   - action="approve"  → passe en PUBLISHED, isPublic=true, publishedAt=now
//   - action="reject"   → passe en ARCHIVED (garde trace pour apprentissage)
//   - action="edit"     → juste un marker ; l'UI redirige vers /knowledge/[slug]
//
// Garde-fou : ne modifie que les articles avec externalSource commençant par
// "ai:" — évite de mal cliquer sur un draft humain.
//
// SUPERVISOR+ requis.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "action doit être 'approve' ou 'reject'" },
      { status: 400 },
    );
  }

  const article = await prisma.article.findUnique({
    where: { id },
    select: { id: true, externalSource: true, status: true, slug: true },
  });
  if (!article) {
    return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
  }
  if (!article.externalSource?.startsWith("ai:")) {
    return NextResponse.json(
      { error: "Cet article n'est pas une proposition IA" },
      { status: 400 },
    );
  }

  if (action === "approve") {
    await prisma.article.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        isPublic: true,
        publishedAt: new Date(),
        authorId: me.id,
      },
    });
    // Trace dans AuditLog pour que les learners IA (ai-audit) notent que
    // la proposition a été acceptée telle quelle.
    try {
      await prisma.auditLog.create({
        data: {
          action: "kb.ai_proposed_approved",
          entityType: "Article",
          entityId: id,
          userId: me.id,
          userEmail: me.email ?? null,
          metadata: { source: article.externalSource, slug: article.slug },
        },
      });
    } catch {
      /* non bloquant */
    }
    return NextResponse.json({ ok: true, status: "PUBLISHED" });
  }

  // reject → ARCHIVED. On ne supprime pas pour garder la trace (apprentissage).
  await prisma.article.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
  try {
    await prisma.auditLog.create({
      data: {
        action: "kb.ai_proposed_rejected",
        entityType: "Article",
        entityId: id,
        userId: me.id,
        userEmail: me.email ?? null,
        metadata: { source: article.externalSource, slug: article.slug },
      },
    });
  } catch {
    /* non bloquant */
  }
  return NextResponse.json({ ok: true, status: "ARCHIVED" });
}
