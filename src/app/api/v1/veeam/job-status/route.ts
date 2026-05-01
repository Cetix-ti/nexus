// ============================================================================
// GET /api/v1/veeam/job-status
//
// Expose le statut du job de synchronisation auto Veeam (en arrière-plan,
// 5 min par défaut) pour la page /backups. Permet à l'utilisateur de voir
// que la synchronisation tourne sans avoir à cliquer Synchroniser. Données
// non-sensibles (timestamp + intervalle), donc accessible à tout user
// authentifié — la page /backups elle-même est gated en amont.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getJobsStatus } from "@/lib/scheduler/background-jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = getJobsStatus().find((j) => j.name === "veeam-backups");
  if (!job) {
    // Le scheduler n'a pas démarré (DISABLE_BACKGROUND_JOBS=1) ou bien
    // le job n'est pas enregistré. On renvoie un objet stable pour que
    // l'UI puisse afficher un état "désactivé".
    return NextResponse.json({
      enabled: false,
      lastRun: null,
      intervalMs: null,
      healthy: false,
    });
  }

  const lastRunMs = job.lastRun ? new Date(job.lastRun).getTime() : null;
  const healthy =
    job.consecutiveErrors === 0 &&
    (!lastRunMs || Date.now() - lastRunMs < job.intervalMs * 3);

  return NextResponse.json({
    enabled: true,
    lastRun: job.lastRun,
    intervalMs: job.intervalMs,
    healthy,
    lastError: job.lastError,
    consecutiveErrors: job.consecutiveErrors,
  });
}
