// Lance l'analyse IA pour une org (ou toutes si admin). Renvoie compteurs.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { detectChangesForOrg } from "@/lib/ai/change-detect";

export const maxDuration = 300; // 5 min (pipeline peut être long)

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const orgId = body?.orgId as string | undefined;
  const sinceDays = typeof body?.sinceDays === "number" ? body.sinceDays : 14;

  if (!orgId) return NextResponse.json({ error: "orgId requis" }, { status: 400 });
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Org introuvable" }, { status: 404 });

  const result = await detectChangesForOrg(orgId, { userId: me.id, sinceDays });
  return NextResponse.json(result);
}
