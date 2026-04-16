// ============================================================================
// Auto-prioritisation IA des tickets à la création.
//
// Appelé en fire-and-forget juste après la création d'un ticket. Le
// principe :
//   - Le créateur peut fixer une priorité explicite (ex: "critical" après
//     un appel client affolé) → on stocke prioritySource="MANUAL".
//   - Sinon, la valeur par défaut est LOW → prioritySource="DEFAULT".
//   - Dans les DEUX cas, l'IA analyse le ticket. Si sa confiance est
//     "high", elle peut :
//        · confirmer "low" (pas d'écrasement visible, mais on marque "AI")
//        · remonter à medium/high/critical (écrasement + marquage "AI")
//     Si sa confiance est medium ou low → on ne touche PAS la valeur
//     courante, et on laisse l'agent décider. La notice UI n'apparaît que
//     quand prioritySource="AI".
//
// Non-idempotent pas nécessaire ici (un ticket est prioritisé au max une
// fois à la création) — si ré-appelé, on re-calcule et on écrase à nouveau.
// ============================================================================

import prisma from "@/lib/prisma";
import { suggestPriority, type AiPriority } from "@/lib/ai/service";

const UI_TO_DB: Record<AiPriority, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

export async function autoPrioritizeTicketAsync(ticketId: string): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        priority: true,
        prioritySource: true,
      },
    });
    if (!ticket) return;
    if (!ticket.subject?.trim()) return;

    // Si un agent est déjà intervenu pour ajuster la priorité (prioritySource
    // = "MANUAL" défini ailleurs, ex: édition post-création), on NE touche
    // PLUS rien — on respecte sa décision.
    // À la CRÉATION, prioritySource arrive comme "DEFAULT" ou "MANUAL" selon
    // que le créateur a fourni explicitement une priorité. Dans les deux cas
    // on laisse l'IA proposer.
    const suggestion = await suggestPriority(
      ticket.subject,
      ticket.description ?? "",
    );

    // Seul "high" déclenche une écriture. Les autres cas : aucune action —
    // la valeur initiale est conservée et la notice "IA" n'apparaît pas.
    if (suggestion.confidence !== "high") {
      console.log(
        `[ai-auto-prioritize] Ticket ${ticketId} — confiance ${suggestion.confidence}, pas d'ajustement (${suggestion.reasoning})`,
      );
      return;
    }

    const newPriorityDb = UI_TO_DB[suggestion.priority];
    if (!newPriorityDb) return;

    // Re-fetch pour voir si un agent a MANUELLEMENT changé la priorité
    // pendant l'appel IA (fenêtre 500ms-2s). Si oui → on respecte.
    const fresh = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { priority: true, prioritySource: true },
    });
    if (!fresh) return;
    if (fresh.prioritySource === "MANUAL" && fresh.priority !== ticket.priority) {
      // Quelqu'un a modifié manuellement entre-temps → on ne touche pas.
      return;
    }

    // Écrit la nouvelle priorité + marque "AI".
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        priority: newPriorityDb,
        prioritySource: "AI",
      },
    });
    console.log(
      `[ai-auto-prioritize] Ticket ${ticketId}: ${ticket.priority} → ${newPriorityDb} (${suggestion.reasoning})`,
    );
  } catch (e) {
    console.warn(
      `[ai-auto-prioritize] Ticket ${ticketId} failed:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}
