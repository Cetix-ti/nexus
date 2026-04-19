// ============================================================================
// AI CHECKLISTS — Phase 2 #17.
//
// Pour une catégorie donnée, génère une checklist d'intervention standard
// en analysant 10-20 tickets RÉSOLUS de cette catégorie. La checklist
// apparaît sur les nouveaux tickets de la même catégorie pour guider le
// tech.
//
// Cache : `AiPattern` avec scope="checklist", key=categoryId. Expire après
// 30 jours — on régénère pour suivre l'évolution du savoir Cetix. Force
// regenerate disponible via endpoint admin.
// ============================================================================

import prisma from "@/lib/prisma";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_CHECKLIST_GEN } from "@/lib/ai/orchestrator/policies";

export interface ChecklistItem {
  /** Label visible, verbe à l'infinitif ou question. */
  label: string;
  /** Étape du flux : diagnostic → vérification → action. */
  step: "diagnostic" | "verification" | "action";
}

export interface CategoryChecklist {
  categoryId: string;
  categoryName: string;
  items: ChecklistItem[];
  /** Nombre de tickets analysés — transparence sur la fiabilité. */
  sampleCount: number;
  generatedAt: string;
}

const CACHE_TTL_DAYS = 30;
const CACHE_SCOPE = "checklist";

// ---------------------------------------------------------------------------
// Lecture (cache-first) — utilisée par l'UI sur les nouveaux tickets
// ---------------------------------------------------------------------------
export async function getChecklistForCategory(
  categoryId: string,
): Promise<CategoryChecklist | null> {
  const row = await prisma.aiPattern.findUnique({
    where: {
      scope_kind_key: {
        scope: CACHE_SCOPE,
        kind: "intervention",
        key: categoryId,
      },
    },
  });
  if (!row) return null;
  const age = Date.now() - row.lastUpdatedAt.getTime();
  const expired = age > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (expired) return null;
  const val = row.value as unknown as CategoryChecklist;
  if (!val || !Array.isArray(val.items)) return null;
  return val;
}

// ---------------------------------------------------------------------------
// Génération — parcourt les tickets résolus, appel IA, store dans AiPattern
// ---------------------------------------------------------------------------
export async function generateChecklistForCategory(
  categoryId: string,
): Promise<CategoryChecklist | null> {
  try {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true },
    });
    if (!category) return null;

    // Echantillon : 15 tickets résolus les plus récents de cette catégorie.
    const tickets = await prisma.ticket.findMany({
      where: {
        categoryId,
        status: { in: ["RESOLVED", "CLOSED"] },
      },
      select: {
        id: true,
        subject: true,
        description: true,
        comments: {
          where: { isInternal: true },
          orderBy: { createdAt: "desc" },
          select: { body: true },
          take: 2,
        },
      },
      orderBy: { closedAt: "desc" },
      take: 15,
    });

    if (tickets.length < 3) {
      // Pas assez d'échantillon pour produire une checklist fiable.
      return null;
    }

    const samplesText = tickets
      .map(
        (t, i) =>
          `### Exemple ${i + 1}
Sujet : ${t.subject}
Description : ${(t.description ?? "").slice(0, 400)}
Notes internes :
${t.comments.map((c) => stripHtml(c.body).slice(0, 400)).join("\n---\n") || "(aucune)"}`,
      )
      .join("\n\n");

    const system = `Tu extrais une CHECKLIST D'INTERVENTION réutilisable à partir de tickets MSP déjà résolus dans une même catégorie. L'objectif : un technicien qui ouvre un nouveau ticket de cette catégorie suit la checklist et ne manque rien.

Tu réponds EXCLUSIVEMENT en JSON strict, format :
{
  "items": [
    { "label": "vérifier que le service spooler est démarré", "step": "diagnostic" },
    ...
  ]
}

Règles :
- 5 à 10 items maximum, ordonnés logiquement.
- "step" parmi : "diagnostic" (identifier le problème), "verification" (confirmer une hypothèse), "action" (corriger).
- Labels concis, verbes à l'infinitif, français. Pas de "vous" ni de "nous".
- Universels pour la catégorie — pas spécifiques à un client ou endpoint particulier.
- Commence par le diagnostic simple avant les actions coûteuses.
- Si les tickets ne montrent pas de pattern clair, retourne {"items": []} — l'UI saura ignorer.`;

    const user = `Catégorie : ${category.name}

Tickets résolus récents (${tickets.length} exemples) :

${samplesText}`;

    const result = await runAiTask({
      policy: POLICY_CHECKLIST_GEN,
      context: { organizationId: undefined },
      taskKind: "extraction",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    const items = Array.isArray(parsed.items)
      ? (parsed.items as unknown[])
          .map((x) => {
            const o = x as Record<string, unknown>;
            const label = String(o.label ?? "").trim();
            if (!label) return null;
            const step = String(o.step ?? "").toLowerCase();
            const validStep =
              step === "diagnostic" || step === "verification" || step === "action"
                ? (step as ChecklistItem["step"])
                : "action";
            return { label: label.slice(0, 160), step: validStep };
          })
          .filter((x): x is ChecklistItem => x !== null)
          .slice(0, 12)
      : [];

    if (items.length === 0) return null;

    const checklist: CategoryChecklist = {
      categoryId: category.id,
      categoryName: category.name,
      items,
      sampleCount: tickets.length,
      generatedAt: new Date().toISOString(),
    };

    // Persiste dans AiPattern — upsert via unique (scope, kind, key).
    await prisma.aiPattern.upsert({
      where: {
        scope_kind_key: {
          scope: CACHE_SCOPE,
          kind: "intervention",
          key: category.id,
        },
      },
      create: {
        scope: CACHE_SCOPE,
        kind: "intervention",
        key: category.id,
        value: checklist as unknown as import("@prisma/client").Prisma.InputJsonValue,
        sampleCount: tickets.length,
        confidence: Math.min(1, tickets.length / 15),
      },
      update: {
        value: checklist as unknown as import("@prisma/client").Prisma.InputJsonValue,
        sampleCount: tickets.length,
        confidence: Math.min(1, tickets.length / 15),
      },
    });

    return checklist;
  } catch (err) {
    console.warn(
      `[ai-checklist] category ${categoryId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(raw);
    return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const o = JSON.parse(m[0]);
      return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
