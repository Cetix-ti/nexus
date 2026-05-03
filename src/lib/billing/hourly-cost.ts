// ============================================================================
// hourly-cost — résolveur du taux horaire de coût d'un agent à une date.
//
// Le taux est historisé dans `user_hourly_cost_history` : chaque
// changement crée une nouvelle ligne (userId, hourlyCost, effectiveFrom).
// Pour calculer le coût d'une saisie au temps T, on prend la ligne la
// plus récente avec `effectiveFrom <= T`.
//
// Conséquence : changer le taux d'un agent le 1er mai n'affecte PAS les
// saisies dont la date de début est antérieure — elles continuent à
// être valorisées au taux d'époque.
// ============================================================================

import prisma from "@/lib/prisma";

/**
 * Retourne le taux horaire de coût applicable à un agent à la date
 * `at`. Renvoie null si l'agent n'a pas de taux défini OU si aucun
 * historique n'est antérieur à `at`.
 */
export async function getHourlyCostAt(
  userId: string,
  at: Date,
): Promise<number | null> {
  const row = await prisma.userHourlyCost.findFirst({
    where: { userId, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: "desc" },
    select: { hourlyCost: true },
  });
  return row?.hourlyCost ?? null;
}

/**
 * Retourne le taux courant (le plus récent), peu importe la date.
 * Utilisé pour afficher le taux "actuel" dans l'UI.
 */
export async function getCurrentHourlyCost(userId: string): Promise<number | null> {
  return getHourlyCostAt(userId, new Date());
}

/**
 * Set d'un taux à une date d'effet précise. Crée une nouvelle entrée
 * d'historique, ou écrase l'existante si une ligne avec exactement
 * le même `effectiveFrom` existe déjà (idempotent).
 */
export async function setHourlyCost(
  userId: string,
  hourlyCost: number,
  effectiveFrom: Date,
): Promise<void> {
  await prisma.userHourlyCost.upsert({
    where: { userId_effectiveFrom: { userId, effectiveFrom } },
    update: { hourlyCost },
    create: { userId, hourlyCost, effectiveFrom },
  });
  // Maintient User.hourlyCost en sync avec le taux courant pour la
  // compat des anciens callers — supprimable une fois confirmé que
  // plus rien ne lit ce champ.
  const current = await getCurrentHourlyCost(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { hourlyCost: current },
  });
}

/** Supprime une entrée d'historique. */
export async function deleteHourlyCostEntry(id: string): Promise<void> {
  const entry = await prisma.userHourlyCost.findUnique({
    where: { id },
    select: { userId: true },
  });
  await prisma.userHourlyCost.delete({ where: { id } });
  if (entry) {
    const current = await getCurrentHourlyCost(entry.userId);
    await prisma.user.update({
      where: { id: entry.userId },
      data: { hourlyCost: current },
    });
  }
}

/**
 * Liste l'historique complet pour un agent, du plus récent au plus
 * ancien.
 */
export async function listHourlyCostHistory(userId: string) {
  return prisma.userHourlyCost.findMany({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true, hourlyCost: true, effectiveFrom: true, createdAt: true },
  });
}
