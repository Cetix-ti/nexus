// ============================================================================
// progress — recalcule Project.progressPercent à partir des phases.
//
// Algorithme :
//   1. Si au moins une phase a `estimatedHours > 0` → ratio pondéré :
//        somme(estimatedHours des phases status="completed")
//        ÷ somme(estimatedHours de toutes les phases avec estimatedHours>0)
//        × 100
//      Les phases sans estimatedHours sont ignorées (elles ne pèsent pas).
//   2. Sinon, fallback simple :
//        count(phases completed) / count(phases) × 100
//   3. Si 0 phase → progressPercent inchangé (pas d'écrasement automatique
//      de la valeur posée manuellement).
//
// Appelée depuis :
//   - POST   /api/v1/projects/[id]/phases               (création)
//   - PATCH  /api/v1/projects/[id]/phases/[phaseId]     (statut ou heures)
//   - DELETE /api/v1/projects/[id]/phases/[phaseId]
// ============================================================================

import prisma from "@/lib/prisma";

/**
 * Recalcule et persiste Project.progressPercent à partir des phases.
 * Idempotent ; safe à rappeler. Best-effort : log + swallow en cas
 * d'erreur pour ne pas casser l'opération principale.
 */
export async function recomputeProjectProgress(projectId: string): Promise<number | null> {
  try {
    const phases = await prisma.projectPhase.findMany({
      where: { projectId },
      select: { status: true, estimatedHours: true },
    });
    if (phases.length === 0) return null;

    const withHours = phases.filter((p) => (p.estimatedHours ?? 0) > 0);
    let percent: number;

    if (withHours.length > 0) {
      const totalHours = withHours.reduce((s, p) => s + (p.estimatedHours ?? 0), 0);
      const completedHours = withHours
        .filter((p) => p.status === "completed")
        .reduce((s, p) => s + (p.estimatedHours ?? 0), 0);
      percent = totalHours > 0 ? Math.round((completedHours / totalHours) * 100) : 0;
    } else {
      // Fallback : aucune phase n'a d'heures estimées, on prend le ratio
      // simple par count.
      const completed = phases.filter((p) => p.status === "completed").length;
      percent = Math.round((completed / phases.length) * 100);
    }

    // Clamp [0, 100] par sécurité.
    percent = Math.max(0, Math.min(100, percent));

    await prisma.project.update({
      where: { id: projectId },
      data: { progressPercent: percent },
    });
    return percent;
  } catch (e) {
    console.error("[recomputeProjectProgress]", projectId, e);
    return null;
  }
}
