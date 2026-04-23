// Fusion : marque plusieurs Changes comme `mergedIntoId` = id cible. Leurs
// sources/signalsassociés restent reliés aux deux (on ne supprime pas).
// Le cible absorbe les linked* (union).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params; // cible
  const body = await req.json();
  const sourceIds = Array.isArray(body?.sourceIds) ? (body.sourceIds as string[]) : [];
  if (sourceIds.length === 0) return NextResponse.json({ error: "sourceIds requis" }, { status: 400 });

  const target = await prisma.change.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Cible introuvable" }, { status: 404 });
  const sources = await prisma.change.findMany({ where: { id: { in: sourceIds }, organizationId: target.organizationId } });

  const unionTickets = new Set([...target.linkedTicketIds, ...sources.flatMap((s) => s.linkedTicketIds)]);
  const unionAssets = new Set([...target.linkedAssetIds, ...sources.flatMap((s) => s.linkedAssetIds)]);
  const unionSoftware = new Set([...target.linkedSoftwareIds, ...sources.flatMap((s) => s.linkedSoftwareIds)]);
  const unionPolicy = new Set([...target.linkedPolicyIds, ...sources.flatMap((s) => s.linkedPolicyIds)]);
  const unionPart = new Set([...target.linkedParticularityIds, ...sources.flatMap((s) => s.linkedParticularityIds)]);

  await prisma.$transaction([
    prisma.change.update({
      where: { id },
      data: {
        linkedTicketIds: [...unionTickets],
        linkedAssetIds: [...unionAssets],
        linkedSoftwareIds: [...unionSoftware],
        linkedPolicyIds: [...unionPolicy],
        linkedParticularityIds: [...unionPart],
      },
    }),
    prisma.change.updateMany({
      where: { id: { in: sources.map((s) => s.id) } },
      data: { mergedIntoId: id, status: "ARCHIVED" },
    }),
    // Réassigne les signaux IA vers la cible
    prisma.changeAiSignal.updateMany({
      where: { proposedChangeId: { in: sources.map((s) => s.id) } },
      data: { proposedChangeId: id },
    }),
  ]);

  return NextResponse.json({ ok: true, mergedCount: sources.length });
}
