// ============================================================================
// CLIENT BILLING OVERRIDES — Lecture / écriture en DB.
//
// Source de vérité unique pour les overrides par client. Remplace les anciens
// `mockClientBillingOverrides` (in-memory, non persistés). Les `BillingProfile`
// de base restent en mock-data.ts pour le moment.
// ============================================================================

import prisma from "@/lib/prisma";
import type { ClientBillingOverride } from "./types";

/** Champs numériques optionnels gérés. Doit rester aligné avec le model Prisma. */
const NUMERIC_FIELDS = [
  "standardRate",
  "onsiteRate",
  "remoteRate",
  "urgentRate",
  "afterHoursRate",
  "weekendRate",
  "travelRate",
  "ratePerKm",
  "travelFlatFee",
  "hourBankOverageRate",
  "mspExcludedRate",
] as const;

const INT_FIELDS = [
  "minimumBillableMinutes",
  "roundingIncrementMinutes",
] as const;

type DbRow = Awaited<
  ReturnType<typeof prisma.clientBillingOverride.findUnique>
> & {};

function rowToType(
  row: NonNullable<DbRow>,
  organizationName: string,
): ClientBillingOverride {
  const out: ClientBillingOverride = {
    id: row.id,
    organizationId: row.organizationId,
    organizationName,
    baseProfileId: row.baseProfileId,
    isActive: row.isActive,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString(),
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  for (const f of NUMERIC_FIELDS) {
    const v = row[f];
    if (v != null) (out as unknown as Record<string, unknown>)[f] = v;
  }
  for (const f of INT_FIELDS) {
    const v = row[f];
    if (v != null) (out as unknown as Record<string, unknown>)[f] = v;
  }
  return out;
}

/**
 * Lit l'override actif d'un client, depuis la DB.
 * Retourne `null` si aucun override actif.
 */
export async function getClientBillingOverrideForOrg(
  organizationId: string,
): Promise<ClientBillingOverride | null> {
  const row = await prisma.clientBillingOverride.findUnique({
    where: { organizationId },
    include: { organization: { select: { name: true } } },
  });
  if (!row || !row.isActive) return null;
  return rowToType(row, row.organization.name);
}

/**
 * Upsert d'un override pour un client. Préserve les champs non fournis.
 * Renvoie l'override final (lecture après écriture) avec organizationName.
 */
export async function upsertClientBillingOverride(
  organizationId: string,
  patch: Partial<ClientBillingOverride>,
): Promise<ClientBillingOverride> {
  // On construit explicitement le payload pour éviter qu'un client n'écrive
  // des champs non whitelisted (ex. id, createdAt).
  const data: Record<string, unknown> = {};
  if (patch.baseProfileId !== undefined) data.baseProfileId = patch.baseProfileId;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.effectiveFrom !== undefined)
    data.effectiveFrom = new Date(patch.effectiveFrom);
  if (patch.effectiveTo !== undefined)
    data.effectiveTo = patch.effectiveTo ? new Date(patch.effectiveTo) : null;
  if (patch.notes !== undefined) data.notes = patch.notes;
  for (const f of NUMERIC_FIELDS) {
    if (f in patch) {
      const v = (patch as unknown as Record<string, unknown>)[f];
      data[f] = v === null || v === undefined ? null : Number(v);
    }
  }
  for (const f of INT_FIELDS) {
    if (f in patch) {
      const v = (patch as unknown as Record<string, unknown>)[f];
      data[f] = v === null || v === undefined ? null : Math.round(Number(v));
    }
  }

  const row = await prisma.clientBillingOverride.upsert({
    where: { organizationId },
    create: {
      organizationId,
      baseProfileId: patch.baseProfileId ?? "bp_standard",
      isActive: patch.isActive ?? true,
      effectiveFrom: patch.effectiveFrom ? new Date(patch.effectiveFrom) : new Date(),
      effectiveTo: patch.effectiveTo ? new Date(patch.effectiveTo) : null,
      notes: patch.notes ?? null,
      ...Object.fromEntries(
        [...NUMERIC_FIELDS, ...INT_FIELDS].flatMap((f) =>
          f in patch ? [[f, data[f]]] : [],
        ),
      ),
    },
    update: data,
    include: { organization: { select: { name: true } } },
  });
  return rowToType(row, row.organization.name);
}

/**
 * Supprime l'override d'un client (revient au profil de base).
 */
export async function deleteClientBillingOverride(
  organizationId: string,
): Promise<void> {
  await prisma.clientBillingOverride
    .delete({ where: { organizationId } })
    .catch(() => {
      // Si pas d'override, no-op.
    });
}
