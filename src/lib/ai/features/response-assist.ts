// ============================================================================
// AI RESPONSE ASSIST — Phase 1 #3 du copilote Nexus.
//
// Le technicien, sur la fiche ticket, clique "Assistance IA". On produit
// un bloc structuré :
//   - brouillon de réponse client (tonalité pro, prêt à éditer)
//   - pistes de diagnostic (ordonnées)
//   - étapes de vérification
//   - commandes techniques suggérées (PowerShell / CMD / Linux / FortiGate)
//   - tickets similaires déjà résolus (avec lien — extraits du corpus)
//
// Pas d'envoi automatique — c'est STRICTEMENT un brouillon/aide. L'agent
// copie/édite ce qu'il veut dans son composer.
//
// Contexte fourni à l'IA :
//   - ticket courant (sujet, description, type, catégorie si présente)
//   - notes internes + commentaires précédents sur CE ticket
//   - 3-5 tickets FERMÉS similaires (même catégorie ou même endpoint)
//     avec leur note de résolution — alimente le "savoir Cetix"
//
// Sensibilité "client_data" avec scrub PII — les noms/emails/hostnames
// sont pseudonymisés avant envoi cloud et ré-injectés à la sortie.
// ============================================================================

import prisma from "@/lib/prisma";
import { TicketStatus } from "@prisma/client";
import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_RESPONSE_ASSIST } from "@/lib/ai/orchestrator/policies";
import { getOrgContextFacts, formatFactsForPrompt } from "./org-context";

export interface ResponseAssistResult {
  /** Brouillon de message client, ton professionnel, français. */
  clientDraft: string;
  /** Pistes de diagnostic ordonnées par probabilité. */
  diagnosticSteps: string[];
  /** Étapes de vérification à effectuer par le tech. */
  verificationSteps: string[];
  /** Commandes techniques suggérées, avec plateforme + contexte. */
  commands: Array<{
    platform: "powershell" | "cmd" | "bash" | "fortigate" | "other";
    command: string;
    purpose: string;
  }>;
  /** Tickets similaires tirés du corpus local (référence pour le tech). */
  similarResolvedTickets: Array<{
    id: string;
    number: number;
    subject: string;
    resolution: string;
  }>;
}

// ---------------------------------------------------------------------------
// Retrieval — tickets fermés similaires (même org ou même catégorie)
// ---------------------------------------------------------------------------
interface SimilarResolvedTicket {
  id: string;
  number: number;
  subject: string;
  description: string;
  resolutionNotes: string | null;
  categoryName: string | null;
  closedAt: Date | null;
}

