// GET /api/v1/veeam/unmatched-domains
//
// Retourne deux listes d'entrées non mappées :
//   - `domains` : domaines privés (ex: backup01.client.com) → l'UI propose
//     un mappage domaine → client, qui se backfill + s'auto-applique aux
//     futures alertes du même domaine.
//   - `emails`  : alertes dont le senderDomain est un domaine public
//     (gmail.com, outlook.com, …). On ne PEUT PAS mapper un domaine
//     public à un client (ce serait associer tous les utilisateurs Gmail
//     du monde au même client). L'UI propose donc un mappage par email
//     individuel.
//
// Utilisé par la section « Mappage manuel » de /backups.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { isPublicEmailDomain } from "@/lib/veeam/public-domains";

interface UnmatchedDomain {
  senderDomain: string;
  alertCount: number;
  latestReceivedAt: string;
  sampleSubjects: string[];
  sampleEmails: string[];
}

interface UnmatchedEmail {
  senderEmail: string;
  senderDomain: string;
  alertCount: number;
  latestReceivedAt: string;
  sampleSubjects: string[];
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const alerts = await prisma.veeamBackupAlert.findMany({
    where: { organizationId: null, senderDomain: { not: "" } },
    orderBy: { receivedAt: "desc" },
    take: 500,
    select: {
      senderDomain: true,
      senderEmail: true,
      subject: true,
      receivedAt: true,
    },
  });

  const byDomain = new Map<string, UnmatchedDomain>();
  const byEmail = new Map<string, UnmatchedEmail>();

  for (const a of alerts) {
    const d = a.senderDomain.toLowerCase();
    const email = a.senderEmail.toLowerCase();
    const isPublic = isPublicEmailDomain(d);

    if (isPublic) {
      // Regroupe par adresse courriel individuelle : on NE peut PAS
      // mapper le domaine en entier.
      let entry = byEmail.get(email);
      if (!entry) {
        entry = {
          senderEmail: email,
          senderDomain: d,
          alertCount: 0,
          latestReceivedAt: a.receivedAt.toISOString(),
          sampleSubjects: [],
        };
        byEmail.set(email, entry);
      }
      entry.alertCount++;
      if (
        entry.sampleSubjects.length < 3 &&
        !entry.sampleSubjects.includes(a.subject)
      ) {
        entry.sampleSubjects.push(a.subject);
      }
      if (a.receivedAt.toISOString() > entry.latestReceivedAt) {
        entry.latestReceivedAt = a.receivedAt.toISOString();
      }
    } else {
      // Domaine privé → mapping par domaine OK.
      let entry = byDomain.get(d);
      if (!entry) {
        entry = {
          senderDomain: d,
          alertCount: 0,
          latestReceivedAt: a.receivedAt.toISOString(),
          sampleSubjects: [],
          sampleEmails: [],
        };
        byDomain.set(d, entry);
      }
      entry.alertCount++;
      if (
        entry.sampleSubjects.length < 3 &&
        !entry.sampleSubjects.includes(a.subject)
      ) {
        entry.sampleSubjects.push(a.subject);
      }
      if (
        entry.sampleEmails.length < 3 &&
        !entry.sampleEmails.includes(a.senderEmail)
      ) {
        entry.sampleEmails.push(a.senderEmail);
      }
      if (a.receivedAt.toISOString() > entry.latestReceivedAt) {
        entry.latestReceivedAt = a.receivedAt.toISOString();
      }
    }
  }

  return NextResponse.json({
    domains: Array.from(byDomain.values()).sort(
      (a, b) => b.alertCount - a.alertCount,
    ),
    emails: Array.from(byEmail.values()).sort(
      (a, b) => b.alertCount - a.alertCount,
    ),
  });
}
