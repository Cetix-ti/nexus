// ============================================================================
// PLAYBOOK MINER — extrait des playbooks réutilisables depuis les clusters
// de tickets résolus.
//
// Pipeline :
//   1. Pour chaque catégorie avec ≥ MIN_CLUSTER tickets résolus, cluster
//      les tickets via embeddings cosine (réutilise l'infra existante).
//   2. Pour chaque cluster de ≥ MIN_SIZE tickets :
//      a. Envoie au LLM les 5-8 tickets représentatifs (sujet + dernière
//         note interne = résolution documentée)
//      b. Le LLM extrait un playbook standardisé :
//         - Titre (court, clair)
//         - Symptômes typiques
//         - Diagnostic recommandé (3-6 étapes)
//         - Résolution type (3-8 étapes)
//         - Commandes utiles (PowerShell, Fortigate, etc.)
//         - Prévention
//   3. Le playbook est sauvegardé comme AiPattern
//      (scope="playbook:<categoryId>", kind="playbook") et optionnellement
//      publié comme article KB brouillon pour édition humaine.
//
// Résultat : après quelques semaines, la KB Nexus contient des runbooks
// minés depuis la vraie expérience des techs — sans qu'aucun humain n'ait
// eu à les écrire.
// ============================================================================

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { cosineSim } from "@/lib/ai/embeddings";
import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_KB_GEN } from "@/lib/ai/orchestrator/policies";
import crypto from "node:crypto";

const CLUSTER_SIM_THRESHOLD = 0.82;
const MIN_CLUSTER_SIZE = 4;
const MAX_CLUSTERS_PER_CAT = 3;
const MAX_CATS_PER_RUN = 10;

interface PlaybookDraft {
  title: string;
  symptoms: string[];
  diagnosticSteps: string[];
  resolutionSteps: string[];
  commands: Array<{ platform: string; command: string; purpose: string }>;
  prevention: string[];
  sourceTicketIds: string[];
}

