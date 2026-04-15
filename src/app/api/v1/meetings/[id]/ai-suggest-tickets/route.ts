import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * POST /api/v1/meetings/[id]/ai-suggest-tickets
 *
 * Analyse les notes + les items d'agenda d'une rencontre interne et
 * propose une liste de tickets / tâches à créer. Ne CRÉE PAS les tickets —
 * l'opérateur valide la liste côté UI puis appelle le endpoint de
 * création en lot.
 *
 * Format de réponse :
 *   { suggestions: [{ subject, description, priority, rationale }] }
 *
 * Si OPENAI_API_KEY n'est pas configuré, retombe sur un extracteur
 * heuristique simple (phrases avec verbes d'action impératifs ou "TODO").
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      agenda: {
        include: { addedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Construit le matériel de contexte
  const notesText = stripHtml(meeting.notes ?? "");
  const agendaText = meeting.agenda
    .map(
      (a, i) =>
        `${i + 1}. ${a.title}${a.notes ? "\n   Notes: " + stripHtml(a.notes) : ""}${a.description ? "\n   Description: " + a.description : ""}`,
    )
    .join("\n");

  if (!notesText && !agendaText) {
    return NextResponse.json(
      { suggestions: [], note: "Aucune note ni item d'agenda — rien à analyser." },
    );
  }

  // AI path
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `Tu es un assistant MSP qui analyse les notes de rencontre interne d'une équipe TI et extrait les actions concrètes à faire. Tu réponds EXCLUSIVEMENT en JSON valide, format:
{
  "suggestions": [
    { "subject": "...", "description": "...", "priority": "low|medium|high|critical", "rationale": "pourquoi ça devrait devenir un ticket" }
  ]
}
Règles :
- Extrais uniquement les ACTIONS concrètes (décisions, tâches, corrections à faire), pas les constats ou les informations.
- Pas de doublons : si deux points décrivent la même action, fusionne-les.
- "subject" : court, action-oriented (verbe à l'infinitif en français).
- "priority" : inférée selon l'urgence / l'impact. "high" si mentionne "urgent", "critique", "bloquant". "medium" par défaut.
- Retourne 0-10 suggestions max. Pas de spam — si aucune action n'est claire, retourne {"suggestions": []}.`,
            },
            {
              role: "user",
              content: `Titre de la rencontre : ${meeting.title}\n\nAgenda :\n${agendaText || "(vide)"}\n\nNotes de rencontre :\n${notesText || "(vides)"}`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.suggestions)) {
            return NextResponse.json({ suggestions: parsed.suggestions, source: "openai" });
          }
        } catch {
          // JSON parse failed — tombe sur l'heuristique
        }
      }
    } catch {
      // Erreur réseau OpenAI — tombe sur l'heuristique
    }
  }

  // Fallback heuristique : lignes qui commencent par un verbe d'action
  // ou qui contiennent "TODO", "À faire", "Action :", "- [ ]".
  const combined = `${agendaText}\n${notesText}`;
  const lines = combined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const actionVerbs = [
    "corriger", "créer", "configurer", "installer", "mettre", "ajouter",
    "vérifier", "contacter", "planifier", "rédiger", "envoyer", "tester",
    "déployer", "documenter", "former", "migrer", "supprimer", "déboguer",
    "fixer", "réparer", "appeler",
  ];
  const todoPatterns = /^(todo|action|à faire|\[[\sx]\]|-\s*\[[\sx]\])\s*:?\s*/i;

  const seen = new Set<string>();
  const suggestions: Array<{
    subject: string;
    description: string;
    priority: string;
    rationale: string;
  }> = [];
  for (const raw of lines) {
    const lower = raw.toLowerCase();
    const isAction =
      todoPatterns.test(raw) ||
      actionVerbs.some((v) => lower.startsWith(v));
    if (!isAction) continue;
    const cleaned = raw.replace(todoPatterns, "").replace(/^[-*•]\s*/, "").trim();
    if (cleaned.length < 4) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const priority = /urgent|critique|bloqu/i.test(raw)
      ? "high"
      : /asap|rapidement|cette semaine/i.test(raw)
      ? "high"
      : "medium";
    suggestions.push({
      subject: cleaned.slice(0, 120),
      description: `Extrait de la rencontre "${meeting.title}" :\n> ${raw}`,
      priority,
      rationale: "Détecté comme action concrète dans les notes",
    });
    if (suggestions.length >= 10) break;
  }
  return NextResponse.json({ suggestions, source: "heuristic" });
}

function stripHtml(html: string): string {
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
