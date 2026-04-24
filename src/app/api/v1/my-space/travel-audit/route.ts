// ============================================================================
// GET /api/v1/my-space/travel-audit?from=&to=
//
// Version agent-facing du travel-audit superviseur. Retourne UNIQUEMENT les
// déplacements potentiellement oubliés par l'agent connecté :
//   - Event WORK_LOCATION avec l'agent dans la liste des attendus (ou
//     décodé depuis le titre).
//   - Aucun autre agent n'a facturé onsite ce jour-là pour ce client.
//     Si un collègue l'a déjà facturé, on ne harcèle pas l'agent connecté
//     (le déplacement est couvert).
//   - OrgMileageRate.billToClient !== false (sinon pas facturable).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  decodeLocationTitle,
  type DecodableAgent,
  type DecodableOrg,
} from "@/lib/calendar/location-decoder";

function sameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Agent sans allocation km (JT facturé en temps, MG véhicule d'entreprise) :
  // on masque les avis pour les clients NON-FACTURABLES puisqu'il n'y a
  // rien à ajouter à leurs dépenses perso. Les avis pour clients
  // facturables restent — ils doivent toujours logger l'onsite time
  // pour la facturation client.
  const meFull = await prisma.user.findUnique({
    where: { id: me.id },
    select: { mileageAllocationEnabled: true },
  });
  const mileageEnabled = meFull?.mileageAllocationEnabled !== false;

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const monthParam = req.nextUrl.searchParams.get("month");
  // Priorité : (1) from/to explicites, (2) `month=YYYY-MM` → mois complet,
  // (3) défaut = mois courant. Ancienne valeur par défaut = semaine
  // courante mais ça masquait les déplacements des semaines précédentes
  // du même mois. L'agent doit voir TOUTES les missed-travels du mois
  // qu'il consulte dans « Mes dépenses » pour pouvoir les rattraper.
  const now = new Date();
  let from: Date;
  let to: Date;
  if (fromParam) from = new Date(fromParam);
  else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
  if (toParam) to = new Date(toParam);
  else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    to = new Date(y, m, 0, 23, 59, 59, 999); // dernier jour du mois
  } else {
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const events = await prisma.calendarEvent.findMany({
    where: {
      kind: "WORK_LOCATION",
      startsAt: { gte: from, lte: to },
      status: "active",
    },
    include: {
      organization: { select: { id: true, name: true, isInternal: true } },
      agents: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });
  if (events.length === 0) {
    return NextResponse.json({ missing: [] });
  }

  // Décodeur pour les events sans lien Prisma.
  const [allAgents, allOrgs] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, isActive: true },
    }),
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        clientCode: true,
        isInternal: true,
        calendarAliases: true,
      },
    }),
  ]);
  const decAgents: DecodableAgent[] = allAgents.map((a) => ({
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    isActive: a.isActive,
  }));
  const decOrgs: DecodableOrg[] = allOrgs.map((o) => ({
    id: o.id,
    name: o.name,
    clientCode: o.clientCode,
    isInternal: o.isInternal,
    calendarAliases: o.calendarAliases,
  }));

  interface Row {
    eventId: string;
    startsAt: string;
    rawTitle: string | null;
    organizationId: string;
    organizationName: string;
  }

  // Résolution + filtre sur agent courant. Un même event peut mentionner
  // plusieurs clients ("SF/MV SADB/BDU") — on émet alors une Row par
  // (event × client) pour que chacun apparaisse dans l'alerte.
  const relevant: Row[] = [];
  for (const ev of events) {
    let orgsForEvent: Array<{ id: string; name: string }> = [];
    let agentIds: string[] = [];

    if (ev.organizationId && ev.agents.length > 0) {
      // Multi-orgs (SADB/BDU) : `organizationIds` contient tous les clients
      // visités ; fan-out pour que chacun ait sa row d'audit.
      const dbOrgIds = ev.organizationIds && ev.organizationIds.length > 0
        ? ev.organizationIds
        : [ev.organizationId];
      orgsForEvent = dbOrgIds.map((oid) => ({
        id: oid,
        name: oid === ev.organizationId ? (ev.organization?.name ?? "") : "",
      }));
      agentIds = ev.agents.map((a) => a.userId);
    } else {
      const d = decodeLocationTitle(ev.rawTitle || ev.title, decAgents, decOrgs);
      if (!d.ok || d.locationKind !== "client") continue;
      if (d.organizations && d.organizations.length > 0) {
        orgsForEvent = d.organizations;
      } else if (d.organizationId) {
        orgsForEvent = [{ id: d.organizationId, name: d.organizationName ?? "" }];
      } else {
        continue;
      }
      agentIds = d.agents.map((a) => a.id);
    }

    if (!agentIds.includes(me.id)) continue;

    for (const o of orgsForEvent) {
      relevant.push({
        eventId: orgsForEvent.length > 1 ? `${ev.id}__${o.id}` : ev.id,
        startsAt: ev.startsAt.toISOString(),
        rawTitle: ev.rawTitle,
        organizationId: o.id,
        organizationName: o.name,
      });
    }
  }
  if (relevant.length === 0) {
    return NextResponse.json({ missing: [] });
  }

  // Rates — si billToClient=false, skip (pas facturable).
  const orgIds = Array.from(new Set(relevant.map((r) => r.organizationId)));
  const [rates, orgsForNames] = await Promise.all([
    prisma.orgMileageRate.findMany({
      where: { organizationId: { in: orgIds } },
      select: { organizationId: true, billToClient: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, isInternal: true },
    }),
  ]);
  const rateByOrg = new Map(rates.map((r) => [r.organizationId, r]));
  const nameByOrgId = new Map(orgsForNames.map((o) => [o.id, o.name]));
  const internalOrgIds = new Set(orgsForNames.filter((o) => o.isInternal).map((o) => o.id));
  // Patch missing names (multi-org rows where we left name empty) +
  // retire les rows Cetix (isInternal). Un agent qui va « BUREAU »
  // n'est pas en déplacement facturable — aucun avis ne doit apparaître.
  for (const r of relevant) {
    if (!r.organizationName) r.organizationName = nameByOrgId.get(r.organizationId) ?? "";
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _beforeInternalFilter = relevant.length;
  for (let i = relevant.length - 1; i >= 0; i--) {
    if (internalOrgIds.has(relevant[i].organizationId)) relevant.splice(i, 1);
  }

  // Time entries onsite (tous agents) sur la plage pour ces orgs : si un
  // collègue a facturé, on ne signale pas.
  // Et aussi ExpenseEntry catégorie "Kilométrage" de l'agent courant :
  // pour les clients non facturables où le déplacement s'ajoute comme
  // dépense (pas comme time entry), c'est CE record qui vaut "trip
  // enregistré" — sans ça, l'alerte persiste après clic.
  const [timeEntries, mileageExpenses] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        isOnsite: true,
        organizationId: { in: orgIds },
        startedAt: { gte: from, lte: to },
      },
      select: { agentId: true, organizationId: true, startedAt: true },
    }),
    prisma.expenseEntry.findMany({
      where: {
        category: "Kilométrage",
        organizationId: { in: orgIds },
        date: { gte: from, lte: to },
        report: { submitterId: me.id },
      },
      select: { organizationId: true, date: true },
    }),
  ]);

  const missing = relevant.filter((r) => {
    const evDate = new Date(r.startsAt);
    const hasBilled = timeEntries.some(
      (t) =>
        t.organizationId === r.organizationId &&
        sameLocalDate(new Date(t.startedAt), evDate),
    );
    if (hasBilled) return false;
    const hasMileageExpense = mileageExpenses.some(
      (e) =>
        e.organizationId === r.organizationId &&
        sameLocalDate(new Date(e.date), evDate),
    );
    if (hasMileageExpense) return false;

    // Agent sans allocation km : on masque les avis NON-FACTURABLES
    // (rien à ajouter côté dépenses perso). Les avis facturables
    // restent — obligation de logger l'onsite time pour le client.
    if (!mileageEnabled) {
      const rate = rateByOrg.get(r.organizationId);
      const billable = rate?.billToClient !== false;
      if (!billable) return false;
    }
    return true;
  });

  return NextResponse.json({
    missing: missing.map((r) => ({
      eventId: r.eventId,
      startsAt: r.startsAt,
      rawTitle: r.rawTitle,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      // true par défaut quand il n'y a pas de barème — on présume que
      // ça sera facturé et on demande un ticket. L'agent règle la config
      // en Paramètres pour inverser.
      billToClient: rateByOrg.get(r.organizationId)?.billToClient ?? true,
    })),
    range: { from: from.toISOString(), to: to.toISOString() },
  });
}
