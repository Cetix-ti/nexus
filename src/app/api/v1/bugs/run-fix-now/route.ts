// Déclenche manuellement le worker de correction de bugs.
// - Si un run est déjà actif : pose un flag "rerun demandé" — le worker se
//   relancera lui-même à la fin de son run en cours.
// - Sinon : spawn le worker en tâche de fond (détaché), retourne immédiatement.
//
// Staff uniquement. Aucune contrainte de working tree : le worker utilise
// désormais un git worktree isolé par bug (cf. src/workers/bugfix-worker.ts).
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";

const RERUN_FLAG = path.join(tmpdir(), "nexus-bugfix-rerun.flag");
const WORKER_PATH = path.join(process.cwd(), "src", "workers", "bugfix-worker.ts");
const LOG_PATH = "/var/log/nexus-bugfix.log";
const MAX_PER_RUN = 5; // aligné avec --max=5 passé au worker

async function isWorkerActive(): Promise<boolean> {
  // Un bug en FIX_IN_PROGRESS ou un attempt ANALYZING non terminé signifie
  // que le worker tourne (ou s'est crashé sans cleanup — dans ce cas l'admin
  // peut forcer un reset).
  const count = await prisma.bugFixAttempt.count({
    where: { status: "ANALYZING", endedAt: null },
  });
  return count > 0;
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Body optionnel : { bugIds?: string[] } pour cibler une sélection précise.
  const body = await req.json().catch(() => ({}));
  const rawIds = Array.isArray(body?.bugIds) ? body.bugIds : [];
  const bugIds = rawIds.map(String).filter(Boolean).slice(0, 50); // hard cap anti-abus

  // Mode "ciblé" : on approuve à la volée les IDs non encore APPROVED,
  // pour que l'utilisateur puisse sélectionner NEW/TRIAGED/REJECTED aussi.
  let targetCount = 0;
  if (bugIds.length > 0) {
    const targets = await prisma.bugReport.findMany({
      where: { id: { in: bugIds } },
      select: { id: true, status: true },
    });
    targetCount = targets.length;
    if (targetCount === 0) {
      return NextResponse.json({ status: "nothing_to_do", message: "Aucun bug trouvé pour les IDs fournis." });
    }
    const toApprove = targets.filter((b) => b.status !== "APPROVED_FOR_FIX" && b.status !== "FIX_IN_PROGRESS" && b.status !== "FIX_PROPOSED" && b.status !== "FIXED").map((b) => b.id);
    if (toApprove.length > 0) {
      await prisma.bugReport.updateMany({
        where: { id: { in: toApprove } },
        data: {
          status: "APPROVED_FOR_FIX",
          approvedForAutoFixAt: new Date(),
          approvedByUserId: me.id,
          rejectedAt: null,
          rejectedByUserId: null,
          rejectionReason: null,
        },
      });
    }
  } else {
    // Mode "tous" : on vérifie qu'il y a quelque chose à faire.
    targetCount = await prisma.bugReport.count({ where: { status: "APPROVED_FOR_FIX" } });
    if (targetCount === 0) {
      return NextResponse.json({ status: "nothing_to_do", message: "Aucun bug approuvé en attente." });
    }
  }

  if (await isWorkerActive()) {
    // Pose le flag — le worker actuel se relancera à la fin (mode "tous",
    // la sélection explicite n'est pas persistée : le second run prendra
    // les prochains APPROVED_FOR_FIX dans l'ordre normal).
    try {
      await fs.writeFile(RERUN_FLAG, String(Date.now()));
    } catch (e) {
      console.error("[run-fix-now] flag write failed", e);
    }
    return NextResponse.json({
      status: "queued",
      message: bugIds.length > 0
        ? `${bugIds.length} bug(s) approuvés et mis en file. Le worker se relancera à la fin du run actuel.`
        : "Un run est déjà en cours. Celui-ci sera lancé automatiquement à la fin.",
      pending: targetCount,
    });
  }

  // Si le travail dépasse la capacité d'un run (5 bugs), on pose le flag
  // de relance pour que le worker se ré-invoque automatiquement jusqu'à
  // vider la queue. Le worker gère lui-même la cascade : chaque fin de run
  // vérifie le flag et re-pose + respawn tant qu'il reste du travail.
  if (targetCount > MAX_PER_RUN) {
    try { await fs.writeFile(RERUN_FLAG, String(Date.now())); }
    catch (e) { console.error("[run-fix-now] flag write failed", e); }
  } else {
    // Supprime un éventuel flag résiduel d'un run précédent.
    await fs.unlink(RERUN_FLAG).catch(() => {});
  }

  // Spawn détaché — le process survit au redémarrage de Next.js grâce à unref.
  try {
    const log = await fs.open(LOG_PATH, "a").catch(() => null);
    const out = log?.fd ?? "ignore";
    const workerArgs = ["tsx", WORKER_PATH, `--max=${MAX_PER_RUN}`];
    if (bugIds.length > 0) workerArgs.push(`--bug-ids=${bugIds.join(",")}`);
    const child = spawn("npx", workerArgs, {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
    if (log) await log.close();
  } catch (e) {
    console.error("[run-fix-now] spawn failed", e);
    return NextResponse.json({ error: "Échec du lancement du worker", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const runs = Math.ceil(targetCount / MAX_PER_RUN);
  return NextResponse.json({
    status: "started",
    message: bugIds.length > 0
      ? `Worker lancé — ${targetCount} bug(s) à traiter en ${runs} run${runs > 1 ? "s" : ""} enchaîné${runs > 1 ? "s" : ""} de ${MAX_PER_RUN} max.`
      : `Worker lancé — ${targetCount} bug(s) à traiter en ${runs} run${runs > 1 ? "s" : ""} enchaîné${runs > 1 ? "s" : ""} de ${MAX_PER_RUN} max.`,
    pending: targetCount,
  });
}
