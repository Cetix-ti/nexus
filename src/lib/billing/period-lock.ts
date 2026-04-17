// ============================================================================
// BILLING PERIOD LOCK — vérifie si un mois donné est verrouillé.
//
// Chaque mois verrouillé a une entrée dans `billing_period_locks` avec la
// clé YYYY-MM. La vérification est appelée par les opérations CRUD sur
// TimeEntry (create/update/delete). En cache mémoire 30 s pour éviter de
// re-requêter la DB à chaque saisie de temps.
// ============================================================================

import prisma from "@/lib/prisma";

const CACHE_TTL = 30_000;
let cache: { periods: Set<string>; at: number } | null = null;

async function getLockedPeriods(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.periods;
  const rows = await prisma.billingPeriodLock.findMany({
    select: { period: true },
  });
  const set = new Set(rows.map((r) => r.period));
  cache = { periods: set, at: Date.now() };
  return set;
}

export function invalidateLockCache() {
  cache = null;
}

/**
 * Extrait la clé "YYYY-MM" d'une date (local timezone).
 */
export function dateToPeriod(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/**
 * Vérifie si la date tombe dans un mois verrouillé. Retourne null si OK,
 * ou un message d'erreur descriptif si verrouillé.
 */
export class BillingLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingLockError";
  }
}

export async function checkBillingLock(
  startedAt: Date | string,
): Promise<string | null> {
  const d = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const period = dateToPeriod(d);
  const locked = await getLockedPeriods();
  if (!locked.has(period)) return null;

  const [yyyy, mm] = period.split("-");
  const monthNames = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const monthName = monthNames[parseInt(mm, 10) - 1] ?? mm;
  return `La période de facturation ${monthName} ${yyyy} est verrouillée. Les saisies de temps pour ce mois ne peuvent plus être ajoutées, modifiées ou supprimées. Veuillez saisir votre temps dans le mois courant.`;
}
