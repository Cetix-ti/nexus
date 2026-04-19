import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { getJobsStatus, runJobNow } from "@/lib/scheduler/background-jobs";

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

/**
 * POST /api/v1/admin/jobs
 * Body : { name: "nom-du-job" }
 *
 * Déclenche un job immédiatement sans attendre son prochain tick. Refuse si
 * le job est déjà en cours (pas de double-exécution parallèle).
 *
 * Réservé MSP_ADMIN : certains jobs (sync email, extraction IA) consomment
 * des ressources externes — pas n'importe quel agent ne doit pouvoir les
 * déclencher à volonté.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";
  if (!name) {
    return NextResponse.json(
      { error: "name est requis" },
      { status: 400 },
    );
  }
  const result = await runJobNow(name);
  if (!result.ok) {
    const statusCode =
      result.reason === "not_found"
        ? 404
        : result.reason === "already_running"
          ? 409
          : 500;
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.error },
      { status: statusCode },
    );
  }
  return NextResponse.json({ ok: true, durationMs: result.durationMs });
}