async function findSimilarResolvedTickets(args: {
  organizationId: string;
  categoryId: string | null;
  subject: string;
  excludeTicketId: string;
  limit?: number;
}): Promise<SimilarResolvedTicket[]> {
  const limit = args.limit ?? 5;
  // Extraction mots-clés — mêmes règles que le triage (cohérence).
  const stop = new Set([
    "avec", "sans", "dans", "pour", "mais", "plus", "tous", "tout",
    "avoir", "faire", "bien", "autre", "autres",
    "with", "from", "have", "this", "that", "they",
  ]);
  const tokens = (args.subject || "")
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôöùûüÿç\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t))
    .slice(0, 5);

  // Priorité 1 : même catégorie + mots-clés + résolu, tous clients.
  // Priorité 2 : même organisation + mots-clés + résolu.
  // On cumule les deux et déduplique par id pour avoir un set varié.
  const whereByCategory = args.categoryId
    ? {
        categoryId: args.categoryId,
        id: { not: args.excludeTicketId },
        status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
        ...(tokens.length > 0
          ? {
              OR: tokens.map((t) => ({
                subject: { contains: t, mode: "insensitive" as const },
              })),
            }
          : {}),
      }
    : null;

  const whereByOrg = {
    organizationId: args.organizationId,
    id: { not: args.excludeTicketId },
    status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
    ...(tokens.length > 0
      ? {
          OR: tokens.map((t) => ({
            subject: { contains: t, mode: "insensitive" as const },
          })),
        }
      : {}),
  };

  const [byCat, byOrg] = await Promise.all([
    whereByCategory
      ? prisma.ticket.findMany({
          where: whereByCategory,
          select: {
            id: true,
            number: true,
            subject: true,
            description: true,
            closedAt: true,
            resolvedAt: true,
            category: { select: { name: true } },
          },
          orderBy: { closedAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    prisma.ticket.findMany({
      where: whereByOrg,
      select: {
        id: true,
        number: true,
        subject: true,
        description: true,
        closedAt: true,
        resolvedAt: true,
        category: { select: { name: true } },
      },
      orderBy: { closedAt: "desc" },
      take: limit,
    }),
  ]);

  const seen = new Set<string>();
  const merged: SimilarResolvedTicket[] = [];
  for (const t of [...byCat, ...byOrg]) {
    if (seen.has(t.id) || merged.length >= limit) continue;
    seen.add(t.id);
    // Récupère la dernière note interne résolutive — on cherche un
    // comment avec body qui semble être une note de clôture.
    const lastNote = await prisma.comment.findFirst({
      where: { ticketId: t.id, isInternal: true },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    });
    merged.push({
      id: t.id,
      number: t.number,
      subject: t.subject,
      description: (t.description ?? "").slice(0, 400),
      resolutionNotes: lastNote?.body ?? null,
      categoryName: t.category?.name ?? null,
      closedAt: t.closedAt ?? t.resolvedAt,
    });
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function assistResponse(
  ticketId: string,
): Promise<ResponseAssistResult | null> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        type: true,
        organizationId: true,
        categoryId: true,
        category: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    if (!ticket) return null;

    // Récupère les commentaires précédents (internes + clients) sur ce
    // ticket pour que l'IA connaisse l'état d'avancement.
    const comments = await prisma.comment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      select: { body: true, isInternal: true, createdAt: true },
      take: 15,
    });

    const [similar, orgFacts] = await Promise.all([
      findSimilarResolvedTickets({
        organizationId: ticket.organizationId,
        categoryId: ticket.categoryId ?? null,
        subject: ticket.subject ?? "",
        excludeTicketId: ticket.id,
        limit: 5,
      }),
      getOrgContextFacts(ticket.organizationId, 10),
    ]);

    const commentsBlock =
      comments.length === 0
        ? "(aucune note sur ce ticket)"
        : comments
            .slice(-8)
            .map(
              (c) =>
                `[${c.isInternal ? "INTERNE" : "CLIENT"}] ${stripHtml(c.body).slice(0, 400)}`,
            )
            .join("\n---\n");

    const similarBlock =
      similar.length === 0
        ? "(aucun ticket résolu similaire trouvé)"
        : similar
            .map(
              (s, i) => `${i + 1}. Ticket #${s.number} : ${s.subject}
   Catégorie : ${s.categoryName ?? "—"}
   Résolu : ${s.closedAt ? s.closedAt.toISOString().slice(0, 10) : "—"}
   Description : ${s.description.slice(0, 200)}
   Résolution : ${(s.resolutionNotes ?? "(note de clôture absente)").slice(0, 500)}`,
            )
            .join("\n---\n");

    // Charge les patterns appris par le job learning-loops (édits répétés
    // des techs). Si une formulation revient souvent en insertion, on la
    // suggère dans le prompt. Si une formulation est souvent retirée par
    // les techs, on demande au modèle de l'éviter.
    const { getLearnedResponsePatterns } = await import("@/lib/ai/jobs/learning-loops");
    const learned = await getLearnedResponsePatterns("response_assist").catch(() => ({
      preferredInsertions: [] as string[],
      avoidedPhrasings: [] as string[],
      escalationSignals: [],
    }));
    const learnedSection = [
      learned.preferredInsertions.length > 0
        ? `Formulations fréquemment ajoutées par les techs (utilise-les si pertinent) :\n${learned.preferredInsertions.map((l) => `  - ${l}`).join("\n")}`
        : "",
      learned.avoidedPhrasings.length > 0
        ? `Formulations fréquemment RETIRÉES par les techs (évite-les) :\n${learned.avoidedPhrasings.map((l) => `  - ${l}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const system = `Tu es un technicien MSP expérimenté qui assiste un collègue sur un ticket. Tu produis une aide structurée (pas une conversation). Tu réponds EXCLUSIVEMENT en JSON strict, format :

{
  "clientDraft": "brouillon de message pour le CLIENT en français, ton professionnel, rassurant, 3-6 phrases max. Ne promets rien de précis (pas de délai, pas de cause définitive) tant que le diagnostic n'est pas confirmé.",
  "diagnosticSteps": ["piste 1", "piste 2", ...],
  "verificationSteps": ["étape 1", "étape 2", ...],
  "commands": [
    { "platform": "powershell" | "cmd" | "bash" | "fortigate" | "other", "command": "commande exacte", "purpose": "ce qu'elle fait / vérifie" }
  ]
}

Règles :
- diagnosticSteps : 3-6 pistes, ordonnées de plus probable à moins probable.
- verificationSteps : 2-5 étapes concrètes pour vérifier l'hypothèse principale.
- commands : 0-5 commandes. UNIQUEMENT si pertinent au problème. Jamais de commande destructive (rm -rf, format, etc.). Préférer des commandes de DIAGNOSTIC ou de vérification.
- Si les tickets similaires fournis contiennent une solution concrète, inspire-toi des commandes et étapes qu'ils mentionnent.
- clientDraft : reste vague sur les causes tant que non confirmé. "Nous sommes en train d'investiguer..." est OK. Ne mentionne PAS les commandes internes ni les hypothèses non confirmées au client.${learnedSection ? `\n\n---\nSIGNAUX D'APPRENTISSAGE CONTINU (basés sur les édits passés des techniciens) :\n${learnedSection}` : ""}`;

    const factsBlock = formatFactsForPrompt(orgFacts);
    const factsSection = factsBlock ? `\n\n---\n\n${factsBlock}` : "";

    const user = `Ticket courant :
Client : ${ticket.organization?.name ?? "—"}
Type : ${ticket.type}
Catégorie : ${ticket.category?.name ?? "—"}
Sujet : ${ticket.subject}

Description :
${(ticket.description ?? "").slice(0, 2000)}

---

Notes précédentes sur CE ticket :
${commentsBlock}

---

Tickets similaires déjà RÉSOLUS (corpus interne, à utiliser comme référence si pertinent) :
${similarBlock}${factsSection}`;

    const result = await runAiTask({
      policy: POLICY_RESPONSE_ASSIST,
      context: {
        ticketId: ticket.id,
        organizationId: ticket.organizationId,
      },
      taskKind: "generation",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    const parsed = parseJson(result.content);
    if (!parsed) return null;

    const clientDraft =
      typeof parsed.clientDraft === "string" ? parsed.clientDraft.trim() : "";
    const diagnosticSteps = Array.isArray(parsed.diagnosticSteps)
      ? parsed.diagnosticSteps
          .filter((s): s is string => typeof s === "string")
          .slice(0, 8)
      : [];
    const verificationSteps = Array.isArray(parsed.verificationSteps)
      ? parsed.verificationSteps
          .filter((s): s is string => typeof s === "string")
          .slice(0, 8)
      : [];
    const commands = Array.isArray(parsed.commands)
      ? (parsed.commands as unknown[])
          .map((c) => {
            const o = c as Record<string, unknown>;
            const platform = String(o.platform ?? "other").toLowerCase();
            const allowed = ["powershell", "cmd", "bash", "fortigate", "other"];
            return {
              platform: (allowed.includes(platform)
                ? platform
                : "other") as ResponseAssistResult["commands"][number]["platform"],
              command: String(o.command ?? "").slice(0, 500),
              purpose: String(o.purpose ?? "").slice(0, 200),
            };
          })
          .filter((c) => c.command.length > 0)
          .slice(0, 8)
      : [];

    return {
      clientDraft,
      diagnosticSteps,
      verificationSteps,
      commands,
      similarResolvedTickets: similar.map((s) => ({
        id: s.id,
        number: s.number,
        subject: s.subject,
        resolution: stripHtml(s.resolutionNotes ?? "").slice(0, 300),
      })),
    };
  } catch (err) {
    console.warn(
      `[ai-response-assist] ticket ${ticketId} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
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
