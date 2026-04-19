// ============================================================================
// POST /api/v1/security-center/reindex-lockouts
//
// Re-applique le décodeur AD sur les SecurityAlert existantes dont le corps
// est stocké dans raw_payload. Utilisé pour corriger rétroactivement les
// lockouts ingérés avec un ancien décodeur bugué (qui capturait "Nom du
// compte" du DC au lieu du user réel).
//
// Met à jour :
//   - SecurityAlert.userPrincipal / endpoint
//   - SecurityIncident correspondant : userPrincipal, endpoint, title,
//     correlationKey (si possible — on NE renomme PAS la clé pour ne pas
//     créer de doublons ; on laisse l'incident tel quel et on écrit
//     seulement les champs "visuels" + metadata)
//
// MSP_ADMIN+ — opération batch qui mute plusieurs incidents.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { extractLockoutFieldsFromBody, extractLockoutUserFromSubject } from "@/lib/security-center/decoders/ad";

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cible : alertes AD account_lockout dont user_principal est vide OU
  // dont endpoint est vide (prob. décodées avec l'ancien décodeur).
  const alerts = await prisma.securityAlert.findMany({
    where: {
      source: "ad_email",
      kind: "account_lockout",
      OR: [{ userPrincipal: null }, { endpoint: null }],
    },
    select: {
      id: true,
      title: true,
      rawPayload: true,
      incidentId: true,
      userPrincipal: true,
      endpoint: true,
    },
    take: 500,
  });

  const results = {
    scanned: alerts.length,
    alertsUpdated: 0,
    incidentsUpdated: 0,
    unresolvable: 0,
  };

  for (const a of alerts) {
    const payload = a.rawPayload as {
      subject?: string;
      body?: string;
    } | null;
    if (!payload) {
      results.unresolvable++;
      continue;
    }
    const body = payload.body ?? "";
    const subject = payload.subject ?? a.title ?? "";
    const userFromSubject = extractLockoutUserFromSubject(subject);
    const bodyFields = extractLockoutFieldsFromBody(body);
    const user = userFromSubject ?? bodyFields.user ?? a.userPrincipal ?? null;
    const endpoint = bodyFields.callerComputer ?? a.endpoint ?? null;

    if (user === a.userPrincipal && endpoint === a.endpoint) {
      // Rien à changer — skip pour éviter un write inutile.
      continue;
    }
    if (!user && !endpoint) {
      results.unresolvable++;
      continue;
    }

    await prisma.securityAlert.update({
      where: { id: a.id },
      data: {
        ...(user ? { userPrincipal: user } : {}),
        ...(endpoint ? { endpoint } : {}),
      },
    });
    results.alertsUpdated++;

    if (a.incidentId) {
      const newTitle = user
        ? `Verrouillage AD : ${user}`
        : `Verrouillage AD (compte inconnu)`;
      await prisma.securityIncident.update({
        where: { id: a.incidentId },
        data: {
          ...(user ? { userPrincipal: user } : {}),
          ...(endpoint ? { endpoint } : {}),
          title: newTitle,
        },
      });
      results.incidentsUpdated++;
    }
  }

  return NextResponse.json(results);
}
