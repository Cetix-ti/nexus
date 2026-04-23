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
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd ?? REPO_ROOT, env: { ...process.env, ...opts.env } });
    let stdout = ""; let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
    p.on("error", reject);
  });
}

async function git(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return run("git", args);
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
async function runClaude(systemPrompt: string, userPrompt: string, model: string): Promise<{ stdout: string; stderr: string; code: number }> {
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
    const p = spawn(CLAUDE_CMD, args, { cwd: REPO_ROOT, env: process.env });
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
    data: { bugId: bug.id, status: "ANALYZING", agentModel: model },
  });
  await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "FIX_IN_PROGRESS" } });

  const logs: string[] = [];
  const log = (line: string) => { logs.push(line); console.log(`[bug ${shortId(bug.id)}] ${line}`); };

  const baseBranch = opts.baseBranch ?? DEFAULT_BASE_BRANCH;
  const branch = `bugfix/bug-${shortId(bug.id)}-${slugify(bug.title)}`;

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

  try {
    // 1. Git setup : assure main clean, crée branche.
    if (!opts.dryRun) {
      const clean = await git(["status", "--porcelain"]);
      if (clean.stdout.trim().length > 0) {
        log("Working tree sale — abandon.");
        await finishAttempt("FAILED", { abortReason: "Working tree not clean" });
        await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "APPROVED_FOR_FIX" } });
        return attempt;
      }
      await git(["checkout", baseBranch]);
      await git(["pull", "origin", baseBranch]);
      await git(["checkout", "-b", branch]);
      log(`Branche créée : ${branch}`);
    }

    // 2. Spawn Claude.
    log(`Lancement Claude (${model})…`);
    const { stdout, stderr, code } = await runClaude(
      buildSystemPrompt(),
      buildUserPrompt(bug),
      model,
    );
    if (code !== 0) {
      log(`Claude exit ${code}. stderr: ${stderr.slice(0, 1000)}`);
      await finishAttempt("FAILED", { abortReason: `Claude exit ${code}` });
      if (!opts.dryRun) await git(["checkout", baseBranch]);
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "APPROVED_FOR_FIX" } });
      return attempt;
    }
    log(`Claude stdout ${stdout.length} chars`);

    const parsed = parseClaudeOutput(stdout);
    if (parsed.abortReason) {
      log(`Claude a abandonné : ${parsed.abortReason}`);
      await finishAttempt("ABANDONED", { abortReason: parsed.abortReason, diffSummary: parsed.diffSummary });
      if (!opts.dryRun) { await git(["checkout", baseBranch]); await git(["branch", "-D", branch]); }
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // 3. Vérifie zones interdites.
    const forbidden = filterForbidden(parsed.filesChanged);
    if (forbidden.length > 0) {
      log(`Zones interdites touchées : ${forbidden.join(", ")}`);
      await finishAttempt("ABANDONED", { abortReason: `Zones interdites : ${forbidden.join(", ")}`, filesChanged: parsed.filesChanged });
      if (!opts.dryRun) { await git(["checkout", "--", "."]); await git(["checkout", baseBranch]); await git(["branch", "-D", branch]); }
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // 4. Vérifie que des modifs existent.
    if (opts.dryRun) {
      log(`Dry run — fichiers modifiés : ${parsed.filesChanged.join(", ")}`);
      await finishAttempt("PROPOSED", {
        diffSummary: parsed.diffSummary,
        filesChanged: parsed.filesChanged,
        confidence: parsed.confidence,
      });
      return attempt;
    }

    const diff = await git(["diff", "--name-only"]);
    const actualChanged = diff.stdout.trim().split("\n").filter(Boolean);
    if (actualChanged.length === 0) {
      log("Aucune modif écrite par Claude — abandon.");
      await finishAttempt("ABANDONED", { abortReason: "Aucune modification effective", diffSummary: parsed.diffSummary });
      await git(["checkout", baseBranch]); await git(["branch", "-D", branch]);
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }
    const forbidden2 = filterForbidden(actualChanged);
    if (forbidden2.length > 0) {
      log(`Zones interdites modifiées (detection post-diff) : ${forbidden2.join(", ")}`);
      await git(["checkout", "--", "."]); await git(["checkout", baseBranch]); await git(["branch", "-D", branch]);
      await finishAttempt("ABANDONED", { abortReason: `Zones interdites (post-diff) : ${forbidden2.join(", ")}`, filesChanged: actualChanged });
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // 5. Vérifications tsc + eslint sur fichiers modifiés.
    log("Vérif tsc…");
    const tsc = await run("npx", ["tsc", "--noEmit"]);
    if (tsc.code !== 0) {
      log(`tsc échoue : ${tsc.stdout.slice(-2000)}`);
      await git(["checkout", "--", "."]); await git(["checkout", baseBranch]); await git(["branch", "-D", branch]);
      await finishAttempt("FAILED", { abortReason: "tsc errors after patch", filesChanged: actualChanged, diffSummary: parsed.diffSummary });
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    log("Vérif ESLint sur fichiers modifiés…");
    const eslint = await run("npx", ["eslint", "--max-warnings=50", ...actualChanged.filter((f) => /\.(tsx?|jsx?)$/.test(f))]);
    if (eslint.code !== 0 && eslint.stdout.includes("error")) {
      log(`ESLint errors : ${eslint.stdout.slice(-2000)}`);
      await git(["checkout", "--", "."]); await git(["checkout", baseBranch]); await git(["branch", "-D", branch]);
      await finishAttempt("FAILED", { abortReason: "ESLint errors after patch", filesChanged: actualChanged, diffSummary: parsed.diffSummary });
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }

    // 6. Commit + push + PR
    log("Commit…");
    await git(["add", ...actualChanged]);
    const commitMsg = `fix(bug-${shortId(bug.id)}): ${bug.title}\n\n${parsed.diffSummary}\n\nCo-Authored-By: Claude Bug Fixer <noreply@anthropic.com>`;
    const commit = await git(["commit", "-m", commitMsg]);
    if (commit.code !== 0) {
      log(`Commit failed: ${commit.stderr}`);
      await finishAttempt("FAILED", { abortReason: "Commit failed", filesChanged: actualChanged, diffSummary: parsed.diffSummary });
      await git(["checkout", baseBranch]);
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "TRIAGED" } });
      return attempt;
    }
    const sha = (await git(["rev-parse", "HEAD"])).stdout.trim();

    log("Push…");
    const push = await git(["push", "-u", "origin", branch]);
    if (push.code !== 0) {
      log(`Push failed: ${push.stderr}`);
      await finishAttempt("FAILED", { abortReason: "Push failed", branch, commitSha: sha, filesChanged: actualChanged, diffSummary: parsed.diffSummary });
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
    const prRes = await run(GH_CMD, ["pr", "create", "--base", baseBranch, "--head", branch, "--title", `fix: ${bug.title}`, "--body", prBody]);
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
    await git(["checkout", baseBranch]);

    // Notifie le tech lead de la PR à merger (non-bloquant).
    void sendFixProposedEmail(attempt.id).catch((e) => log(`sendFixProposedEmail failed: ${e}`));
    return attempt;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Exception : ${msg}`);
    await finishAttempt("FAILED", { abortReason: `Exception: ${msg}` });
    try { await git(["checkout", baseBranch]); } catch {}
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
  const maxPerRun = parseInt(args.find((a) => a.startsWith("--max="))?.split("=")[1] ?? String(DEFAULT_MAX_PER_RUN), 10);

  console.log(`[bugfix-worker] Démarrage (dryRun=${dryRun}, max=${maxPerRun})`);

  let bugs: BugReport[];
  if (bugIdArg) {
    const b = await prisma.bugReport.findUnique({ where: { id: bugIdArg } });
    if (!b) { console.error("Bug introuvable"); process.exit(1); }
    bugs = [b];
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
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

export { processBug };
