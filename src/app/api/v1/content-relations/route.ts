// API CRUD pour ContentRelation — graphe polymorphique cross-modules.
// Types valides définis dans src/lib/content/relations.ts.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { isContentType, isRelationType } from "@/lib/content/relations";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const sourceType = searchParams.get("sourceType");
  const sourceId = searchParams.get("sourceId");
  if (!sourceType || !sourceId) return NextResponse.json({ error: "sourceType et sourceId requis" }, { status: 400 });

  const [outgoing, incoming] = await Promise.all([
    prisma.contentRelation.findMany({
      where: { sourceType, sourceId },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.contentRelation.findMany({
      where: { targetType: sourceType, targetId: sourceId },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);
  return NextResponse.json({ outgoing, incoming });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { sourceType, sourceId, targetType, targetId, relationType = "related", note = null } = body ?? {};
  if (!isContentType(sourceType) || !isContentType(targetType)) {
    return NextResponse.json({ error: "Types invalides" }, { status: 400 });
  }
  if (!isRelationType(relationType)) {
    return NextResponse.json({ error: "relationType invalide" }, { status: 400 });
  }
  if (!sourceId || !targetId) {
    return NextResponse.json({ error: "IDs requis" }, { status: 400 });
  }
  if (sourceType === targetType && sourceId === targetId) {
    return NextResponse.json({ error: "Impossible de lier un objet à lui-même" }, { status: 400 });
  }
  try {
    const created = await prisma.contentRelation.create({
      data: { sourceType, sourceId, targetType, targetId, relationType, note, createdByUserId: me.id },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    // Unique constraint violation : relation déjà existante
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Relation déjà existante" }, { status: 409 });
    }
    throw e;
  }
}
