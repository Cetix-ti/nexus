// POST /api/v1/bugs/[id]/run-fix — déclenche manuellement le worker auto-fix
// pour un bug spécifique. Utile pour tester sans attendre le cron nocturne.
// Réservé admin.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { spawn } from "node:child_process";
import path from "node:path";

const ADMIN_ROLES = ["SUPER_ADMIN", "MSP_ADMIN"] as const;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as readonly string[]).includes(me.role)) {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const bug = await prisma.bugReport.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!bug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["APPROVED_FOR_FIX", "TRIAGED", "NEW"].includes(bug.status)) {
    return NextResponse.json({ error: `Impossible de lancer le fix sur un bug en ${bug.status}` }, { status: 400 });
  }

  // Si pas encore approuvé, le marquer.
  if (bug.status !== "APPROVED_FOR_FIX") {
    await prisma.bugReport.update({
      where: { id },
      data: { status: "APPROVED_FOR_FIX", approvedForAutoFixAt: new Date(), approvedByUserId: me.id },
    });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "1";

  // Spawn détaché — le worker tourne en arrière-plan, on répond immédiatement.
  const script = path.resolve(process.cwd(), "src/workers/bugfix-worker.ts");
  const args = ["tsx", script, `--bug-id=${id}`];
  if (dryRun) args.push("--dry-run");
  const child = spawn("npx", args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  return NextResponse.json({ ok: true, message: "Worker lancé en arrière-plan.", bugId: id, dryRun }, { status: 202 });
}
