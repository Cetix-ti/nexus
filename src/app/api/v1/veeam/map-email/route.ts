// POST /api/v1/veeam/map-email
// Body: { senderEmail: string, organizationId: string }
//
// Associe une ADRESSE COURRIEL individuelle à un client. Utilisé pour
// les domaines publics (Gmail, Outlook, etc.) où mapper le domaine en
// entier serait absurde. Effet :
//   1. Backfill : toutes les alertes VeeamBackupAlert avec ce
//      senderEmail (et organizationId=null) sont assignées à l'org.
//   2. Pour que les FUTURES alertes de la même adresse s'auto-matchent,
//      on crée (upsert) un `Contact` de cette adresse courriel chez
//      l'organisation — le matching par contact est déjà utilisé par
//      l'ingestion email-to-ticket et peut être étendu à Veeam.
//
// Réservé aux agents (role non CLIENT_*).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const senderEmail = String(body.senderEmail || "").trim().toLowerCase();
  const organizationId = String(body.organizationId || "").trim();

  if (!senderEmail || !organizationId) {
    return NextResponse.json(
      { error: "senderEmail et organizationId sont requis" },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    return NextResponse.json(
      { error: "Adresse courriel invalide" },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  // Crée ou réassigne un Contact pour cette adresse afin que les futures
  // alertes / emails de cet expéditeur s'auto-matchent au bon client.
  // Contact.email n'a pas de contrainte @unique dans le schéma (plusieurs
  // clients peuvent partager la même adresse vendor), donc on passe par
  // findFirst + create/update explicite.
  try {
    const existing = await prisma.contact.findFirst({
      where: { email: senderEmail },
      select: { id: true, organizationId: true },
    });
    if (!existing) {
      await prisma.contact.create({
        data: {
          email: senderEmail,
          firstName: senderEmail.split("@")[0],
          lastName: "",
          organizationId: org.id,
          isActive: true,
        },
      });
    } else if (existing.organizationId !== org.id) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: { organizationId: org.id },
      });
    }
  } catch {
    // Non fatal — le backfill d'alertes existantes est l'essentiel.
  }

  const { count } = await prisma.veeamBackupAlert.updateMany({
    where: { organizationId: null, senderEmail },
    data: { organizationId: org.id, organizationName: org.name },
  });

  return NextResponse.json({
    ok: true,
    email: senderEmail,
    organizationId: org.id,
    organizationName: org.name,
    backfilledAlerts: count,
  });
}