export async function minePlaybooks(): Promise<{
  categoriesProcessed: number;
  clustersFound: number;
  playbooksExtracted: number;
  kbDrafted: number;
}> {
  const stats = {
    categoriesProcessed: 0,
    clustersFound: 0,
    playbooksExtracted: 0,
    kbDrafted: 0,
  };

  // Sélection : catégories avec beaucoup de tickets résolus embeddés,
  // priorité aux plus actives (plus de signal = meilleurs playbooks).
  const activeCats = await prisma.category.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: {
        select: {
          tickets: {
            where: {
              status: { in: ["RESOLVED", "CLOSED"] },
              NOT: { embedding: { equals: Prisma.DbNull } },
            },
          },
        },
      },
    },
  });
  const ranked = activeCats
    .filter((c) => c._count.tickets >= MIN_CLUSTER_SIZE * 2)
    .sort((a, b) => b._count.tickets - a._count.tickets)
    .slice(0, MAX_CATS_PER_RUN);

  for (const cat of ranked) {
    stats.categoriesProcessed++;
    const clusters = await clusterCategoryTickets(cat.id);
    for (const cluster of clusters.slice(0, MAX_CLUSTERS_PER_CAT)) {
      if (cluster.length < MIN_CLUSTER_SIZE) continue;
      stats.clustersFound++;

      // Dédup : on hash la liste triée d'ids → si ce cluster exact existe
      // déjà, skip (évite de re-miner à chaque tour pour rien).
      const clusterHash = crypto
        .createHash("sha256")
        .update(cluster.map((c) => c.id).sort().join(","))
        .digest("hex")
        .slice(0, 16);

      const existing = await prisma.aiPattern.findUnique({
        where: {
          scope_kind_key: {
            scope: `playbook:${cat.id}`,
            kind: "playbook",
            key: clusterHash,
          },
        },
        select: { id: true, lastUpdatedAt: true },
      });
      // Si ce cluster existant a moins de 14 jours, skip
      if (
        existing &&
        Date.now() - existing.lastUpdatedAt.getTime() < 14 * 24 * 3600_000
      ) {
        continue;
      }

      const playbook = await extractPlaybook(cluster, cat.name);
      if (!playbook) continue;
      stats.playbooksExtracted++;

      await prisma.aiPattern.upsert({
        where: {
          scope_kind_key: {
            scope: `playbook:${cat.id}`,
            kind: "playbook",
            key: clusterHash,
          },
        },
        create: {
          scope: `playbook:${cat.id}`,
          kind: "playbook",
          key: clusterHash,
          value: playbook as never,
          sampleCount: cluster.length,
          confidence: Math.min(1, cluster.length / 10),
        },
        update: {
          value: playbook as never,
          sampleCount: cluster.length,
          confidence: Math.min(1, cluster.length / 10),
        },
      });

      // Article KB brouillon auto si le playbook est assez solide
      // (≥ 6 tickets dans le cluster).
      if (cluster.length >= 6) {
        try {
          await createKbDraftFromPlaybook(cat.id, playbook);
          stats.kbDrafted++;
        } catch (err) {
          console.warn("[playbook] KB draft failed:", err);
        }
      }
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Clustering intra-catégorie par cosine similarity
// ---------------------------------------------------------------------------

async function clusterCategoryTickets(categoryId: string): Promise<
  Array<
    Array<{
      id: string;
      subject: string;
      resolutionText: string | null;
      vec: number[];
    }>
  >
> {
  const tickets = await prisma.ticket.findMany({
    where: {
      categoryId,
      status: { in: ["RESOLVED", "CLOSED"] },
      NOT: { embedding: { equals: Prisma.DbNull } },
    },
    select: {
      id: true,
      subject: true,
      embedding: true,
      comments: {
        where: { isInternal: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
    },
    take: 300,
    orderBy: { closedAt: "desc" },
  });

  type Entry = {
    id: string;
    subject: string;
    resolutionText: string | null;
    vec: number[];
    cluster: number;
  };
  const entries: Entry[] = [];
  for (const t of tickets) {
    if (!Array.isArray(t.embedding)) continue;
    entries.push({
      id: t.id,
      subject: t.subject,
      resolutionText: stripHtml(t.comments[0]?.body ?? null),
      vec: t.embedding as number[],
      cluster: -1,
    });
  }

  let nextCluster = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].cluster !== -1) continue;
    entries[i].cluster = nextCluster;
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[j].cluster !== -1) continue;
      if (cosineSim(entries[i].vec, entries[j].vec) >= CLUSTER_SIM_THRESHOLD) {
        entries[j].cluster = nextCluster;
      }
    }
    nextCluster++;
  }

  const byCluster = new Map<number, typeof entries>();
  for (const e of entries) {
    const arr = byCluster.get(e.cluster) ?? [];
    arr.push(e);
    byCluster.set(e.cluster, arr);
  }

  return Array.from(byCluster.values())
    .filter((arr) => arr.length >= MIN_CLUSTER_SIZE)
    .sort((a, b) => b.length - a.length);
}

function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Extraction du playbook par LLM
// ---------------------------------------------------------------------------

