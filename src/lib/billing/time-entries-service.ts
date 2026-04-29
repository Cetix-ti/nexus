import prisma from "@/lib/prisma";

/**
 * Erreur de validation métier sur une TimeEntry — distincte de BillingLockError.
 * Les routes API peuvent la catcher pour retourner un 400 explicite plutôt
 * qu'un 500 générique.
 */
export class TimeEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeEntryValidationError";
  }
}

export interface TimeEntryRow {
  id: string;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
  organizationId: string;
  organizationName: string;
  agentId: string;
  agentName: string;
  timeType: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  description: string;
  isAfterHours: boolean;
  isWeekend: boolean;
  isUrgent: boolean;
  isOnsite: boolean;
  hasTravelBilled: boolean;
  travelDurationMinutes: number | null;
  coverageStatus: string;
  coverageReason: string;
  hourlyRate: number | null;
  amount: number | null;
  approvalStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface ListOpts {
  ticketId?: string;
  organizationId?: string;
  agentId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function listTimeEntries(
  opts: ListOpts = {}
): Promise<TimeEntryRow[]> {
  const where: Record<string, unknown> = {};
  if (opts.ticketId) where.ticketId = opts.ticketId;
  if (opts.organizationId) where.organizationId = opts.organizationId;
  if (opts.agentId) where.agentId = opts.agentId;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.gte = opts.from;
    if (opts.to) range.lte = opts.to;
    where.startedAt = range;
  }

  const rows = await prisma.timeEntry.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: opts.limit ?? 1000,
  });

  if (rows.length === 0) return [];

  // Hydrate org/ticket/agent en lookups groupés (évite N+1).
  const ticketIds = Array.from(new Set(rows.map((r) => r.ticketId)));
  const orgIds = Array.from(new Set(rows.map((r) => r.organizationId)));
  const agentIds = Array.from(new Set(rows.map((r) => r.agentId)));

  const [tickets, orgs, agents] = await Promise.all([
    prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, number: true, subject: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const ticketMap = new Map(tickets.map((t) => [t.id, t]));
  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticketId,
    ticketNumber: ticketMap.get(r.ticketId)?.number ?? 0,
    ticketSubject: ticketMap.get(r.ticketId)?.subject ?? "—",
    organizationId: r.organizationId,
    organizationName: orgMap.get(r.organizationId)?.name ?? "—",
    agentId: r.agentId,
    agentName: agentMap.get(r.agentId)
      ? `${agentMap.get(r.agentId)!.firstName} ${agentMap.get(r.agentId)!.lastName}`.trim()
      : "—",
    timeType: r.timeType,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    durationMinutes: r.durationMinutes,
    description: r.description,
    isAfterHours: r.isAfterHours,
    isWeekend: r.isWeekend,
    isUrgent: r.isUrgent,
    isOnsite: r.isOnsite,
    hasTravelBilled: r.hasTravelBilled,
    travelDurationMinutes: r.travelDurationMinutes ?? null,
    coverageStatus: r.coverageStatus,
    coverageReason: r.coverageReason,
    hourlyRate: r.hourlyRate,
    amount: r.amount,
    approvalStatus: r.approvalStatus,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createTimeEntry(input: {
  ticketId: string;
  organizationId: string;
  agentId: string;
  timeType: string;
  startedAt: Date;
  endedAt?: Date | null;
  durationMinutes: number;
  description?: string;
  isAfterHours?: boolean;
  isWeekend?: boolean;
  isUrgent?: boolean;
  isOnsite?: boolean;
  hasTravelBilled?: boolean;
  travelDurationMinutes?: number | null;
  // Ces 4 champs sont ignorés (laissés pour compat) — le serveur les
  // recalcule via resolveDecisionForEntry() avec son état de vérité.
  coverageStatus?: string;
  coverageReason?: string;
  hourlyRate?: number | null;
  amount?: number | null;
  forceNonBillable?: boolean;
  /** Type de prestation choisi par l'agent (id de OrgWorkType, axe "quoi"). */
  workTypeId?: string | null;
  /** Palier tarifaire choisi par l'agent (id de OrgRateTier, axe "combien"). */
  rateTierId?: string | null;
}) {
  // Invariant métier : on ne peut pas facturer un déplacement sans avoir
  // été physiquement sur place. `hasTravelBilled=true` requiert `isOnsite=true`.
  // Sans cette garde, l'UI peut envoyer un état incohérent (ex: bug bouton
  // mal câblé) qui produirait des saisies "travel_billable" en télétravail.
  if (input.hasTravelBilled && !input.isOnsite) {
    throw new TimeEntryValidationError(
      "Le déplacement facturé nécessite une saisie sur place (isOnsite=true).",
    );
  }

  const { checkBillingLock, BillingLockError } = await import("./period-lock");
  const lockMsg = await checkBillingLock(input.startedAt);
  if (lockMsg) throw new BillingLockError(lockMsg);

  // Revalidation serveur : on ne fait JAMAIS confiance au client pour
  // le rate / amount / coverage. Seuls les champs factuels (durée, type,
  // flags contextuels) viennent du client.
  const { resolveDecisionForEntry, bumpContractHourBank } = await import("./server-decide");
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { categoryId: true },
  });
  const { decision, contract } = await resolveDecisionForEntry({
    organizationId: input.organizationId,
    timeType: input.timeType,
    durationMinutes: input.durationMinutes,
    startedAt: input.startedAt,
    isOnsite: input.isOnsite,
    isAfterHours: input.isAfterHours,
    isWeekend: input.isWeekend,
    isUrgent: input.isUrgent,
    ticketCategoryId: ticket?.categoryId ?? undefined,
    forceNonBillable: input.forceNonBillable,
    workTypeId: input.workTypeId ?? null,
    rateTierId: input.rateTierId ?? null,
  });

  const created = await prisma.timeEntry.create({
    data: {
      ticketId: input.ticketId,
      organizationId: input.organizationId,
      agentId: input.agentId,
      timeType: input.timeType,
      startedAt: input.startedAt,
      endedAt: input.endedAt ?? null,
      durationMinutes: input.durationMinutes,
      description: input.description ?? "",
      isAfterHours: input.isAfterHours ?? false,
      isWeekend: input.isWeekend ?? false,
      isUrgent: input.isUrgent ?? false,
      isOnsite: input.isOnsite ?? false,
      hasTravelBilled: input.hasTravelBilled ?? false,
      travelDurationMinutes: input.hasTravelBilled ? (input.travelDurationMinutes ?? null) : null,
      coverageStatus: decision.status,
      coverageReason: decision.reason,
      hourlyRate: decision.rate ?? null,
      amount: decision.amount ?? null,
      workTypeId: input.workTypeId ?? null,
      rateTierId: input.rateTierId ?? null,
    },
  });

  // Banque d'heures : si la décision a consommé du solde, on incrémente
  // atomiquement côté serveur. Le routage dépend du type de contrat :
  //   - Contract Prisma classique → Contract.settings.hourBank.hoursConsumed
  //   - Contract virtuel synthétisé depuis OrgBillingConfig (id préfixé
  //     `virtual-orgconfig:`) → OrgBillingConfig.hourBank.hoursConsumed
  if (
    contract &&
    (decision.status === "deducted_from_hour_bank" || decision.status === "hour_bank_overage") &&
    contract.hourBank
  ) {
    const consumedMinutes = decision.status === "deducted_from_hour_bank"
      ? input.durationMinutes
      : Math.max(0, contract.hourBank.totalHoursPurchased * 60 - contract.hourBank.hoursConsumed * 60);
    const { isVirtualContractId, bumpOrgBillingConfigHourBank } = await import("./org-billing-bridge");
    if (isVirtualContractId(contract.id)) {
      await bumpOrgBillingConfigHourBank(input.organizationId, consumedMinutes);
    } else {
      await bumpContractHourBank(contract.id, consumedMinutes);
    }
  }

  return created;
}

