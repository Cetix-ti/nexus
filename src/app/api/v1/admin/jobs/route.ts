import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { getJobsStatus } from "@/lib/scheduler/background-jobs";

/**
 * GET /api/v1/admin/jobs
 * Retourne l'état du scheduler de jobs en arrière-plan :
 *   - nom du job, intervalle configuré
 *   - dernier run + erreur éventuelle
 *   - compteur d'échecs consécutifs
 * Utile pour vérifier que le sync email→ticket tourne bien "en permanence".
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    jobs: getJobsStatus(),
    serverStartedAt: process.env.SERVER_STARTED_AT ?? null,
  });
}
