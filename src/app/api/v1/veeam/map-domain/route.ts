// POST /api/v1/veeam/map-domain
// Body: { senderDomain: string, organizationId: string }
//
// Effet :
//   1. Ajoute `senderDomain` à la liste `organizations.domains[]` de
//      l'organisation (si pas déjà présent) → les prochaines alertes
//      seront auto-matchées par l'ingestion Veeam.
//   2. Backfill : toutes les alertes existantes avec ce domaine et
//      organizationId=null sont assignées à cette organisation
//      (organizationId + organizationName mis à jour).
//
// Réservé aux agents (role non CLIENT_*). Action hautement explicite,
// donc pas de confirmation côté serveur — le confirm est dans l'UI.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { isPublicEmailDomain } from "@/lib/veeam/public-domains";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const senderDomain = String(body.senderDomain || "").trim().toLowerCase();
  const organizationId = String(body.organizationId || "").trim();

  if (!senderDomain || !organizationId) {
    return NextResponse.json(
      { error: "senderDomain et organizationId sont requis" },
      { status: 400 },
    );
  }

  // Refuse le mapping de domaines publics — ça associerait des millions
  // d'utilisateurs Gmail/Outlook à ce client. L'appelant doit utiliser
  // /api/v1/veeam/map-email à la place.
  if (isPublicEmailDomain(senderDomain)) {
    return NextResponse.json(
      {
        error:
          `Le domaine « ${senderDomain} » est un fournisseur public (Gmail, Outlook, etc.). ` +
          `Utilisez plutôt le mappage par adresse courriel individuelle.`,
      },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, domain: true, domains: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  // Évite d'ajouter un doublon. `domain` est le domaine primaire ; s'il
  // match déjà on ne touche pas. Sinon on push dans `domains[]`.
  const existing = new Set<string>([
    ...(org.domain ? [org.domain.toLowerCase()] : []),
    ...(org.domains ?? []).map((d) => d.toLowerCase()),
  ]);
  if (!existing.has(senderDomain)) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { domains: { push: senderDomain } },
    });
  }

  // Backfill en masse — uniquement les alertes orphelines qui match
  // exactement ce domaine. On ne réécrit pas une alerte déjà assignée
  // à une autre org (évite le cas "mauvais mapping écrase le bon").
  const { count } = await prisma.veeamBackupAlert.updateMany({
    where: { organizationId: null, senderDomain },
    data: { organizationId: org.id, organizationName: org.name },
  });

  return NextResponse.json({
    ok: true,
    domain: senderDomain,
    organizationId: org.id,
    organizationName: org.name,
    backfilledAlerts: count,
    addedToDomains: !existing.has(senderDomain),
  });
}
