// ============================================================================
// Cadence d'exécution des rapports planifiés (Phase 4).
//
// Ne ré-implémente pas un parser cron complet — le besoin réel se résume
// à 2-3 cadences fixes. Si le besoin évolue, étendre l'enum + computeNextRun.
// ============================================================================

export type Cadence = "monthly_first_day_8am" | "weekly_monday_8am";

export const CADENCE_LABELS: Record<Cadence, string> = {
  monthly_first_day_8am: "Le 1er du mois à 8h00",
  weekly_monday_8am: "Chaque lundi à 8h00",
};

/**
 * Retourne la prochaine exécution >= `from` selon la cadence. Si on est
 * pile à l'heure d'exécution, on programme à la cycle suivante (évite la
 * double-exécution si le worker tourne plusieurs fois la même minute).
 */
export function computeNextRun(cadence: Cadence, from: Date = new Date()): Date {
  const next = new Date(from);
  switch (cadence) {
    case "monthly_first_day_8am": {
      // Premier jour du mois prochain à 8h00 local.
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }
    case "weekly_monday_8am": {
      // Lundi prochain à 8h00 (ISO : 1 = lundi).
      const day = next.getDay(); // 0 = dimanche, 1 = lundi
      const daysUntilMonday = (1 - day + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(8, 0, 0, 0);
      return next;
    }
  }
}

/**
 * Calcule la période couverte par cette exécution. Pour un rapport
 * mensuel exécuté le 1er du mois, on couvre le mois PRÉCÉDENT (les
 * données du mois en cours ne sont pas encore complètes).
 */
export function computeCoveredPeriod(
  cadence: Cadence,
  runAt: Date,
): { period: string; label: string } {
  if (cadence === "monthly_first_day_8am") {
    // Mois précédent
    const prev = new Date(runAt);
    prev.setMonth(prev.getMonth() - 1);
    const period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const label = prev.toLocaleDateString("fr-CA", {
      month: "long",
      year: "numeric",
    });
    return { period, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  // weekly : on garde le mois en cours par défaut (pas de "période semaine"
  // pour l'instant — le rapport mensuel reste mensuel).
  const period = `${runAt.getFullYear()}-${String(runAt.getMonth() + 1).padStart(2, "0")}`;
  const label = runAt.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  return { period, label: label.charAt(0).toUpperCase() + label.slice(1) };
}