export async function updateTimeEntry(id: string, patch: any) {
  // Vérifie le verrouillage sur la date ACTUELLE de l'entrée (pas la
  // nouvelle si on change startedAt — empêche le contournement).
  const { checkBillingLock, BillingLockError } = await import("./period-lock");
  const existing = await prisma.timeEntry.findUnique({
    where: { id },
    select: { startedAt: true },
  });
  if (existing) {
    const lockMsg = await checkBillingLock(existing.startedAt);
    if (lockMsg) throw new BillingLockError(lockMsg);
  }
  // Vérifie aussi la nouvelle date si on la déplace
  if (patch.startedAt) {
    const lockMsg = await checkBillingLock(new Date(patch.startedAt));
    if (lockMsg) throw new BillingLockError(lockMsg);
  }

  const data: Record<string, unknown> = {};
  // Réassignation d'agent : permet de corriger une saisie créée à tort
  // sous le mauvais nom, ou de transférer après coup vers le collègue qui
  // a réellement effectué le travail. Validation de l'existence/staff
  // côté API route avant d'arriver ici.
  if (patch.agentId !== undefined && typeof patch.agentId === "string" && patch.agentId.length > 0) {
    data.agentId = patch.agentId;
  }
  if (patch.timeType !== undefined) data.timeType = patch.timeType;
  if (patch.startedAt !== undefined) data.startedAt = new Date(patch.startedAt);
  if (patch.endedAt !== undefined) data.endedAt = patch.endedAt ? new Date(patch.endedAt) : null;
  if (patch.durationMinutes !== undefined) data.durationMinutes = patch.durationMinutes;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.isAfterHours !== undefined) data.isAfterHours = patch.isAfterHours;
  if (patch.isWeekend !== undefined) data.isWeekend = patch.isWeekend;
  if (patch.isUrgent !== undefined) data.isUrgent = patch.isUrgent;
  if (patch.isOnsite !== undefined) data.isOnsite = patch.isOnsite;
  if (patch.hasTravelBilled !== undefined) {
    data.hasTravelBilled = patch.hasTravelBilled;
    // Si on décoche "déplacement facturé", efface aussi la durée synchro.
    if (!patch.hasTravelBilled) data.travelDurationMinutes = null;
  }
  if (patch.travelDurationMinutes !== undefined) {
    data.travelDurationMinutes = patch.travelDurationMinutes;
  }

  // Invariant : hasTravelBilled=true requiert isOnsite=true. On vérifie sur
  // l'état COMBINÉ (patch + existant) pour catcher le cas où le patch ne
  // touche qu'à un seul des deux flags.
  const finalHasTravel = patch.hasTravelBilled !== undefined ? patch.hasTravelBilled : null;
  const finalIsOnsite = patch.isOnsite !== undefined ? patch.isOnsite : null;
  if (finalHasTravel === true || finalIsOnsite === false) {
    const current = await prisma.timeEntry.findUnique({
      where: { id },
      select: { hasTravelBilled: true, isOnsite: true },
    });
    if (current) {
      const effHasTravel = finalHasTravel ?? current.hasTravelBilled;
      const effIsOnsite = finalIsOnsite ?? current.isOnsite;
      if (effHasTravel && !effIsOnsite) {
        throw new TimeEntryValidationError(
          "Le déplacement facturé nécessite une saisie sur place (isOnsite=true).",
        );
      }
    }
  }

  if (patch.coverageStatus !== undefined) data.coverageStatus = patch.coverageStatus;
  if (patch.coverageReason !== undefined) data.coverageReason = patch.coverageReason;
  if (patch.hourlyRate !== undefined) data.hourlyRate = patch.hourlyRate;
  if (patch.amount !== undefined) data.amount = patch.amount;
  return prisma.timeEntry.update({ where: { id }, data });
}

export async function deleteTimeEntry(id: string) {
  const { checkBillingLock, BillingLockError } = await import("./period-lock");
  const existing = await prisma.timeEntry.findUnique({
    where: { id },
    select: { startedAt: true },
  });
  if (existing) {
    const lockMsg = await checkBillingLock(existing.startedAt);
    if (lockMsg) throw new BillingLockError(lockMsg);
  }
  return prisma.timeEntry.delete({ where: { id } });
}
