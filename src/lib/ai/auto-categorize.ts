// ============================================================================
// Auto-catégorisation IA des tickets à la création.
//
// Appelé en fire-and-forget juste après la création d'un ticket qui n'a
// pas de categoryId fourni. L'appel OpenAI prend 500ms-2s ; on ne veut
// pas bloquer la réponse HTTP, donc on asynchronise. Si l'IA échoue
// (clé absente, réseau, parse JSON foireux), le ticket reste sans
// catégorie — l'utilisateur peut toujours utiliser le bouton manuel
// "Suggérer par IA" sur la fiche.
//
// Gotchas :
//   - Le modèle IA renvoie un NOM de catégorie. On doit le résoudre en
//     categoryId via Prisma. Si aucun match, on laisse le ticket sans
//     catégorie (pas de création de catégorie "zombie" côté DB).
//   - Seulement pour les tickets non classés. Si l'utilisateur a pris
//     la peine de sélectionner une catégorie manuellement, on la respecte.
// ============================================================================

import prisma from "@/lib/prisma";
import { suggestCategory } from "@/lib/ai/service";

/**
 * Lance la suggestion + application en arrière-plan. Ne throw jamais —
 * les erreurs sont logguées mais n'interrompent pas le flow appelant.
 */
export async function autoCategorizeTicketAsync(ticketId: string): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        categoryId: true,
      },
    });
    // Le ticket a déjà une catégorie (le user a choisi) → on respecte.
    if (!ticket || ticket.categoryId) return;
    if (!ticket.subject?.trim()) return;

    const suggestion = await suggestCategory(
      ticket.subject,
      ticket.description ?? "",
    );
    if (!suggestion.categoryLevel1 || !suggestion.categoryLevel1.trim()) return;

    // Résolution hiérarchique nom → id. L'IA renvoie jusqu'à 3 niveaux
    // (level1 obligatoire, level2 et level3 optionnels). On descend le
    // plus profond possible :
    //   - level1 = catégorie racine (parentId null)
    //   - level2 = enfant direct de level1
    //   - level3 = enfant direct de level2
    // Si un niveau demandé ne matche pas, on garde le plus profond
    // trouvé avant → évite de perdre toute la catégorisation à cause
    // d'un typo dans le level3.
    const l1 = await prisma.category.findFirst({
      where: {
        isActive: true,
        parentId: null,
        name: {
          equals: suggestion.categoryLevel1.trim(),
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    if (!l1) {
      console.warn(
        `[ai-auto-categorize] Ticket ${ticketId}: niveau 1 "${suggestion.categoryLevel1}" introuvable`,
      );
      return;
    }
    let deepestId = l1.id;
    if (suggestion.categoryLevel2) {
      const l2 = await prisma.category.findFirst({
        where: {
          isActive: true,
          parentId: l1.id,
          name: {
            equals: suggestion.categoryLevel2.trim(),
            mode: "insensitive",
          },
        },
        select: { id: true },
      });
      if (l2) {
        deepestId = l2.id;
        if (suggestion.categoryLevel3) {
          const l3 = await prisma.category.findFirst({
            where: {
              isActive: true,
              parentId: l2.id,
              name: {
                equals: suggestion.categoryLevel3.trim(),
                mode: "insensitive",
              },
            },
            select: { id: true },
          });
          if (l3) deepestId = l3.id;
        }
      }
    }
    const byName = { id: deepestId };

    // Double-check : la catégorie a pu être changée entre-temps par le
    // user (fenêtre de 1-2s entre création et fin du call IA). On ne
    // l'écrase que si elle est TOUJOURS null.
    const fresh = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { categoryId: true },
    });
    if (fresh?.categoryId) return;

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { categoryId: byName.id },
    });
    console.log(
      `[ai-auto-categorize] Ticket ${ticketId} → "${suggestion.category}" (${suggestion.confidence})`,
    );
  } catch (e) {
    console.warn(
      `[ai-auto-categorize] Ticket ${ticketId} failed:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}
