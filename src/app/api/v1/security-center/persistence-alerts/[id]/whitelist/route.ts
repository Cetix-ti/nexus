// ============================================================================
// POST /api/v1/security-center/persistence-alerts/:id/whitelist
//
// Ajoute une règle de whitelist à partir d'une alerte persistence existante.
// L'alerte fournit softwareName (normalisé), hostname, organizationId —
// le body précise juste le scope souhaité et une note optionnelle.
//
// Body : { scope: "host"|"client"|"default", notes?: string }
//
// Après création, l'alerte courante est marquée `isLowPriority=true` +
// l'incident reclassé en "info" pour qu'elle sorte de la vue principale.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

type Scope = "host" | "client" | "default";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { scope?: Scope; notes?: string | null }
    | null;
  if (!body || !body.scope || !["host", "client", "default"].includes(body.scope)) {
    return NextResponse.json(
      { error: "scope requis (host|client|default)" },
      { status: 400 },
    );
  }

  const alert = await prisma.securityAlert.findUnique({
    where: { id },
    include: { incident: true },
  });
  if (!alert) return NextResponse.json({ error: "Alerte introuvable" }, { status: 404 });
  if (alert.kind !== "persistence_tool") {
    return NextResponse.json(
      { error: "L'alerte n'est pas de type persistence_tool" },
      { status: 400 },
    );
  }

  // Extrait le soft normalisé et le hostname depuis le raw payload.
  const raw = alert.rawPayload as Record<string, unknown> | null;
  const softwareNormalized = String(raw?.softwareNameNormalized || raw?.softwareName || "").trim();
  const hostname = alert.endpoint || String(raw?.hostname || "").trim();
  if (!softwareNormalized) {
    return NextResponse.json(
      { error: "Impossible d'extraire le nom normalisé du logiciel depuis l'alerte" },
      { status: 400 },
    );
  }
  if ((body.scope === "host" || body.scope === "client") && !alert.organizationId) {
    return NextResponse.json(
      { error: "L'alerte n'est pas liée à une organisation — scope=default requis" },
      { status: 400 },
    );
  }
  if (body.scope === "host" && !hostname) {
    return NextResponse.json(
      { error: "Hostname manquant sur l'alerte" },
      { status: 400 },
    );
  }

  // Évite le doublon : si une règle exactement équivalente existe déjà,
  // on la retourne telle quelle (idempotent).
  const existing = await prisma.securityPersistenceWhitelist.findFirst({
    where: {
      scope: body.scope,
      organizationId: body.scope === "default" ? null : alert.organizationId,
      hostname: body.scope === "host" ? hostname : null,
      softwareName: { equals: softwareNormalized, mode: "insensitive" },
    },
  });

  let rule = existing;
  if (!rule) {
    rule = await prisma.securityPersistenceWhitelist.create({
      data: {
        scope: body.scope,
        organizationId: body.scope === "default" ? null : alert.organizationId,
        hostname: body.scope === "host" ? hostname : null,
        softwareName: softwareNormalized,
        allowed: true,
        notes: body.notes || null,
        createdBy: me.id,
      },
    });
  }

  // Reclassifie l'alerte + incident courant pour que l'UI les sorte de
  // la vue principale immédiatement.
  await prisma.securityAlert.update({
    where: { id: alert.id },
    data: { severity: "info", isLowPriority: true },
  });
  if (alert.incidentId) {
    await prisma.securityIncident.update({
      where: { id: alert.incidentId },
      data: { severity: "info", isLowPriority: true, status: "resolved" },
    });
  }

  return NextResponse.json({ rule, created: !existing }, { status: existing ? 200 : 201 });
}
