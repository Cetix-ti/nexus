import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/v1/portal/session-check
 *
 * Re-vérifie en DB la validité d'une session portail courante. Le JWT
 * NextAuth stocke un snapshot des permissions / statut au login et reste
 * valide 24h — sans ce check explicite, désactiver un contact dans Nexus
 * ne bloque pas immédiatement son accès portail.
 *
 * Le portail layout appelle cette route à chaque navigation. Si la
 * réponse est 401, le client signOut() automatiquement.
 *
 * Retours :
 *   200 { valid: true }
 *   401 { valid: false, reason: "..." } pour toute condition d'éviction :
 *     - Pas de session
 *     - Session non-portail (un agent)
 *     - Contact introuvable / inactif / portalEnabled=false
 *     - Organisation inactive ou portail désactivé pour l'org
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ valid: false, reason: "no_session" }, { status: 401 });
  }

  const userType = (session.user as { userType?: string }).userType;
  if (userType !== "contact") {
    // Le check ne concerne que les sessions portail (contacts). Un agent
    // qui passerait par là est une mauvaise route, on retourne valid
    // pour ne pas le déconnecter par erreur.
    return NextResponse.json({ valid: true, kind: "agent" });
  }

  const contactId = (session.user as { id?: string }).id;
  if (!contactId) {
    return NextResponse.json({ valid: false, reason: "no_contact_id" }, { status: 401 });
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      isActive: true,
      portalEnabled: true,
      portalStatus: true,
      organization: { select: { isActive: true, portalEnabled: true } },
    },
  });

  if (!contact) {
    return NextResponse.json({ valid: false, reason: "contact_not_found" }, { status: 401 });
  }
  if (!contact.isActive) {
    return NextResponse.json({ valid: false, reason: "contact_inactive" }, { status: 401 });
  }
  if (!contact.portalEnabled) {
    return NextResponse.json({ valid: false, reason: "portal_disabled" }, { status: 401 });
  }
  if (contact.portalStatus && contact.portalStatus !== "active") {
    // Couvre les statuts RH "permanent_departure" / "partial_departure" /
    // "temporary_departure" / "inactive" qui doivent éjecter même si
    // isActive est resté true (rétrocompat backfill).
    return NextResponse.json(
      { valid: false, reason: `portal_status_${contact.portalStatus}` },
      { status: 401 },
    );
  }
  if (!contact.organization?.isActive) {
    return NextResponse.json({ valid: false, reason: "org_inactive" }, { status: 401 });
  }
  if (!contact.organization?.portalEnabled) {
    return NextResponse.json({ valid: false, reason: "org_portal_disabled" }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
