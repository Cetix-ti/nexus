// ============================================================================
// Re-catégorisation IA d'une période — toutes orgs confondues.
//
// Cible : tickets dont createdAt ∈ [start, end), categoryId=null,
//         categorySource != "MANUAL" (les choix humains sont préservés).
//
// Scope IA déjà géré : `triageTicket` filtre la liste de catégories fournie
// au LLM par `ticket.isInternal` (CLIENT vs INTERNAL) — pas de mélange
// entre les deux univers.
//
// Usage :
//   npx tsx scripts/triage-period.ts 2026-03         # mars 2026 seul
//   npx tsx scripts/triage-period.ts 2026-03 2026-04 # mars + avril 2026
//
// En arrière-plan recommandé :
//   nohup npx tsx scripts/triage-period.ts 2026-03 2026-04 \
//     > /tmp/triage-period.log 2>&1 &
//   tail -f /tmp/triage-period.log
//
// Resume-able : la liste des cibles est re-calculée au démarrage. Relancer
// après une coupure ne refait QUE le travail restant (les tickets déjà
// catégorisés ne réapparaissent pas dans la cible).
// ============================================================================

// Load .env BEFORE importing modules that read process.env at top-level.
// Sans ça, le router AI tombe sur `OLLAMA_MODEL` undefined et utilise le
// fallback "llama3.1:8b" qui n'est pas pull localement → tous les triages
// échouent en ~100ms (model not found).
import { config as loadEnv } from "dotenv";
import path from "path";
loadEnv({ path: path.join(__dirname, "..", ".env") });

import prisma from "../src/lib/prisma";
import { triageTicket, applyTriageIfConfident } from "../src/lib/ai/features/triage";

function parseArgs(argv: string[]): { periods: string[]; orgSlug: string | null } {
  const periods: string[] = [];
  let orgSlug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org") {
      orgSlug = argv[++i];
    } else if (/^\d{4}-\d{2}$/.test(a)) {
      periods.push(a);
    }
  }
  return { periods, orgSlug };
}

function parsePeriod(p: string): { start: Date; end: Date; label: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) throw new Error(`Période invalide (attendu YYYY-MM) : ${p}`);
  const [, ys, ms] = m;
  const y = Number(ys);
  const mm = Number(ms);
  return {
    start: new Date(y, mm - 1, 1, 0, 0, 0, 0),
    end: new Date(y, mm, 1, 0, 0, 0, 0),
    label: p,
  };
}

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

async function main() {
  const { periods: periodArgs, orgSlug } = parseArgs(process.argv.slice(2));
  const periods = periodArgs.map(parsePeriod);
  if (periods.length === 0) {
    console.error("Usage: npx tsx scripts/triage-period.ts YYYY-MM [YYYY-MM ...] [--org slug]");
    process.exit(2);
  }
  const since = new Date(Math.min(...periods.map((p) => p.start.getTime())));
  const until = new Date(Math.max(...periods.map((p) => p.end.getTime())));

  let orgFilter: { id: string; name: string } | null = null;
  if (orgSlug) {
    const o = await prisma.organization.findFirst({
      where: { slug: orgSlug },
      select: { id: true, name: true },
    });
    if (!o) {
      console.error(`Org introuvable : ${orgSlug}`);
      process.exit(2);
    }
    orgFilter = o;
  }

  console.log(
    `[${new Date().toISOString()}] Période${periods.length > 1 ? "s" : ""} : ${periods.map((p) => p.label).join(", ")}` +
      (orgFilter ? `  Org : ${orgFilter.name} (${orgSlug})` : ""),
  );
  console.log(
    `  Plage : ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`,
  );

  const candidates = await prisma.ticket.findMany({
    where: {
      createdAt: { gte: since, lt: until },
      subject: { not: "" },
      categoryId: null,
      OR: [{ categorySource: null }, { categorySource: { not: "MANUAL" } }],
      ...(orgFilter ? { organizationId: orgFilter.id } : {}),
    },
    select: { id: true, number: true, isInternal: true, subject: true },
    orderBy: { createdAt: "asc" },
  });

  const total = candidates.length;
  console.log(`  Tickets cibles : ${total}`);
  console.log(`  PID : ${process.pid}\n`);

  if (total === 0) {
    console.log("Rien à faire.");
    await prisma.$disconnect();
    return;
  }

  const t0 = Date.now();
  let applied = 0;
  let lowConf = 0;
  let failed = 0;

  for (let i = 0; i < total; i++) {
    const t = candidates[i];
    const tStart = Date.now();
    try {
      const result = await triageTicket(t.id);
      if (!result) {
        failed++;
        console.log(`[${i + 1}/${total}] TK-${t.number} — triage null`);
        continue;
      }
      await applyTriageIfConfident(t.id, result);
      const fresh = await prisma.ticket.findUnique({
        where: { id: t.id },
        select: { categoryId: true, categoryConfidence: true, category: { select: { name: true } } },
      });
      const dur = fmt(Date.now() - tStart);
      const conf = fresh?.categoryConfidence != null
        ? `${Math.round(fresh.categoryConfidence * 100)}%`
        : "?";
      if (fresh?.categoryId) {
        applied++;
        console.log(
          `[${i + 1}/${total}] TK-${t.number} ✓ ${fresh.category?.name ?? "?"} (${conf}) — ${dur}`,
        );
      } else {
        lowConf++;
        const c = result.categoryConfidence != null
          ? `${Math.round(result.categoryConfidence * 100)}%`
          : "?";
        console.log(
          `[${i + 1}/${total}] TK-${t.number} … conf basse (${c}) — ${dur}`,
        );
      }
    } catch (e) {
      failed++;
      console.log(
        `[${i + 1}/${total}] TK-${t.number} ✗ ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if ((i + 1) % 50 === 0) {
      const el = Date.now() - t0;
      const avg = el / (i + 1);
      const eta = avg * (total - i - 1);
      console.log(
        `── ${i + 1}/${total} | ✓${applied} … ${lowConf} ✗${failed} | ${fmt(el)} · ETA ${fmt(eta)}`,
      );
    }
  }

  console.log(`\n[${new Date().toISOString()}] Terminé en ${fmt(Date.now() - t0)}`);
  console.log(`  ✓ classés (haute conf) : ${applied}`);
  console.log(`  … laissés (conf basse) : ${lowConf}`);
  console.log(`  ✗ erreurs              : ${failed}`);
  console.log(`  Total                  : ${total}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
