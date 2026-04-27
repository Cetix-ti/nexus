// ============================================================================
// POST /api/v1/ai/bulk-triage
//
// Applique le triage IA en rétro sur les tickets qui n'ont pas encore été
// analysés OU qui n'ont pas encore de catégorie. Utile après le déploiement
// initial de la feature pour "rattraper" la base historique, OU après une
// mise à jour du prompt / modèle pour re-traiter les tickets non classés.
//
// Safety :
//   - SUPERVISOR+ uniquement (coût IA potentiellement significatif)
//   - dryRun=true par défaut — renvoie seulement le count + estimation
//   - limit max 200 par batch (séquentiel, 30-60s/ticket sur gemma3:12b local)
//   - processing séquentiel (pas parallèle) pour ne pas DDoS l'API
//   - skip les tickets avec categorySource=MANUAL (choix humain figé)
//
// Modes (target) :
//   - "never_triaged" (défaut) : tickets sans aucune AiInvocation feature=triage.
//     Comportement historique. Chaque ticket = 1 appel LLM.
//   - "never_categorized" : tickets sans categoryId (categoryId=null), peu
//     importe s'ils ont déjà été triagés. Utile pour re-triager après une
//     baisse du seuil d'auto-apply ou une amélioration des sanity checks.
//
// Body : {
//   dryRun?: boolean (défaut true),
//   organizationId?: string,    // limite à une org
//   sinceDays?: number,          // depuis combien de jours (défaut 90, max 3650)
//   limit?: number (défaut 20, max 200),
//   target?: "never_triaged" | "never_categorized" (défaut "never_triaged")
// }
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  // me reste accessible si besoin via __aiGuard.me
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // défaut true
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : null;
  const sinceDays = Math.min(
    Math.max(
      typeof body.sinceDays === "number" ? body.sinceDays : 90,
      1,
    ),
    3650, // ~10 ans : permet un backfill historique complet
  );
  const limit = Math.min(
    Math.max(typeof body.limit === "number" ? body.limit : 20, 1),
    200,
  );
  const target: "never_triaged" | "never_categorized" =
    body.target === "never_categorized" ? "never_categorized" : "never_triaged";

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  // Sélection des candidats selon le mode demandé.
  // - never_triaged : tickets sans AiInvocation triage — scan large puis filtre.
  // - never_categorized : tickets avec categoryId=null ET categorySource != MANUAL
  //   (ne jamais écraser un humain). Ce filtre se fait côté DB directement.
  let toProcess: Array<{ id: string; createdAt: Date }> = [];
  let scanned = 0;
  let excluded = 0;

  if (target === "never_categorized") {
    const candidates = await prisma.ticket.findMany({
      where: {
        createdAt: { gte: since },
        ...(organizationId ? { organizationId } : {}),
        subject: { not: "" },
        categoryId: null,
        // Un ticket avec categorySource=MANUAL ET categoryId=null est un cas
        // bord (humain a explicitement décatégorisé) — on respecte sa décision.
        NOT: { categorySource: "MANUAL" },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    toProcess = candidates;
    scanned = candidates.length;
  } else {
    // never_triaged (comportement historique)
    const allCandidates = await prisma.ticket.findMany({
      where: {
        createdAt: { gte: since },
        ...(organizationId ? { organizationId } : {}),
        subject: { not: "" },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limit * 5, // sur-échantillonne pour filtrer ensuite
    });
    const existingTriages = await prisma.aiInvocation.findMany({
      where: {
        ticketId: { in: allCandidates.map((t) => t.id) },
        feature: "triage",
      },
      select: { ticketId: true },
    });
    const triagedSet = new Set(
      existingTriages.map((i) => i.ticketId).filter((x): x is string => !!x),
    );
    toProcess = allCandidates
      .filter((t) => !triagedSet.has(t.id))
      .slice(0, limit);
    scanned = allCandidates.length;
    excluded = triagedSet.size;
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      target,
      ticketsToProcess: toProcess.length,
      scanned,
      alreadyExcluded: excluded,
      // Estimation coût : ~0.002 $ par triage (gpt-4o-mini), 0 $ si Ollama
      estimatedCostCents: toProcess.length * 2,
    });
  }

  // 2. Exécution réelle — séquentielle pour ne pas surcharger l'API
  const { triageTicket, applyTriageIfConfident } = await import(
    "@/lib/ai/features/triage"
  );
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const t of toProcess) {
    try {
      const result = await triageTicket(t.id);
      if (result) {
        await applyTriageIfConfident(t.id, result);
        succeeded++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      errors.push(
        `Ticket ${t.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json({
    dryRun: false,
    target,
    processed: toProcess.length,
    succeeded,
    failed,
    errors: errors.slice(0, 10),
  });
}
