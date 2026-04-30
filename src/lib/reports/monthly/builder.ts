// ============================================================================
// BUILDER — Calcule le payload d'un rapport mensuel client à partir de la DB.
//
// Scope : un (organizationId, period) → un snapshot complet. Toutes les
// requêtes sont paginées par période pour éviter de charger des volumes
// disproportionnés. Les relations Ticket/User/Contact sont hydratées en
// bulk pour éviter N+1.
//
// Le payload retourné est figé : persisté tel quel dans la DB, réutilisé
// pour rendre le PDF. Si un TimeEntry est modifié après la génération, le
// rapport existant ne change pas tant qu'on ne le regénère pas.
// ============================================================================

import prisma from "@/lib/prisma";
import { isBillable as isBillableCoverage, isCovered as isCoveredCoverage, isNonBillable as isNonBillableCoverage, EXCLUDED_APPROVAL_STATUSES } from "@/lib/billing/coverage-statuses";
import { getClientTicketPrefix, formatTicketNumber } from "@/lib/tenant-settings/service";
import type {
  MonthlyReportPayload,
  MonthlyReportTicketBlock,
  MonthlyReportTripLine,
  MonthlyReportTimeEntryLine,
  MonthlyReportAgentBreakdown,
  MonthlyReportRequesterBreakdown,
} from "./types";

