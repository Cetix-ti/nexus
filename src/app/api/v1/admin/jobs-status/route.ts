// ============================================================================
// GET /api/v1/admin/jobs-status
//
// Expose le status de tous les background jobs du scheduler (email sync,
// monitoring, wazuh, auto-intelligence, etc.). Utilisé par le dashboard
// admin pour diagnostiquer rapidement si un job est coincé / en échec.
//
// Réservé SUPERVISOR+ — ne contient pas de données sensibles mais montre
// l'état interne du système.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { getJobsStatus } from "@/lib/scheduler/background-jobs";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobs = getJobsStatus();
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      ...j,
      // Enrichis : temps depuis dernière exécution + état de santé
      secondsSinceLastRun: j.lastRun
        ? Math.floor((Date.now() - new Date(j.lastRun).getTime()) / 1000)
        : null,
      healthy:
        j.consecutiveErrors === 0 &&
        // Considère un job "sain" si son dernier succès a < 3x son intervalle
        (!j.lastRun ||
          Date.now() - new Date(j.lastRun).getTime() < j.intervalMs * 3),
    })),
    checkedAt: new Date().toISOString(),
  });
}