async function extractPlaybook(
  cluster: Array<{ id: string; subject: string; resolutionText: string | null }>,
  categoryName: string,
): Promise<PlaybookDraft | null> {
  const samples = cluster
    .filter((c) => c.resolutionText && c.resolutionText.length > 50)
    .slice(0, 6);
  if (samples.length < 2) return null;

  const ticketBlock = samples
    .map(
      (s, i) =>
        `### Cas ${i + 1} : ${s.subject}\nRésolution documentée :\n${(s.resolutionText ?? "").slice(0, 1000)}`,
    )
    .join("\n\n---\n\n");

  const system = `Tu es un senior MSP analyst. Tu analyses plusieurs tickets RÉSOLUS qui partagent le même problème (clustering sémantique) et tu extrais un PLAYBOOK standardisé — un runbook réutilisable que les techs pourront suivre la prochaine fois qu'ils voient ce pattern.

Catégorie parente : ${categoryName}

Réponds EXCLUSIVEMENT en JSON strict :
{
  "title": "titre court du playbook (ex: 'Outlook se fige au démarrage — reset de profil')",
  "symptoms": ["symptôme typique 1", "symptôme 2", ...],  // 2-4 bullets
  "diagnosticSteps": ["étape 1", "étape 2", ...],         // 3-6 bullets
  "resolutionSteps": ["étape 1", "étape 2", ...],         // 3-8 bullets
  "commands": [
    { "platform": "powershell" | "cmd" | "bash" | "fortigate" | "other", "command": "commande exacte", "purpose": "à quoi ça sert" }
  ],
  "prevention": ["action préventive", ...]                // 1-3 bullets
}

Règles :
- Ne JAMAIS inventer de commande. Si aucune commande n'apparaît dans les cas source, retourne "commands": [].
- Les étapes doivent être ACTIONNABLES et chronologiques.
- Préfère la voix active ("Vérifier", "Redémarrer", "Ouvrir").
- Si les cas source divergent trop → extrais seulement ce qu'ils ont EN COMMUN.`;

  const user = `Voici ${samples.length} tickets résolus du même cluster sémantique. Extrais le playbook commun.\n\n${ticketBlock}`;

  const res = await runAiTask({
    policy: { ...POLICY_KB_GEN, preferOpenAI: true }, // gpt-4o-mini meilleur pour extraction structurée
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "extraction",
  });

  if (!res.ok || !res.content) return null;
  const parsed = tryParseJson<Record<string, unknown>>(res.content);
  if (!parsed) return null;

  const title = typeof parsed.title === "string" ? parsed.title.slice(0, 200) : "";
  if (!title) return null;

  const strArr = (x: unknown, max = 10) =>
    Array.isArray(x)
      ? x.filter((s): s is string => typeof s === "string").slice(0, max)
      : [];

  const cmds = Array.isArray(parsed.commands)
    ? (parsed.commands as unknown[])
        .map((c) => c as Record<string, unknown>)
        .filter((c) => typeof c.command === "string" && typeof c.platform === "string")
        .map((c) => ({
          platform: String(c.platform),
          command: String(c.command),
          purpose: String(c.purpose ?? ""),
        }))
        .slice(0, 8)
    : [];

  return {
    title,
    symptoms: strArr(parsed.symptoms, 4),
    diagnosticSteps: strArr(parsed.diagnosticSteps, 6),
    resolutionSteps: strArr(parsed.resolutionSteps, 8),
    commands: cmds,
    prevention: strArr(parsed.prevention, 3),
    sourceTicketIds: cluster.map((c) => c.id),
  };
}

// ---------------------------------------------------------------------------
// Crée un brouillon KB depuis un playbook
// ---------------------------------------------------------------------------

async function createKbDraftFromPlaybook(
  categoryId: string,
  p: PlaybookDraft,
): Promise<void> {
  const { createArticle } = await import("@/lib/kb/service");

  // Chercher la category KB correspondante par nom — si on a une
  // ArticleCategory avec le même label, on la réutilise. Sinon, null
  // (l'article va en "non classé").
  const ticketCat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { name: true },
  });
  const articleCat = ticketCat
    ? await prisma.articleCategory.findFirst({
        where: { name: ticketCat.name },
        select: { id: true },
      })
    : null;

  const body = `
<h2>Symptômes typiques</h2>
<ul>${p.symptoms.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>

<h2>Diagnostic</h2>
<ol>${p.diagnosticSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>

<h2>Résolution</h2>
<ol>${p.resolutionSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>

${
  p.commands.length > 0
    ? `<h2>Commandes utiles</h2>
<ul>${p.commands.map((c) => `<li><strong>${escapeHtml(c.platform)}</strong> — ${escapeHtml(c.purpose)}<pre><code>${escapeHtml(c.command)}</code></pre></li>`).join("")}</ul>`
    : ""
}

${
  p.prevention.length > 0
    ? `<h2>Prévention</h2>
<ul>${p.prevention.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : ""
}

<hr>
<p><em>Playbook généré automatiquement à partir de ${p.sourceTicketIds.length} tickets résolus similaires. À relire et valider avant publication.</em></p>
  `.trim();

  await createArticle({
    title: `[Auto] ${p.title}`,
    summary: p.symptoms.slice(0, 2).join(" · "),
    body,
    categoryId: articleCat?.id ?? null,
    status: "DRAFT", // toujours en brouillon pour relecture humaine
    isPublic: false,
    tags: ["playbook", "auto-généré"],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
