// ============================================================================
// FEEDBACK DECAY — helper partagé par les learners de feedback.
//
// Problème : sans pondération temporelle, un token marqué "bad" 80 jours
// auparavant compte autant qu'un thumbs-down d'aujourd'hui. Les corrections
// passées pèsent indéfiniment jusqu'à leur sortie de la fenêtre 90j.
//
// Solution : pondération linéaire par âge. Un feedback frais = poids 1.
// Un feedback à 90j (fenêtre max) = poids 0.1 (plancher pour que les
// anciennes données gardent une trace résiduelle).
//
// Formule : weight = max(0.1, 1 - ageDays / DECAY_FULL_DAYS)
// ============================================================================

const DECAY_FULL_DAYS = 90;
const MIN_WEIGHT = 0.1;

export function ageWeight(createdAt: Date | string): number {
  const ts =
    createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  const ageDays = (Date.now() - ts) / (24 * 3600_000);
  if (ageDays <= 0) return 1;
  return Math.max(MIN_WEIGHT, 1 - ageDays / DECAY_FULL_DAYS);
}
