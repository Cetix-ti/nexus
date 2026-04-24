// ============================================================================
// Worker auto-fix nocturne.
//
// Pour chaque bug en statut APPROVED_FOR_FIX :
//  1. Crée une branche git `bugfix/bug-{shortId}-{slug}`
//  2. Spawn `claude --print` avec un prompt structuré + allowlist d'outils
//  3. Lit le résultat : fichiers modifiés, résumé, confiance
//  4. Vérifie zones interdites, tsc, eslint
//  5. Commit + push + ouvre PR via `gh pr create`
//  6. Met à jour BugFixAttempt + notifie via email
//
// Exécution : cron systemd (nuit) ou manuel via CLI/API.
//
// USAGE :
//   # Traiter les bugs approuvés (max 3 par run)
//   tsx src/workers/bugfix-worker.ts
//
//   # Traiter un bug spécifique
//   tsx src/workers/bugfix-worker.ts --bug-id=<id>
//
//   # Dry run (pas de commit/push/PR, juste analyse)
//   tsx src/workers/bugfix-worker.ts --dry-run
// ============================================================================

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import prisma from "@/lib/prisma";
import { pickModelForSeverity } from "@/lib/bugs/model-picker";
import { isForbiddenPath, filterForbidden } from "@/lib/bugs/forbidden-zones";
import { sendFixProposedEmail } from "@/lib/bugs/notifications";
import type { BugReport, BugFixAttempt } from "@prisma/client";

const REPO_ROOT = path.resolve(process.cwd());
const CLAUDE_CMD = process.env.CLAUDE_CMD ?? "/home/cetix/.local/bin/claude";
const GH_CMD = process.env.GH_CMD ?? "gh";
const DEFAULT_MAX_PER_RUN = 3;
const DEFAULT_BASE_BRANCH = "main";

interface ClaudeOutput {
  filesChanged: string[];
  diffSummary: string;
  confidence: number;
  abortReason?: string;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
}

// ----------------------------------------------------------------------------
// Shell helpers
// ----------------------------------------------------------------------------
async function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd ?? REPO_ROOT, env: { ...process.env, ...opts.env } });
    let stdout = ""; let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
    // Résout plutôt que de rejeter sur erreur de spawn (ex: binaire introuvable
    // ENOENT). Les callers vérifient `code` et logent `stderr` proprement,
    // sans propager d'exception qui ferait abandonner tout le pipeline.
    p.on("error", (err) => resolve({ stdout, stderr: stderr + (err instanceof Error ? err.message : String(err)), code: -1 }));
  });
}

async function git(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return run("git", args, { cwd });
}

function shortId(id: string): string { return id.slice(0, 8); }
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// ----------------------------------------------------------------------------
// Prompt Claude
// ----------------------------------------------------------------------------
function buildSystemPrompt(): string {
  return `Tu es un agent de correction autonome pour le projet Nexus (Next.js 16, Prisma 7, TypeScript strict, Tailwind).

RÈGLES CRITIQUES — NON NÉGOCIABLES :
1. ZONES INTERDITES : ne modifie JAMAIS ces chemins. Si le bug t'oblige à les toucher, ABANDONNE et écris "ABORT: <raison>" en fin de message.
   - prisma/schema.prisma et prisma/migrations/**
   - src/lib/auth/**, src/lib/auth-utils.ts, src/lib/auth.ts, src/lib/auth.config.ts
   - src/lib/crypto/**
   - src/app/api/v1/approvals/**, src/app/api/auth/**
   - src/app/api/v1/ai/data-delete/**
   - src/app/api/v1/billing/**, src/lib/billing/**
   - proxy.ts, src/middleware.ts
   - .env*, package.json, package-lock.json

2. Avant de patcher, LIS le code autour pour comprendre les conventions du projet.

3. PAS de nouvelles dépendances npm (npm install interdit). Si requis → ABORT.

4. Après ton patch, vérifie TOI-MÊME :
   - Pas d'erreur TypeScript (npx tsc --noEmit)
   - Pas d'erreur ESLint critique (npx eslint <fichiers modifiés>)

5. À la fin de ton travail, écris en DERNIER message un bloc JSON strictement au format :
\`\`\`json
{
  "filesChanged": ["path/relatif/1.ts", "path/relatif/2.tsx"],
  "diffSummary": "description concise (3-5 lignes) de ce qui a été changé",
  "confidence": 0.85
}
\`\`\`
Ou si tu abandonnes :
\`\`\`json
{
  "abortReason": "raison précise — zone interdite, complexité, manque d'info, etc."
}
\`\`\`

6. PAS de commit/push toi-même : le worker s'en charge après tes modifs.
7. PRIORISE : un correctif minimal et sûr plutôt qu'une refactorisation ambitieuse.`;
}

