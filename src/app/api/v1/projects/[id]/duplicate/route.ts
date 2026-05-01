// ============================================================================
// POST /api/v1/projects/[id]/duplicate
//
// Duplique un projet existant en cible une nouvelle organisation. Permet
// de recréer rapidement un projet similaire pour un autre client (cas
// d'usage : déploiement standardisé, audit récurrent, plan d'action type).
//
// Body :
//   {
//     targetOrganizationId: string;  // organisation cible (peut = source)
//     name: string;                   // nouveau nom (requis)
//     code?: string;                  // optionnel — auto-généré si absent
//     includeTickets?: boolean;       // default true (subject/description
//                                     // copiés, statut reset à NEW)
//     includePhases?: boolean;        // default true
//     includeMilestones?: boolean;    // default true
//     includeTasks?: boolean;         // default true (status reset, pas
//                                     // de comments/time)
//   }
//
// JAMAIS clonés (confidentialité client A → B) :
//   - Comments
//   - Time entries (TimeEntry)
//   - Activity log
//   - Project members (équipe)
//
// Retour : { id, code, name } — l'UI redirige vers /projects/{id}.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

interface DuplicateBody {
  targetOrganizationId?: string;
  name?: string;
  code?: string;
  includeTickets?: boolean;
  includePhases?: boolean;
  includeMilestones?: boolean;
  includeTasks?: boolean;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: DuplicateBody;
  try {
    body = (await req.json()) as DuplicateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.targetOrganizationId || !body.name?.trim()) {
    return NextResponse.json(
      { error: "targetOrganizationId et name requis" },
      { status: 400 },
    );
  }

  const includeTickets = body.includeTickets !== false;
  const includePhases = body.includePhases !== false;
  const includeMilestones = body.includeMilestones !== false;
  const includeTasks = body.includeTasks !== false;

  // Récupère la source avec toutes les relations qu'on peut potentiellement
  // cloner. Si une relation est absente du `include`, on ne la clone pas.
  // Toujours charger les relations — le toggle inclusion s'applique à
  // l'écriture, pas à la lecture. Plus simple et le coût supplémentaire
  // (un projet avec ses N tickets) reste raisonnable.
  const source = await prisma.project.findUnique({
    where: { id },
    include: {
      phases: { orderBy: { sortOrder: "asc" } },
      milestones: { orderBy: { targetDate: "asc" } },
      tasks: { orderBy: { sortOrder: "asc" } },
      tickets: {
        select: {
          subject: true,
          description: true,
          descriptionHtml: true,
          priority: true,
          urgency: true,
          impact: true,
          type: true,
        },
      },
    },
  });
  if (!source) return NextResponse.json({ error: "Project introuvable" }, { status: 404 });

  // Vérifie que l'org cible existe
  const targetOrg = await prisma.organization.findUnique({
    where: { id: body.targetOrganizationId },
    select: { id: true, clientCode: true, slug: true },
  });
  if (!targetOrg) {
    return NextResponse.json({ error: "Organisation cible introuvable" }, { status: 400 });
  }

  // Code unique : si fourni, vérifier non-collision. Sinon, dériver du
  // code source en suffixant (-COPY, -COPY-1, …) jusqu'à trouver libre.
  let code = body.code?.trim();
  if (code) {
    const exists = await prisma.project.findUnique({ where: { code } });
    if (exists) {
      return NextResponse.json({ error: `Le code "${code}" est déjà utilisé` }, { status: 400 });
    }
  } else {
    code = await pickUniqueCode(source.code);
  }

  // Transaction : clone project + nested. Si une étape échoue, rollback
  // intégral pour ne pas laisser de squelette orphelin.
  const created = await prisma.$transaction(
    async (tx) => {
      const cloned = await tx.project.create({
        data: {
          code: code!,
          name: body.name!.trim(),
          description: source.description,
          organizationId: targetOrg.id,
          type: source.type,
          status: "draft", // reset au statut initial
          priority: source.priority,
          managerId: me.id, // l'agent qui duplique devient manager
          // Dates volontairement nulles : à re-saisir pour le nouveau projet
          startDate: null,
          targetEndDate: null,
          actualEndDate: null,
          progressPercent: 0,
          budgetHours: source.budgetHours,
          consumedHours: 0,
          budgetAmount: source.budgetAmount,
          consumedAmount: 0,
          isVisibleToClient: source.isVisibleToClient,
          visibilitySettings: (source.visibilitySettings as never) ?? undefined,
          tags: source.tags,
          isAtRisk: false,
          isArchived: false,
          isInternal: source.isInternal,
        },
        select: { id: true, code: true, name: true },
      });

      // Phases — seulement le squelette (status reset)
      if (includePhases && source.phases.length > 0) {
        for (const p of source.phases) {
          await tx.projectPhase.create({
            data: {
              projectId: cloned.id,
              name: p.name,
              description: p.description,
              sortOrder: p.sortOrder,
              status: "not_started",
            },
          });
        }
      }

      // Milestones — targetDate hérité (souvent une date relative au plan
      // que l'utilisateur va ajuster manuellement après duplication).
      if (includeMilestones && source.milestones.length > 0) {
        for (const m of source.milestones) {
          await tx.projectMilestone.create({
            data: {
              projectId: cloned.id,
              name: m.name,
              description: m.description,
              targetDate: m.targetDate,
              status: "upcoming",
              isCriticalPath: m.isCriticalPath,
            },
          });
        }
      }

      // Tasks — squelette uniquement, pas de dates / heures réelles
      if (includeTasks && source.tasks.length > 0) {
        for (const t of source.tasks) {
          await tx.projectTask.create({
            data: {
              projectId: cloned.id,
              name: t.name,
              description: t.description,
              status: "todo",
              priority: t.priority,
              sortOrder: t.sortOrder,
              estimatedHours: t.estimatedHours,
              isVisibleToClient: t.isVisibleToClient,
              // Pas de assigneeId / startDate / dueDate / actualHours /
              // completedAt — à reconfigurer pour le nouveau projet.
            },
          });
        }
      }

      // Tickets — clone clean
      if (includeTickets && source.tickets && source.tickets.length > 0) {
        for (const tk of source.tickets) {
          await tx.ticket.create({
            data: {
              organizationId: targetOrg.id,
              subject: tk.subject,
              description: tk.description,
              descriptionHtml: tk.descriptionHtml,
              status: "NEW",
              priority: tk.priority,
              prioritySource: "DEFAULT",
              urgency: tk.urgency,
              impact: tk.impact,
              type: tk.type,
              source: "PORTAL",
              creatorId: me.id,
              isInternal: source.isInternal,
              projectId: cloned.id,
            },
          });
        }
      }

      return cloned;
    },
    { timeout: 30_000 },
  );

  return NextResponse.json({
    id: created.id,
    code: created.code,
    name: created.name,
  });
}

/** Trouve un code disponible en suffixant `-COPY[-N]` jusqu'à un libre. */
async function pickUniqueCode(sourceCode: string): Promise<string> {
  const base = `${sourceCode}-COPY`;
  let candidate = base;
  let n = 0;
  // Boucle finie : 100 tentatives raisonnables, sinon échec.
  for (let i = 0; i < 100; i++) {
    const exists = await prisma.project.findUnique({ where: { code: candidate } });
    if (!exists) return candidate;
    n++;
    candidate = `${base}-${n}`;
  }
  throw new Error("Impossible de générer un code unique après 100 tentatives");
}
