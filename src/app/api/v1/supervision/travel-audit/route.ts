// ============================================================================
// GET /api/v1/supervision/travel-audit?from=&to=
//
// Audit automatique des déplacements chez les clients :
//   - Source : CalendarEvent kind=WORK_LOCATION avec organizationId + agents.
//   - Référence : OrgMileageRate.billToClient (si false on ignore — pas
//     facturable par contrat).
//   - Facturation : TimeEntry `isOnsite=true` le même jour pour la même
//     organisation, groupée par agent.
//
// Produit trois listes :
//   - missing    : événement dont AUCUN agent présent n'a facturé de
//                  temps onsite.
//   - duplicated : événement où 2+ agents différents ont tous deux facturé
//                  du temps onsite (normalement un seul doit facturer).
//   - ok         : tout est en ordre (inclus pour traçabilité mais UI
//                  peut le cacher par défaut).
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
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN" && me.role !== "SUPERVISOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600_000);
  const toDate = to ? new Date(to) : new Date();

  // Tous les events WORK_LOCATION sur la plage, avec agents attachés. On
  // récupère aussi ceux SANS organizationId : on tentera de décoder leur
  // titre brut ("BR LV") vers un client via calendarAliases + clientCode.
  const events = await prisma.calendarEvent.findMany({
    where: {
      kind: "WORK_LOCATION",
      startsAt: { gte: fromDate, lte: toDate },
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
    orderBy: { startsAt: "desc" },
  });

  if (events.length === 0) {
    return NextResponse.json({ missing: [], duplicated: [], ok: [] });
  }

  // Charge tous les agents actifs et toutes les orgs une seule fois pour
  // le décodeur — évite N lookups.
  const [allAgents, allOrgs] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { not: "CLIENT_ADMIN" } },
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
  const orgById = new Map(allOrgs.map((o) => [o.id, o]));

  // Étape 1 : résoudre pour CHAQUE event une (org, agents) — soit via
  // les champs Prisma, soit via le décodeur sur rawTitle.
  interface Resolved {
    event: (typeof events)[number];
    organizationId: string;
    organizationName: string;
    agents: Array<{ id: string; name: string }>;
    source: "db" | "decoded";
  }
  const resolved: Resolved[] = [];
  for (const ev of events) {
    // Cas 1 — tout est déjà propre en DB.
    // Multi-orgs (ex : "SADB/BDU") : on émet une Resolved par org listée
    // dans `organizationIds` pour que l'audit couvre les 2 clients visités.
    if (ev.organizationId && ev.agents.length > 0) {
      const dbOrgIds = ev.organizationIds && ev.organizationIds.length > 0
        ? ev.organizationIds
        : [ev.organizationId];
      for (const oid of dbOrgIds) {
        const meta = orgById.get(oid);
        resolved.push({
          event: ev,
          organizationId: oid,
          organizationName: meta?.name ?? (oid === ev.organizationId ? ev.organization?.name ?? "" : ""),
          agents: ev.agents.map((a) => ({
            id: a.userId,
            name: `${a.user.firstName} ${a.user.lastName}`.trim(),
          })),
          source: "db",
        });
      }
      continue;
    }
    // Cas 2 — on tente de décoder le titre. Un event peut mentionner
    // plusieurs clients ("SF/MV SADB/BDU") — on émet alors une Resolved
    // par (event × client) pour que CHAQUE client apparaisse dans l'audit.
    const titleToDecode = ev.rawTitle || ev.title;
    const d = decodeLocationTitle(titleToDecode, decAgents, decOrgs);
    if (!d.ok) continue;
    if (d.locationKind !== "client") continue;
    const orgsForEvent = d.organizations && d.organizations.length > 0
      ? d.organizations
      : d.organizationId
        ? [{ id: d.organizationId, name: d.organizationName ?? "" }]
        : [];
    if (orgsForEvent.length === 0) continue;
    const decodedAgents = d.agents.map((a) => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName}`.trim(),
    }));
    for (const o of orgsForEvent) {
      const orgMeta = orgById.get(o.id);
      resolved.push({
        event: ev,
        organizationId: o.id,
        organizationName: o.name || orgMeta?.name || "",
        agents: decodedAgents,
        source: "decoded",
      });
    }
  }

  // Retire les events rattachés à une org interne (Cetix/BUREAU). Pas
  // d'allocation kilométrique ni de facturation quand un agent vient au
  // bureau — aucun avis de déplacement non facturé ne doit apparaître.
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (orgById.get(resolved[i].organizationId)?.isInternal) {
      resolved.splice(i, 1);
    }
  }

  if (resolved.length === 0) {
    return NextResponse.json({ missing: [], duplicated: [], ok: [] });
  }

  const orgIds = Array.from(new Set(resolved.map((r) => r.organizationId)));
  const rates = await prisma.orgMileageRate.findMany({
    where: { organizationId: { in: orgIds } },
    select: { organizationId: true, billToClient: true, kmRoundTrip: true, agentRatePerKm: true },
  });
  const rateByOrg = new Map(rates.map((r) => [r.organizationId, r]));

  // Time entries onsite sur la plage, regroupées par (org, date, agent).
  // TimeEntry n'a pas de relation Prisma vers Ticket ni User, on fait deux
  // lookups séparés et on merge.
  const rawTimeEntries = await prisma.timeEntry.findMany({
    where: {
      isOnsite: true,
      organizationId: { in: orgIds },
      startedAt: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      agentId: true,
      organizationId: true,
      startedAt: true,
      ticketId: true,
    },
  });
  const ticketIds = Array.from(new Set(rawTimeEntries.map((t) => t.ticketId)));
  const agentIds = Array.from(new Set(rawTimeEntries.map((t) => t.agentId)));
  const [tickets, agents] = await Promise.all([
    ticketIds.length > 0
      ? prisma.ticket.findMany({
          where: { id: { in: ticketIds } },
          select: { id: true, number: true, subject: true },
        })
      : Promise.resolve([]),
    agentIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
  ]);
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const timeEntries = rawTimeEntries.map((t) => ({
    ...t,
    ticket: ticketById.get(t.ticketId) ?? null,
    agent: agentById.get(t.agentId) ?? null,
  }));

  interface Row {
    eventId: string;
    title: string;
    rawTitle: string | null;
    startsAt: string;
    organizationId: string;
    organizationName: string;
    source: "db" | "decoded";
    expectedAgents: Array<{ id: string; name: string }>;
    billedEntries: Array<{
      timeEntryId: string;
      agentId: string;
      agentName: string;
      ticketId: string;
      ticketNumber: number;
      ticketSubject: string;
    }>;
    status: "missing" | "duplicated" | "ok" | "not_billable";
  }

  const missing: Row[] = [];
  const duplicated: Row[] = [];
  const ok: Row[] = [];

  for (const r of resolved) {
    const rate = rateByOrg.get(r.organizationId);
    const billable = rate?.billToClient !== false; // défaut true si rate absent
    const evDate = new Date(r.event.startsAt);

    const entriesForEvent = timeEntries.filter(
      (t) =>
        t.organizationId === r.organizationId &&
        sameLocalDate(new Date(t.startedAt), evDate),
    );

    // Set unique des agents qui ont facturé
    const agentsBilled = new Set(entriesForEvent.map((t) => t.agentId));

    // Événements multi-clients : on préfixe l'org pour garder une clé unique
    // (sinon React réutilise le même nœud pour deux rows distinctes).
    const rowEventId = resolved.filter((x) => x.event.id === r.event.id).length > 1
      ? `${r.event.id}__${r.organizationId}`
      : r.event.id;
    const row: Row = {
      eventId: rowEventId,
      title: r.event.title,
      rawTitle: r.event.rawTitle,
      startsAt: r.event.startsAt.toISOString(),
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      source: r.source,
      expectedAgents: r.agents,
      billedEntries: entriesForEvent.map((t) => ({
        timeEntryId: t.id,
        agentId: t.agentId,
        agentName: t.agent ? `${t.agent.firstName} ${t.agent.lastName}`.trim() : "",
        ticketId: t.ticketId,
        ticketNumber: t.ticket?.number ?? 0,
        ticketSubject: t.ticket?.subject ?? "",
      })),
      status: "ok",
    };

    if (!billable) {
      row.status = "not_billable";
      ok.push(row);
      continue;
    }

    if (agentsBilled.size === 0) {
      row.status = "missing";
      missing.push(row);
    } else if (agentsBilled.size > 1) {
      // Plusieurs agents ont facturé onsite le même jour pour le même
      // client → potentiel doublon (un seul devrait facturer).
      row.status = "duplicated";
      duplicated.push(row);
    } else {
      row.status = "ok";
      ok.push(row);
    }
  }

  return NextResponse.json({
    missing,
    duplicated,
    ok,
    range: { from: fromDate.toISOString(), to: toDate.toISOString() },
  });
}