function buildUserPrompt(bug: BugReport & { reporter?: { firstName: string; lastName: string } | null }): string {
  return `Bug #${shortId(bug.id)} — sévérité ${bug.severity}

## Titre
${bug.title}

## Description
${bug.description}

${bug.stepsToReproduce ? `## Étapes pour reproduire\n${bug.stepsToReproduce}\n` : ""}
${bug.contextUrl ? `## URL affectée\n${bug.contextUrl}\n` : ""}
${bug.reporter ? `## Signalé par\n${bug.reporter.firstName} ${bug.reporter.lastName}\n` : ""}

## Mission
Analyse, localise, et corrige ce bug. Modifie le strict nécessaire. Puis émets le JSON final comme spécifié dans les règles système.`;
}

// ----------------------------------------------------------------------------
// Spawn Claude Code CLI
// ----------------------------------------------------------------------------
async function runClaude(systemPrompt: string, userPrompt: string, model: string, cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  // Utilise --print (non-interactive), --model pour sélectionner le modèle,
  // --permission-mode acceptEdits pour autoriser les éditions sans prompt,
  // --allowed-tools pour restreindre aux outils sûrs (pas de réseau).
  const args = [
    "--print",
    "--model", model,
    "--permission-mode", "acceptEdits",
    "--allowed-tools", "Read,Edit,Write,Grep,Glob,Bash(npx tsc:*,npx eslint:*,grep:*,ls:*,cat:*,head:*,tail:*,find:*)",
    "--append-system-prompt", systemPrompt,
  ];
  return new Promise((resolve, reject) => {
    const p = spawn(CLAUDE_CMD, args, { cwd: cwd ?? REPO_ROOT, env: process.env });
    let stdout = ""; let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
    p.on("error", reject);
    p.stdin.write(userPrompt);
    p.stdin.end();
  });
}

// Extrait le JSON final du texte de sortie de Claude.
function parseClaudeOutput(text: string): ClaudeOutput {
  // Cherche le DERNIER bloc JSON (```json ... ``` ou { ... }) valide.
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
  let jsonStr: string | null = null;
  for (let i = fenced.length - 1; i >= 0; i--) {
    try { JSON.parse(fenced[i][1]); jsonStr = fenced[i][1]; break; } catch {}
  }
  if (!jsonStr) {
    // Fallback : cherche { "..." : ... } à la fin.
    const m = text.match(/\{[\s\S]*?"(?:filesChanged|abortReason)"[\s\S]*?\}\s*$/);
    if (m) { try { JSON.parse(m[0]); jsonStr = m[0]; } catch {} }
  }
  if (!jsonStr) {
    return { filesChanged: [], diffSummary: "(parseur n'a pas trouvé de JSON final)", confidence: 0, abortReason: "NO_JSON_OUTPUT" };
  }
  const parsed = JSON.parse(jsonStr) as Partial<ClaudeOutput>;
  return {
    filesChanged: Array.isArray(parsed.filesChanged) ? parsed.filesChanged.map(String) : [],
    diffSummary: String(parsed.diffSummary ?? ""),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    abortReason: parsed.abortReason ? String(parsed.abortReason) : undefined,
  };
}

// ----------------------------------------------------------------------------
// Fix pipeline pour un bug
// ----------------------------------------------------------------------------
interface ProcessOptions { dryRun?: boolean; baseBranch?: string }

async function processBug(bug: BugReport, opts: ProcessOptions): Promise<BugFixAttempt> {
  const model = pickModelForSeverity(bug.severity);
  const attempt = await prisma.bugFixAttempt.create({
    // files_changed a une contrainte NOT NULL en base (drift vs schema) —
    // on fournit l'array vide explicitement pour éviter le crash P2011.
    data: { bugId: bug.id, status: "ANALYZING", agentModel: model, filesChanged: [] },
  });
  await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "FIX_IN_PROGRESS" } });

  const logs: string[] = [];
  const log = (line: string) => { logs.push(line); console.log(`[bug ${shortId(bug.id)}] ${line}`); };

  const baseBranch = opts.baseBranch ?? DEFAULT_BASE_BRANCH;
  const branch = `bugfix/bug-${shortId(bug.id)}-${slugify(bug.title)}`;
  // Worktree isolé : découple totalement du working tree du dev (qui peut
  // être sale sur une autre branche). `git worktree` crée un checkout
  // séparé pointant sur le même .git — pas de clone, léger, propre.
  const worktreeDir = path.join(os.tmpdir(), `nexus-bugfix-${bug.id}-${Date.now()}`);
  let worktreeCreated = false;

  async function finishAttempt(status: BugFixAttempt["status"], extra: Partial<BugFixAttempt> = {}) {
    await prisma.bugFixAttempt.update({
      where: { id: attempt.id },
      data: {
        status,
        logs: logs.join("\n").slice(-50_000),
        endedAt: new Date(),
        ...extra,
      },
    });
  }

  async function cleanupWorktree() {
    if (!worktreeCreated) return;
    // Force remove — le checkout peut avoir des modifs locales si Claude a écrit
    // mais qu'on abandonne. Supprimer aussi le refs worktree côté .git/worktrees.
    await run("git", ["worktree", "remove", "--force", worktreeDir]);
    // Au cas où, tue le dossier résiduel.
    await run("rm", ["-rf", worktreeDir]);
  }

  try {
    if (!opts.dryRun) {
      // 1. Fetch base fresh depuis origin (peu importe l'état du repo principal).
      const fetch = await git(["fetch", "origin", baseBranch]);
      if (fetch.code !== 0) {
        log(`git fetch origin ${baseBranch} failed : ${fetch.stderr}`);
        await finishAttempt("FAILED", { abortReason: `fetch failed: ${fetch.stderr.slice(0, 500)}` });
        await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "APPROVED_FOR_FIX" } });
        return attempt;
      }

      // 2. Crée un worktree isolé depuis origin/<baseBranch>, avec la branche bugfix directement.
      //    Cela fonctionne même si le working tree principal est sale sur une autre branche.
      //    Si une branche locale du même nom existe (run précédent failed), on la supprime
      //    avant — sinon `worktree add -b` échoue avec "branch already exists".
      await git(["branch", "-D", branch]); // best-effort : run() résout même si la branche n'existe pas (code != 0 mais pas d'exception)
      const wt = await git(["worktree", "add", "-b", branch, worktreeDir, `origin/${baseBranch}`]);
      if (wt.code !== 0) {
        log(`git worktree add failed : ${wt.stderr}`);
        await finishAttempt("FAILED", { abortReason: `worktree add failed: ${wt.stderr.slice(0, 500)}` });
        await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "APPROVED_FOR_FIX" } });
        return attempt;
      }
      worktreeCreated = true;
      log(`Worktree : ${worktreeDir} (branche ${branch})`);

      // Lien symbolique node_modules → évite réinstall + garantit que tsc/eslint/prisma retrouvent leurs deps.
      try { await fs.symlink(path.join(REPO_ROOT, "node_modules"), path.join(worktreeDir, "node_modules")); } catch (e) {
        log(`node_modules symlink failed (continue) : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const cwd = opts.dryRun ? REPO_ROOT : worktreeDir;

    // 3. Spawn Claude dans le worktree.
    log(`Lancement Claude (${model})…`);
    const { stdout, stderr, code } = await runClaude(
      buildSystemPrompt(),
      buildUserPrompt(bug),
      model,
      cwd,
    );
    if (code !== 0) {
      log(`Claude exit ${code}. stderr: ${stderr.slice(0, 1000)}`);
      await finishAttempt("FAILED", { abortReason: `Claude exit ${code}` });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "APPROVED_FOR_FIX" } });
      return attempt;
    }
    log(`Claude stdout ${stdout.length} chars`);

    const parsed = parseClaudeOutput(stdout);
    if (parsed.abortReason) {
      log(`Claude a abandonné : ${parsed.abortReason}`);
      await finishAttempt("ABANDONED", { abortReason: parsed.abortReason, diffSummary: parsed.diffSummary });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // 4. Vérifie zones interdites (pré-diff, sur ce que Claude dit avoir modifié).
    const forbidden = filterForbidden(parsed.filesChanged);
    if (forbidden.length > 0) {
      log(`Zones interdites touchées : ${forbidden.join(", ")}`);
      await finishAttempt("ABANDONED", { abortReason: `Zones interdites : ${forbidden.join(", ")}`, filesChanged: parsed.filesChanged });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // 5. Dry run — on s'arrête ici sans diff réel.
    if (opts.dryRun) {
      log(`Dry run — fichiers modifiés : ${parsed.filesChanged.join(", ")}`);
      await finishAttempt("PROPOSED", {
        diffSummary: parsed.diffSummary,
        filesChanged: parsed.filesChanged,
        confidence: parsed.confidence,
      });
      return attempt;
    }

    const diff = await git(["diff", "--name-only"], cwd);
    const actualChanged = diff.stdout.trim().split("\n").filter(Boolean);
    if (actualChanged.length === 0) {
      log("Aucune modif écrite par Claude — abandon.");
      await finishAttempt("ABANDONED", { abortReason: "Aucune modification effective", diffSummary: parsed.diffSummary });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }
    const forbidden2 = filterForbidden(actualChanged);
    if (forbidden2.length > 0) {
      log(`Zones interdites modifiées (detection post-diff) : ${forbidden2.join(", ")}`);
      await finishAttempt("ABANDONED", { abortReason: `Zones interdites (post-diff) : ${forbidden2.join(", ")}`, filesChanged: actualChanged });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // 6. Vérifications tsc + eslint sur fichiers modifiés (dans le worktree).
    log("Vérif tsc…");
    const tsc = await run("npx", ["tsc", "--noEmit"], { cwd });
    if (tsc.code !== 0) {
      log(`tsc échoue : ${tsc.stdout.slice(-2000)}`);
      await finishAttempt("FAILED", { abortReason: "tsc errors after patch", filesChanged: actualChanged, diffSummary: parsed.diffSummary });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // Check ESLint avec baseline : on tolère les erreurs pré-existantes dans
    // les fichiers modifiés, on fail uniquement si Claude a *introduit* des
    // erreurs (nombre d'erreurs après > nombre d'erreurs avant).
    log("Vérif ESLint (baseline vs après fix)…");
    const jsLike = actualChanged.filter((f) => /\.(tsx?|jsx?)$/.test(f));
    const regressions: Array<{ file: string; before: number; after: number }> = [];
    for (const f of jsLike) {
      // After: lint le fichier dans le worktree (état post-fix).
      const afterRun = await run("npx", ["eslint", "--format=json", f], { cwd });
      let after = 0;
      try {
        const data = JSON.parse(afterRun.stdout) as Array<{ errorCount?: number }>;
        after = data.reduce((s, d) => s + (d.errorCount ?? 0), 0);
      } catch { after = afterRun.code !== 0 ? 1 : 0; }

      // Before: lint la version origin/<baseBranch> du fichier via stdin.
      // Si le fichier est nouveau (pas sur base), before = 0.
      const show = await git(["show", `origin/${baseBranch}:${f}`], cwd);
      let before = 0;
      if (show.code === 0) {
        const beforeOut = await new Promise<{ stdout: string; code: number }>((resolve) => {
          const p = spawn("npx", ["eslint", "--format=json", "--stdin", "--stdin-filename", f], { cwd, env: process.env });
          let stdout = "";
          p.stdout.on("data", (d) => (stdout += d.toString()));
          p.on("close", (code) => resolve({ stdout, code: code ?? -1 }));
          p.stdin.write(show.stdout);
          p.stdin.end();
        });
        try {
          const data = JSON.parse(beforeOut.stdout) as Array<{ errorCount?: number }>;
          before = data.reduce((s, d) => s + (d.errorCount ?? 0), 0);
        } catch { before = 0; }
      }

      if (after > before) regressions.push({ file: f, before, after });
    }

    if (regressions.length > 0) {
      const summary = regressions.map((r) => `${r.file} ${r.before}→${r.after}`).join(", ");
      log(`ESLint régression(s) introduite(s) par le fix : ${summary}`);
      await finishAttempt("FAILED", { abortReason: `ESLint regression: ${summary}`, filesChanged: actualChanged, diffSummary: parsed.diffSummary });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }
    if (jsLike.length > 0) log(`ESLint OK (pas de régression sur ${jsLike.length} fichier(s)).`);

    // 7. Commit + push + PR (dans le worktree).
    log("Commit…");
    await git(["add", ...actualChanged], cwd);
    const commitMsg = `fix(bug-${shortId(bug.id)}): ${bug.title}\n\n${parsed.diffSummary}\n\nCo-Authored-By: Claude Bug Fixer <noreply@anthropic.com>`;
    const commit = await git(["commit", "-m", commitMsg], cwd);
    if (commit.code !== 0) {
      log(`Commit failed: ${commit.stderr}`);
      await finishAttempt("FAILED", { abortReason: "Commit failed", filesChanged: actualChanged, diffSummary: parsed.diffSummary });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }
    const sha = (await git(["rev-parse", "HEAD"], cwd)).stdout.trim();

    log("Push…");
    const push = await git(["push", "-u", "origin", branch], cwd);
    if (push.code !== 0) {
      log(`Push failed: ${push.stderr}`);
      await finishAttempt("FAILED", { abortReason: "Push failed", branch, commitSha: sha, filesChanged: actualChanged, diffSummary: parsed.diffSummary });
      await cleanupWorktree();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    log("Ouverture PR…");
    const prBody = [
      `## Bug #${shortId(bug.id)} — ${bug.title}`,
      "",
      `**Sévérité :** ${bug.severity}`,
      bug.contextUrl ? `**URL :** ${bug.contextUrl}` : "",
      "",
      "### Description du bug",
      bug.description,
      "",
      "### Changements proposés",
      parsed.diffSummary,
      "",
      `**Confiance Claude :** ${Math.round((parsed.confidence ?? 0) * 100)}%`,
      "",
      `🤖 Auto-généré par le worker Nexus (modèle : ${model}).`,
    ].filter(Boolean).join("\n");
    const prRes = await run(GH_CMD, ["pr", "create", "--base", baseBranch, "--head", branch, "--title", `fix: ${bug.title}`, "--body", prBody], { cwd });
    let prUrl: string | null = null;
    let prNumber: number | null = null;
    if (prRes.code === 0) {
      prUrl = prRes.stdout.trim().split("\n").pop() ?? null;
      const m = prUrl?.match(/\/pull\/(\d+)/);
      if (m) prNumber = parseInt(m[1], 10);
      log(`PR créée : ${prUrl}`);
    } else {
      log(`gh pr create failed: ${prRes.stderr}`);
    }

    await finishAttempt("PROPOSED", {
      branch, commitSha: sha, prUrl, prNumber,
      diffSummary: parsed.diffSummary,
      filesChanged: actualChanged,
      confidence: parsed.confidence,
    });
    await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "FIX_PROPOSED" } });
    // Worktree peut être supprimé : le commit + push ont déjà transmis les changements au remote,
    // et la branche locale subsiste dans .git/refs/heads même après worktree remove.
    await cleanupWorktree();

    // Notifie le tech lead de la PR à merger (non-bloquant).
    void sendFixProposedEmail(attempt.id).catch((e) => log(`sendFixProposedEmail failed: ${e}`));
    return attempt;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Exception : ${msg}`);
    await finishAttempt("FAILED", { abortReason: `Exception: ${msg}` });
    try { await cleanupWorktree(); } catch {}
    await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "APPROVED_FOR_FIX" } });
    return attempt;
  }
}

// ----------------------------------------------------------------------------
// Main loop
// ----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const bugIdArg = args.find((a) => a.startsWith("--bug-id="))?.split("=")[1];
  const bugIdsArg = args.find((a) => a.startsWith("--bug-ids="))?.split("=")[1];
  const maxPerRun = parseInt(args.find((a) => a.startsWith("--max="))?.split("=")[1] ?? String(DEFAULT_MAX_PER_RUN), 10);

  console.log(`[bugfix-worker] Démarrage (dryRun=${dryRun}, max=${maxPerRun})`);

  let bugs: BugReport[];
  if (bugIdArg) {
    const b = await prisma.bugReport.findUnique({ where: { id: bugIdArg } });
    if (!b) { console.error("Bug introuvable"); process.exit(1); }
    bugs = [b];
  } else if (bugIdsArg) {
    // Liste explicite fournie par l'UI : on respecte l'ordre et on limite à
    // max par sécurité. N'importe quel statut passe (l'appelant est responsable
    // d'avoir approuvé avant).
    const ids = bugIdsArg.split(",").map((s) => s.trim()).filter(Boolean);
    const found = await prisma.bugReport.findMany({ where: { id: { in: ids } } });
    const byId = new Map(found.map((b) => [b.id, b]));
    bugs = ids.map((id) => byId.get(id)).filter((b): b is BugReport => !!b).slice(0, maxPerRun);
  } else {
    bugs = await prisma.bugReport.findMany({
      where: { status: "APPROVED_FOR_FIX" },
      orderBy: [{ severity: "desc" }, { approvedForAutoFixAt: "asc" }],
      take: maxPerRun,
    });
  }

  if (bugs.length === 0) { console.log("Aucun bug approuvé."); return; }
  console.log(`${bugs.length} bug(s) à traiter.`);

  for (const bug of bugs) {
    console.log(`\n=== Bug ${shortId(bug.id)} : ${bug.title} ===`);
    await processBug(bug, { dryRun });
  }

  console.log("\n[bugfix-worker] Terminé.");

  // Relance demandée (flag posé par /api/v1/bugs/run-fix-now OU re-posé par
  // un run précédent quand il restait > maxPerRun bugs). Le worker cascade
  // ainsi tout seul jusqu'à vider la queue APPROVED_FOR_FIX.
  // Désactivé en dry-run et quand --bug-id (singulier) est utilisé (usage
  // ciblé one-shot). --bug-ids (pluriel) est OK : on laisse le prochain run
  // prendre les prochains APPROVED_FOR_FIX dans l'ordre normal (severity desc).
  if (!dryRun && !bugIdArg) {
    const flag = path.join(os.tmpdir(), "nexus-bugfix-rerun.flag");
    try {
      await fs.access(flag);
      await fs.unlink(flag);
      const remaining = await prisma.bugReport.count({ where: { status: "APPROVED_FOR_FIX" } });
      if (remaining > 0) {
        console.log(`[bugfix-worker] Flag rerun détecté · ${remaining} bug(s) restants · relance…`);
        // Re-pose le flag pour que le prochain run cascade aussi s'il reste
        // encore du travail après lui. On le fait seulement si remaining >
        // maxPerRun ; sinon ce sera le dernier run, pas besoin de cascader.
        if (remaining > maxPerRun) {
          await fs.writeFile(flag, String(Date.now()));
        }
        const child = spawn("npx", ["tsx", __filename, `--max=${maxPerRun}`], {
          cwd: REPO_ROOT,
          env: process.env,
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      } else {
        console.log("[bugfix-worker] Flag rerun détecté mais plus de bug à traiter.");
      }
    } catch { /* pas de flag — run normal terminé */ }
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

export { processBug };
