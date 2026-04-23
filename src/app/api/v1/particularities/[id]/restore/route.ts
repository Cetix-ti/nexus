import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const versionId = body?.versionId as string | undefined;
  if (!versionId) return NextResponse.json({ error: "versionId requis" }, { status: 400 });

  const version = await prisma.particularityVersion.findUnique({ where: { id: versionId } });
  const current = await prisma.particularity.findUnique({ where: { id } });
  if (!version || !current || version.particularityId !== id) {
    return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
  }

  const snap = version.snapshot as Record<string, unknown>;
  const updated = await prisma.particularity.update({
    where: { id },
    data: {
      title: String(snap.title ?? current.title),
      summary: (snap.summary as string | null) ?? null,
      body: String(snap.body ?? ""),
      categoryId: (snap.categoryId as string | null) ?? null,
      tags: Array.isArray(snap.tags) ? (snap.tags as string[]) : [],
      resolvedVariables: (snap.resolvedVariables ?? null) as never,
      version: current.version + 1,
      updatedByUserId: me.id,
    },
  });
  await prisma.particularityVersion.create({
    data: {
      particularityId: id,
      version: updated.version,
      snapshot: snap as never,
      authorId: me.id,
      changeNote: `Restauration de la version ${version.version}`,
    },
  });
  return NextResponse.json(updated);
}