/** Format period string "YYYY-MM" → [startOfMonth, endOfMonth] en local time. */
export function monthBounds(period: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error(`Invalid period format, expected YYYY-MM: ${period}`);
  const [, yStr, mStr] = match;
  const y = Number(yStr);
  const m = Number(mStr);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

function periodLabel(start: Date): string {
  return start.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Formate le numéro de ticket pour l'affichage client.
 *
 * AVANT : `TK-${number}` retournait le raw DB number → discordant
 * avec l'affichage du portail / fiche ticket / sidebar qui appliquent
 * `formatTicketNumber()` (= prefix + 1000 + number). Bug user signalé :
 * "TK-28641" dans le portail apparaissait "TK-27641" dans le PDF.
 *
 * Maintenant : utilise `formatTicketNumber()` canonique. Le préfixe
 * client est chargé une seule fois en début de build via
 * `loadClientPrefix()` puis injecté dans cette fonction.
 */
function displayTicketId(number: number, isInternal: boolean, clientPrefix: string): string {
  return formatTicketNumber(number, isInternal, clientPrefix);
}

function round1(n: number): number {
  // 2 décimales (le nom historique est conservé pour ne pas toucher
  // les call sites). Avant : 1 décimale → 0.25h s'affichait 0.3h ce
  // qui mentait par rapport à l'unité de facturation. 0.25h doit
  // rester visible tel quel.
  return Math.round(n * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Délégation aux helpers canoniques (src/lib/billing/coverage-statuses.ts)
// pour garder le PDF mensuel client COHÉRENT avec les KPI dashboards.
//
// AVANT : `isBillableStatus` ne reconnaissait que "billable" — les entries
// "travel_billable", "hour_bank_overage", "msp_overage" étaient comptées en
// non-facturable dans le PDF, alors que les dashboards les comptaient en
// facturable. Résultat : KPI Finances ≠ rapport client envoyé en PDF.
//
// AVANT : `isCoveredStatus` incluait "msp_monthly" (qui est en réalité un
// type de contrat, pas un coverageStatus jamais assigné par engine.ts) →
// code mort. Maintenant aligné sur les valeurs effectivement assignées.
function isBillableStatus(coverageStatus: string): boolean {
  return isBillableCoverage(coverageStatus);
}

function isCoveredStatus(coverageStatus: string): boolean {
  return isCoveredCoverage(coverageStatus);
}

function isNonBillableStatus(coverageStatus: string): boolean {
  return isNonBillableCoverage(coverageStatus);
}

export interface BuildOptions {
  organizationId: string;
  /** "YYYY-MM" */
  period: string;
  generatedBy?: { id: string; fullName: string } | null;
}

export async function buildMonthlyReportPayload(
  opts: BuildOptions,
): Promise<MonthlyReportPayload> {
  const { organizationId, period } = opts;
  const { start, end } = monthBounds(period);

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      clientCode: true,
      logo: true,
      primaryColor: true,
      address: true,
      city: true,
      province: true,
      orgBillingConfig: true,
      mileageRate: {
        select: { kmRoundTrip: true, billToClient: true, flatFee: true },
      },
    },
  });
  if (!org) throw new Error(`Organization not found: ${organizationId}`);

  // Charge une fois le préfixe client global (TK par défaut) pour formater
  // les numéros de tickets de manière COHÉRENTE avec le portail/fiche
  // (formatTicketNumber ajoute +1000 et applique le préfixe client).
  const clientPrefix = await getClientTicketPrefix();

  // 1) Time entries du mois, scope org. Rejected exclus du PDF mensuel —
  // une saisie rejetée n'a rien à voir dans le rapport client (cf.
  // EXCLUDED_APPROVAL_STATUSES).
  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      startedAt: { gte: start, lte: end },
      approvalStatus: { notIn: EXCLUDED_APPROVAL_STATUSES as unknown as string[] },
    },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      ticketId: true,
      agentId: true,
      startedAt: true,
      durationMinutes: true,
      description: true,
      timeType: true,
      isOnsite: true,
      isAfterHours: true,
      isWeekend: true,
      isUrgent: true,
      hasTravelBilled: true,
      travelDurationMinutes: true,
      coverageStatus: true,
      coverageReason: true,
      hourlyRate: true,
      amount: true,
    },
  });

  const ticketIds = Array.from(new Set(entries.map((e) => e.ticketId)));
  const agentIds = Array.from(new Set(entries.map((e) => e.agentId)));

  // 2) Tickets touchés dans le mois + tickets créés/résolus dans le mois.
  //    On a besoin des créés/résolus pour la section "Tickets par demandeur"
  //    même si aucun temps n'a été saisi (un ticket créé et pas encore traité
  //    compte quand même dans l'activité du mois).
  const ticketsTouchedOrInMonth = await prisma.ticket.findMany({
    where: {
      organizationId,
      OR: [
        { id: { in: ticketIds } },
        { createdAt: { gte: start, lte: end } },
        { resolvedAt: { gte: start, lte: end } },
      ],
    },
    select: {
      id: true,
      number: true,
      isInternal: true,
      subject: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      closedAt: true,
      requesterId: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      // Résumé IA pré-généré (warmup en arrière-plan après chaque
      // génération de rapport). Si null/non-confiant, on n'affiche rien.
      aiSummary: true,
      aiSummaryConfidence: true,
      requester: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      },
    },
  });
  const ticketById = new Map(ticketsTouchedOrInMonth.map((t) => [t.id, t]));

  // 3) Agents hydratés.
  const agents = await prisma.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const agentById = new Map(
    agents.map((a) => [
      a.id,
      {
        id: a.id,
        fullName: `${a.firstName} ${a.lastName}`.trim() || a.email,
        email: a.email,
      },
    ]),
  );
  function agentOf(id: string) {
    return (
      agentById.get(id) ?? { id, fullName: "Technicien inconnu", email: "" }
    );
  }

  // 4) Contrats actifs (pour en-tête financier).
  const contracts = await prisma.contract.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      OR: [{ endDate: null }, { endDate: { gte: start } }],
      startDate: { lte: end },
    },
    select: {
      id: true,
      name: true,
      type: true,
      monthlyHours: true,
      hourlyRate: true,
    },
  });

  // 5) Derniers commentaires non-internes pour chaque ticket — utilisés
  //    comme note de résolution (le dernier message visible au client).
  const lastPublicComments =
    ticketIds.length > 0
      ? await prisma.comment.findMany({
          where: { ticketId: { in: ticketIds }, isInternal: false },
          orderBy: { createdAt: "desc" },
          select: { ticketId: true, body: true, createdAt: true },
        })
      : [];
  const resolutionNoteByTicket = new Map<string, string>();
  for (const c of lastPublicComments) {
    if (!resolutionNoteByTicket.has(c.ticketId)) {
      resolutionNoteByTicket.set(c.ticketId, c.body.trim());
    }
  }

  // 6) Agrégations.
  const byAgentMap = new Map<
    string,
    {
      minutes: number;
      billableMinutes: number;
      billedAmount: number;
      weightedRateMinutes: number; // somme(minutes * rate) sur entries facturables
    }
  >();
  const byTicketMap = new Map<
    string,
    {
      minutes: number;
      billableMinutes: number;
      amount: number;
      agents: Map<string, number>;
      entries: MonthlyReportTimeEntryLine[];
    }
  >();

  // Déduplication des déplacements par (agentId, day, orgId).
  // Un déplacement = journée où l'agent a au moins une entry isOnsite=true.
  const tripSeen = new Set<string>();
  /** Pour chaque déplacement, on garde le premier ticket visité ce jour. */
  const tripPicks = new Map<
    string,
    { date: string; agentId: string; ticketId: string; firstEntryAt: Date }
  >();

  let totalMinutes = 0;
  let billableMinutes = 0;
  let coveredMinutes = 0;
  let nonBillableMinutes = 0;
  let hoursAmount = 0;

  for (const e of entries) {
    totalMinutes += e.durationMinutes;
    if (isBillableStatus(e.coverageStatus)) {
      billableMinutes += e.durationMinutes;
      hoursAmount += e.amount ?? 0;
    } else if (isCoveredStatus(e.coverageStatus)) {
      coveredMinutes += e.durationMinutes;
    } else if (isNonBillableStatus(e.coverageStatus)) {
      nonBillableMinutes += e.durationMinutes;
    }

    // By agent
    const a = byAgentMap.get(e.agentId) ?? {
      minutes: 0,
      billableMinutes: 0,
      billedAmount: 0,
      weightedRateMinutes: 0,
    };
    a.minutes += e.durationMinutes;
    if (isBillableStatus(e.coverageStatus)) {
      a.billableMinutes += e.durationMinutes;
      a.billedAmount += e.amount ?? 0;
      if (e.hourlyRate != null && e.hourlyRate > 0) {
        a.weightedRateMinutes += e.hourlyRate * e.durationMinutes;
      }
    }
    byAgentMap.set(e.agentId, a);

    // By ticket
    const bt = byTicketMap.get(e.ticketId) ?? {
      minutes: 0,
      billableMinutes: 0,
      amount: 0,
      agents: new Map<string, number>(),
      entries: [] as MonthlyReportTimeEntryLine[],
    };
    bt.minutes += e.durationMinutes;
    if (isBillableStatus(e.coverageStatus)) {
      bt.billableMinutes += e.durationMinutes;
      bt.amount += e.amount ?? 0;
    }
    const agentName = agentOf(e.agentId).fullName;
    bt.agents.set(agentName, (bt.agents.get(agentName) ?? 0) + e.durationMinutes);
    // Calcul des minutes effectivement facturées : si l'entrée a un
    // amount + un hourlyRate > 0, on dérive ce qui a été facturé. Si
    // entryBillableMinutes < durationMinutes, le reste est inclus au
    // forfait (cas du dépassement partiel — ex: 0.75 h FTIG + 0.25 h
    // facturé).
    let entryBillableMinutes: number | null = null;
    if (e.amount != null && e.hourlyRate != null && e.hourlyRate > 0) {
      entryBillableMinutes = Math.round((e.amount / e.hourlyRate) * 60 * 100) / 100;
    }
    bt.entries.push({
      id: e.id,
      date: isoDate(e.startedAt),
      agentName,
      durationMinutes: e.durationMinutes,
      description: (e.description ?? "").trim(),
      coverageStatus: e.coverageStatus,
      amount: e.amount ?? null,
      // Flags contextuels — permettent au document de rendre des badges
      // (Soir / Weekend / Urgent / Sur place / Déplacement+durée) qui
      // expliquent les variations de tarif horaire visible côté client.
      timeType: e.timeType,
      isAfterHours: e.isAfterHours,
      isWeekend: e.isWeekend,
      isUrgent: e.isUrgent,
      isOnsite: e.isOnsite,
      hasTravelBilled: e.hasTravelBilled,
      travelDurationMinutes: e.travelDurationMinutes ?? null,
      hourlyRate: e.hourlyRate ?? null,
      billableMinutes: entryBillableMinutes,
      coverageReason: e.coverageReason ?? "",
    });
    byTicketMap.set(e.ticketId, bt);

    // Déplacements : on s'appuie sur le flag `hasTravelBilled` posé
    // par l'agent dans la modale de saisie (au lieu de l'ancien `isOnsite`
    // qui était trop large). Dédup par (agent, jour, ticket) pour éviter
    // les doublons quand un agent a plusieurs entries pour le même
    // déplacement le même jour. Un déplacement par CONJONCTION (agent +
    // jour + ticket) — si le même agent visite deux clients le même jour
    // sur deux tickets, ça compte comme deux déplacements distincts.
    if (e.hasTravelBilled) {
      const dayKey = isoDate(e.startedAt);
      const tripKey = `${e.agentId}|${dayKey}|${e.ticketId}`;
      if (!tripSeen.has(tripKey)) {
        tripSeen.add(tripKey);
        tripPicks.set(tripKey, {
          date: dayKey,
          agentId: e.agentId,
          ticketId: e.ticketId,
          firstEntryAt: e.startedAt,
        });
      } else {
        const existing = tripPicks.get(tripKey)!;
        if (e.startedAt < existing.firstEntryAt) {
          tripPicks.set(tripKey, {
            date: dayKey,
            agentId: e.agentId,
            ticketId: e.ticketId,
            firstEntryAt: e.startedAt,
          });
        }
      }
    }
  }

  // 7) Montant facturable déplacement par client = taux horaire du déplacement
  //    multiplié ? Non — la source actuelle ne facture pas client au km (c'est
  //    un remboursement agent). Le coût client du déplacement est implicite
  //    dans le hourlyRate des time entries onsite (work type). Donc ici, si
  //    billToClient=true, on affiche 0 $ par déplacement avec la mention
  //    "facturé via le taux horaire onsite". Pour l'instant on ne met aucun
  //    montant (billedAmount=null sur chaque ligne) car il n'existe pas
  //    encore de "frais fixe par déplacement" modélisé. Si plus tard on
  //    ajoute un champ `tripFlatRate`, on le remplira ici.
  const mileage = org.mileageRate;
  const tripsBillable = !!mileage?.billToClient;
  const nonBillableReason = !mileage
    ? "Aucun taux de déplacement configuré pour ce client"
    : !mileage.billToClient
      ? "Déplacements inclus au contrat — non facturés"
      : null;

  // 8) Comptages tickets (pour totaux + section demandeurs).
  const ticketsOpenedCount = Array.from(ticketById.values()).filter(
    (t) => t.createdAt >= start && t.createdAt <= end,
  ).length;
  const ticketsResolvedCount = Array.from(ticketById.values()).filter(
    (t) => t.resolvedAt != null && t.resolvedAt >= start && t.resolvedAt <= end,
  ).length;
  const ticketsTouchedCount = ticketIds.length;

  // 9) Agrégation par demandeur.
  const requesterMap = new Map<
    string,
    {
      requester: {
        id: string;
        fullName: string;
        email: string;
        jobTitle: string | null;
      };
      opened: number;
      resolved: number;
      minutes: number;
    }
  >();
  for (const t of ticketById.values()) {
    const r = t.requester;
    if (!r) continue;
    const createdInMonth = t.createdAt >= start && t.createdAt <= end;
    const resolvedInMonth =
      t.resolvedAt != null && t.resolvedAt >= start && t.resolvedAt <= end;
    const entry = requesterMap.get(r.id) ?? {
      requester: {
        id: r.id,
        fullName: `${r.firstName} ${r.lastName}`.trim() || r.email,
        email: r.email,
        jobTitle: r.jobTitle ?? null,
      },
      opened: 0,
      resolved: 0,
      minutes: 0,
    };
    if (createdInMonth) entry.opened += 1;
    if (resolvedInMonth) entry.resolved += 1;
    const tk = byTicketMap.get(t.id);
    if (tk) entry.minutes += tk.minutes;
    requesterMap.set(r.id, entry);
  }

  const byRequester: MonthlyReportRequesterBreakdown[] = Array.from(
    requesterMap.values(),
  )
    .map((r) => ({
      requester: r.requester,
      ticketsOpenedThisMonth: r.opened,
      ticketsResolvedThisMonth: r.resolved,
      totalMinutes: r.minutes,
    }))
    .sort((a, b) => {
      const aCount = a.ticketsOpenedThisMonth + a.ticketsResolvedThisMonth;
      const bCount = b.ticketsOpenedThisMonth + b.ticketsResolvedThisMonth;
      if (bCount !== aCount) return bCount - aCount;
      return b.totalMinutes - a.totalMinutes;
    });

  // 10) Construction byAgent.
  const byAgent: MonthlyReportAgentBreakdown[] = Array.from(byAgentMap.entries())
    .map(([agentId, a]) => {
      const averageRate =
        a.billableMinutes > 0 && a.weightedRateMinutes > 0
          ? round2(a.weightedRateMinutes / a.billableMinutes)
          : null;
      return {
        agent: agentOf(agentId),
        hours: round1(a.minutes / 60),
        billableHours: round1(a.billableMinutes / 60),
        averageRate,
        billedAmount: round2(a.billedAmount),
        share: totalMinutes > 0 ? a.minutes / totalMinutes : 0,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  // 11) Trips.
  // Si l'org a un OrgMileageRate.flatFee défini, on utilise ce montant fixe
  // par déplacement (mode forfait — typiquement 40 $ pour HVAC). Sinon
  // (mode kilométrique) le client n'est pas facturé directement par
  // déplacement — la facturation se fait via le taux horaire onsite.
  // Dans ce dernier cas, on n'affiche pas de montant.
  //
  // FTIG : si l'org a un forfait FTIG actif sur la période avec un quota
  // de déplacements inclus (`includedTravelCount`), on marque les N
  // premiers déplacements (par ordre chrono) comme `included` et les
  // suivants comme `billable`. Ce statut est rendu dans le PDF.
  let ftigIncludedTravelCount = 0;
  try {
    const billingCfg = await prisma.orgBillingConfig.findUnique({
      where: { organizationId: org.id },
      select: { billingTypes: true, ftig: true },
    });
    if (billingCfg?.billingTypes?.includes("ftig") && billingCfg.ftig) {
      const f = billingCfg.ftig as Record<string, unknown>;
      const startDate = (f.startDate as string | undefined) ?? null;
      const endDate = (f.endDate as string | undefined) ?? null;
      const periodMid = new Date(start.getFullYear(), start.getMonth(), 15);
      const inRange =
        (!startDate || new Date(startDate) <= periodMid) &&
        (!endDate || new Date(endDate) >= periodMid);
      if (inRange) {
        ftigIncludedTravelCount = Math.max(0, Number(f.includedTravelCount ?? 0));
      }
    }
  } catch { /* sans bloquer la génération si la config est introuvable */ }

  const tripFlatFee = mileage?.flatFee ?? null;
  const sortedTrips = Array.from(tripPicks.values()).sort((a, b) => a.date.localeCompare(b.date));
  const tripLines: MonthlyReportTripLine[] = sortedTrips.map((t, idx) => {
    const ticket = ticketById.get(t.ticketId);
    let ftigStatus: "included" | "billable" | "none" = "none";
    if (ftigIncludedTravelCount > 0) {
      ftigStatus = idx < ftigIncludedTravelCount ? "included" : "billable";
    }
    return {
      date: t.date,
      agentName: agentOf(t.agentId).fullName,
      ticketDisplayId: ticket ? displayTicketId(ticket.number, !!ticket.isInternal, clientPrefix) : null,
      ticketSubject: ticket?.subject ?? null,
      billedAmount: tripsBillable
        ? (tripFlatFee != null ? tripFlatFee : 0)
        : null,
      ftigStatus,
    };
  });

  // 12) Construction tickets (détail).
  const ticketsBlocks: MonthlyReportTicketBlock[] = [];
  // Affiche UNIQUEMENT les tickets qui ont au moins une saisie de temps
  // dans le mois. Un ticket simplement créé ou résolu sans intervention
  // facturable n'a pas sa place dans le détail client (les compteurs
  // globaux dans `totals` reflètent toujours créés/résolus).
  const ticketIdsToShow = ticketIds;

  for (const tid of ticketIdsToShow) {
    const t = ticketById.get(tid);
    if (!t) continue;
    const bt = byTicketMap.get(tid) ?? {
      minutes: 0,
      billableMinutes: 0,
      amount: 0,
      agents: new Map<string, number>(),
      entries: [],
    };
    // Résumé IA — uniquement si déjà persisté avec confiance >= 0.8.
    // Pas de génération inline ici : trop lent (peut prendre des minutes
    // pour un rapport avec beaucoup de tickets et faire timeout côté
    // navigateur). Le warmup est lancé en arrière-plan par le service
    // après la génération du rapport (cf. service.ts → warmReportSummaries).
    const aiSummary =
      t.aiSummary && (t.aiSummaryConfidence ?? 0) >= 0.8 ? t.aiSummary : null;

    ticketsBlocks.push({
      displayId: displayTicketId(t.number, !!t.isInternal, clientPrefix),
      ticketId: t.id,
      subject: t.subject,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
      closedAt: t.closedAt ? t.closedAt.toISOString() : null,
      requesterName: t.requester
        ? `${t.requester.firstName} ${t.requester.lastName}`.trim() ||
          t.requester.email
        : null,
      agents: Array.from(bt.agents.entries())
        .map(([name, minutes]) => ({ name, minutes }))
        .sort((a, b) => b.minutes - a.minutes),
      totalMinutes: bt.minutes,
      billableMinutes: bt.billableMinutes,
      totalAmount: round2(bt.amount),
      resolutionNote: resolutionNoteByTicket.get(tid) ?? null,
      timeEntries: bt.entries.sort((a, b) => a.date.localeCompare(b.date)),
      aiSummary,
    });
  }
  // Tri final : par numéro de ticket croissant.
  ticketsBlocks.sort((a, b) => a.displayId.localeCompare(b.displayId));

  // 12.5) Agrégats pour la page de récap (orientés HEURES, pas tickets).
  //
  //  - byCoverage     : inclus / facturable / non facturable
  //  - byTimeBucket   : jour / soir / weekend / urgence (mutuellement
  //                     exclusifs, priorité Urgent > Weekend > Soir > Jour)
  //  - byActivityType : remote / onsite / travel / autre — exclut internal
  //  - byCategory     : minutes par catégorie de ticket. Tickets sans
  //                     catégorie regroupés sous "Non classé".
  //
  // On exclut systématiquement le temps interne (coverageStatus
  // 'internal_time' OU timeType 'internal') de tous ces agrégats — ils
  // ne sont pas pertinents pour le client.
  const visibleEntries = entries.filter(
    (e) => e.coverageStatus !== "internal_time" && e.timeType !== "internal",
  );

  const byCoverageMin = { covered: 0, billable: 0, nonBillable: 0 };
  const byTimeBucketMin = { day: 0, evening: 0, weekend: 0, urgent: 0 };
  const byActivityMin: Record<string, number> = {};
  const byCategoryMin = new Map<string, { name: string; minutes: number }>();

  for (const e of visibleEntries) {
    if (isCoveredStatus(e.coverageStatus)) byCoverageMin.covered += e.durationMinutes;
    else if (isBillableStatus(e.coverageStatus)) byCoverageMin.billable += e.durationMinutes;
    else if (isNonBillableStatus(e.coverageStatus)) byCoverageMin.nonBillable += e.durationMinutes;

    if (e.isUrgent) byTimeBucketMin.urgent += e.durationMinutes;
    else if (e.isWeekend) byTimeBucketMin.weekend += e.durationMinutes;
    else if (e.isAfterHours) byTimeBucketMin.evening += e.durationMinutes;
    else byTimeBucketMin.day += e.durationMinutes;

    const at = e.timeType || "other";
    byActivityMin[at] = (byActivityMin[at] ?? 0) + e.durationMinutes;

    const ticket = ticketById.get(e.ticketId);
    const catId = ticket?.categoryId ?? "__uncat__";
    const catName = ticket?.category?.name ?? "Non classé";
    const cur = byCategoryMin.get(catId) ?? { name: catName, minutes: 0 };
    cur.minutes += e.durationMinutes;
    byCategoryMin.set(catId, cur);
  }

  const visibleTotalMin = Object.values(byCoverageMin).reduce((s, x) => s + x, 0);
  const safeShare = (m: number) => (visibleTotalMin > 0 ? m / visibleTotalMin : 0);

  const byCoverage = {
    coveredHours: round1(byCoverageMin.covered / 60),
    billableHours: round1(byCoverageMin.billable / 60),
    nonBillableHours: round1(byCoverageMin.nonBillable / 60),
    coveredShare: safeShare(byCoverageMin.covered),
    billableShare: safeShare(byCoverageMin.billable),
    nonBillableShare: safeShare(byCoverageMin.nonBillable),
  };

  const byTimeBucket = {
    dayHours: round1(byTimeBucketMin.day / 60),
    eveningHours: round1(byTimeBucketMin.evening / 60),
    weekendHours: round1(byTimeBucketMin.weekend / 60),
    urgentHours: round1(byTimeBucketMin.urgent / 60),
    dayShare: safeShare(byTimeBucketMin.day),
    eveningShare: safeShare(byTimeBucketMin.evening),
    weekendShare: safeShare(byTimeBucketMin.weekend),
    urgentShare: safeShare(byTimeBucketMin.urgent),
  };

  const byActivity = Object.entries(byActivityMin)
    .map(([timeType, minutes]) => ({
      timeType,
      hours: round1(minutes / 60),
      share: safeShare(minutes),
    }))
    .sort((a, b) => b.hours - a.hours);

  const byCategory = Array.from(byCategoryMin.entries())
    .map(([id, v]) => ({
      categoryId: id === "__uncat__" ? null : id,
      name: v.name,
      hours: round1(v.minutes / 60),
      share: safeShare(v.minutes),
    }))
    // Tri : non-classé en dernier, sinon par heures décroissantes.
    .sort((a, b) => {
      if (a.categoryId === null) return 1;
      if (b.categoryId === null) return -1;
      return b.hours - a.hours;
    });

  // Déplacements pour le récap : reprend trips.count et la ventilation FTIG
  // déjà calculée. On la dérive ici pour avoir un objet stable consommable
  // par le composant Recap sans qu'il ait à reparcourir trips.lines.
  const tripsRecap = {
    total: tripLines.length,
    includedFtig: tripLines.filter((t) => t.ftigStatus === "included").length,
    billable: tripLines.filter((t) => t.ftigStatus === "billable").length,
    ftigActive: tripLines.some((t) => t.ftigStatus !== "none"),
  };

  // 12.6) Suivi de banque d'heures (si configurée sur l'org).
  //   - Lit orgBillingConfig.hourBank pour total / startDate / endDate.
  //   - Agrège les heures consommées par mois sur la période complète,
  //     en ne comptant que les saisies marquées comme banque d'heures
  //     (coverage_status = 'deducted_from_hour_bank').
  //   - Calcule cumul, projection, status (on_track / warning / overage).
  //   - Si pas de banque configurée → hourBankTracking reste undefined
  //     et la section ne sera pas rendue.
  const billingCfg = (org.orgBillingConfig ?? null) as
    | { hourBank?: { hourlyRate?: number; totalHours?: number; overageRate?: number; startDate?: string; endDate?: string } }
    | null;
  const hb = billingCfg?.hourBank;
  let hourBankTracking: MonthlyReportPayload["hourBankTracking"];
  if (hb && typeof hb.totalHours === "number" && hb.totalHours > 0 && hb.startDate && hb.endDate) {
    // Parse les dates en heure LOCALE pour éviter le décalage UTC qui
    // ferait qu'un "2026-01-01" stocké en string parsé en UTC tombe sur
    // "2025-12-31" en heure locale (et fait apparaître un mois fantôme
    // dans l'histogramme).
    const [hbStartY, hbStartM, hbStartD] = hb.startDate.slice(0, 10).split("-").map(Number);
    const [hbEndY, hbEndM, hbEndD] = hb.endDate.slice(0, 10).split("-").map(Number);
    const hbStart = new Date(hbStartY, hbStartM - 1, hbStartD, 0, 0, 0, 0);
    const hbEnd = new Date(hbEndY, hbEndM - 1, hbEndD, 23, 59, 59, 999);
    // Période effective de calcul cumul/projection : du début de la
    // banque jusqu'à la fin du mois rapporté inclus.
    const cutoffEnd = end < hbEnd ? end : hbEnd;

    // Heures consommées (banque) sur la période startDate → cutoffEnd.
    const consumed = await prisma.timeEntry.aggregate({
      where: {
        organizationId,
        coverageStatus: "deducted_from_hour_bank",
        startedAt: { gte: hbStart, lte: cutoffEnd },
        approvalStatus: { notIn: EXCLUDED_APPROVAL_STATUSES as unknown as string[] },
      },
      _sum: { durationMinutes: true },
    });
    const consumedMinutes = consumed._sum.durationMinutes ?? 0;
    const consumedHours = round1(consumedMinutes / 60);

    // Histo mensuel : itération de hbStart à hbEnd, mois par mois.
    // Récupère toutes les saisies banque sur la période COMPLÈTE pour
    // grouper côté JS (évite GROUP BY en SQL → portable + simple).
    const allHbEntries = await prisma.timeEntry.findMany({
      where: {
        organizationId,
        coverageStatus: "deducted_from_hour_bank",
        startedAt: { gte: hbStart, lte: hbEnd },
        approvalStatus: { notIn: EXCLUDED_APPROVAL_STATUSES as unknown as string[] },
      },
      select: { startedAt: true, durationMinutes: true },
    });
    const monthlyMap = new Map<string, number>(); // "YYYY-MM" → minutes
    for (const e of allHbEntries) {
      const k = `${e.startedAt.getFullYear()}-${String(e.startedAt.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(k, (monthlyMap.get(k) ?? 0) + e.durationMinutes);
    }

    const monthlyHistory: NonNullable<typeof hourBankTracking>["monthlyHistory"] = [];
    const currentReportKey = period; // "YYYY-MM"
    const cursor = new Date(hbStart.getFullYear(), hbStart.getMonth(), 1);
    const endCursor = new Date(hbEnd.getFullYear(), hbEnd.getMonth(), 1);
    while (cursor <= endCursor) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const minutes = monthlyMap.get(key) ?? 0;
      const isCurrentReportMonth = key === currentReportKey;
      const isFuture = cursor > new Date(start.getFullYear(), start.getMonth(), 1);
      const label = cursor.toLocaleDateString("fr-CA", { month: "short" }).replace(/\./g, "");
      monthlyHistory.push({
        month: key,
        label,
        hours: round1(minutes / 60),
        isCurrentReportMonth,
        isFuture,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Métriques calculées
    const totalMonthsInPeriod =
      (hbEnd.getFullYear() - hbStart.getFullYear()) * 12 +
      (hbEnd.getMonth() - hbStart.getMonth()) + 1;
    const targetMonthlyHours =
      totalMonthsInPeriod > 0 ? round1(hb.totalHours / totalMonthsInPeriod) : 0;

    // Mois écoulés du début à la fin du mois rapporté inclus
    const elapsedMonths =
      (start.getFullYear() - hbStart.getFullYear()) * 12 +
      (start.getMonth() - hbStart.getMonth()) + 1;
    const averageMonthlyHours =
      elapsedMonths > 0 ? round1(consumedHours / elapsedMonths) : 0;
    const projectedTotalHours = round1(averageMonthlyHours * totalMonthsInPeriod);

    let status: NonNullable<typeof hourBankTracking>["status"];
    if (consumedHours <= 0) status = "no_data";
    else if (consumedHours > hb.totalHours) status = "overage";
    else if (projectedTotalHours > hb.totalHours * 1.1) status = "overage";
    else if (projectedTotalHours > hb.totalHours) status = "warning";
    else status = "on_track";

    hourBankTracking = {
      totalHours: hb.totalHours,
      consumedHours,
      remainingHours: round1(Math.max(0, hb.totalHours - consumedHours)),
      consumedShare: hb.totalHours > 0 ? consumedHours / hb.totalHours : 0,
      periodStart: hb.startDate.slice(0, 10),
      periodEnd: hb.endDate.slice(0, 10),
      monthlyHistory,
      targetMonthlyHours,
      averageMonthlyHours,
      projectedTotalHours,
      status,
    };
  }

  // 13) Payload final.
  const payload: MonthlyReportPayload = {
    schemaVersion: 1,
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      clientCode: org.clientCode,
      logoUrl: org.logo,
      primaryColor: org.primaryColor,
      address: org.address,
      city: org.city,
      province: org.province,
    },
    period: {
      month: period,
      startDate: isoDate(start),
      endDate: isoDate(end),
      label: periodLabel(start),
    },
    generatedAt: new Date().toISOString(),
    generatedBy: opts.generatedBy ?? null,
    activeContracts: contracts.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      monthlyHours: c.monthlyHours,
      hourlyRate: c.hourlyRate,
    })),
    totals: {
      totalHours: round1(totalMinutes / 60),
      billableHours: round1(billableMinutes / 60),
      coveredHours: round1(coveredMinutes / 60),
      nonBillableHours: round1(nonBillableMinutes / 60),
      hoursAmount: round2(hoursAmount),
      // Total déplacements = somme des billedAmount des tripLines (ne
      // compte que ceux où billable=true et flatFee défini ; sinon 0).
      tripsAmount: round2(
        tripLines.reduce((s, t) => s + (t.billedAmount ?? 0), 0),
      ),
      totalAmount: round2(
        hoursAmount + tripLines.reduce((s, t) => s + (t.billedAmount ?? 0), 0),
      ),
      ticketsTouchedCount,
      ticketsOpenedCount,
      ticketsResolvedCount,
    },
    byAgent,
    byRequester,
    trips: {
      billable: tripsBillable,
      nonBillableReason,
      count: tripLines.length,
      lines: tripLines,
      totalAmount: round2(tripLines.reduce((s, t) => s + (t.billedAmount ?? 0), 0)),
    },
    tickets: ticketsBlocks,
    recap: {
      byCoverage,
      byTimeBucket,
      byActivity,
      byCategory,
      trips: tripsRecap,
    },
    hourBankTracking,
  };

  return payload;
}
