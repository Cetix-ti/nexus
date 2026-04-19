// ============================================================================
// POST /api/v1/organizations/[id]/extract-facts
//
// Lance le job d'extraction de faits pour une organisation. Réservé aux
// admins MSP (ADMIN, MSP_ADMIN) car ça coûte des tokens IA et les faits
// nécessitent une revue humaine avant d'être considérés "vérifiés".
//
// Les faits extraits sont écrits dans AiMemory avec source="extracted:…".
// Un admin peut ensuite les revoir via /api/v1/ai/memory et les marquer
// verifiedAt (extension future — pour l'instant tous les faits proposés
// sont utilisables immédiatement mais avec une confidence plus basse).
//
// Body (optionnel) : { sinceDays?: number, maxTickets?: number }
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { extractFactsForOrganization } from "@/lib/ai/features/facts-extract";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const sinceDays =
    typeof body.sinceDays === "number" &&
    body.sinceDays > 0 &&
    body.sinceDays <= 365
      ? body.sinceDays
      : 90;
  const maxTickets =
    typeof body.maxTickets === "number" &&
    body.maxTickets > 0 &&
    body.maxTickets <= 100
      ? body.maxTickets
      : 30;

  const stats = await extractFactsForOrganization({
    organizationId: id,
    sinceDays,
    maxTickets,
  });

  return NextResponse.json({
    organizationId: id,
    organizationName: org.name,
    ...stats,
  });
}
