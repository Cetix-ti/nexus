// ============================================================================
// Helper partagé — récupère le contexte IA pertinent pour une organisation.
//
// Utilisé par triage.ts et response-assist.ts pour injecter dans le prompt
// les conventions / quirks / préférences validées du client. C'est LE
// mécanisme qui rend les suggestions progressivement meilleures sur
// chaque client :
//
//   - Un fact validé ("VDSA utilise FortiClient SAML, pas local")
//   - se retrouve dans le contexte du prochain triage ou assistance
//   - → l'IA ne re-demande pas de vérifier le type d'auth VPN
//   - → le brouillon suggéré est déjà aligné avec la convention
//
// On préfère les faits VALIDÉS (verifiedAt != null) — ceux en attente sont
// inclus seulement si on n'a rien d'autre, pour ne pas polluer le prompt
// avec du savoir non confirmé.
// ============================================================================

import prisma from "@/lib/prisma";

export interface OrgContextFact {
  category: string;
  content: string;
  verified: boolean;
}

/**
 * Retourne les faits AiMemory utilisables en contexte IA pour cette org.
 * Ordre :
 *   1. Faits VALIDÉS (verifiedAt != null) — les plus fiables
 *   2. Faits en attente (source=manual seulement — ajoutés par un admin,
 *      pas par l'IA). Les faits auto-extraits non validés sont SKIPPÉS
 *      pour éviter de boucler (IA alimentée par IA).
 *
 * Limite : 15 faits max — au-delà le prompt devient trop lourd pour peu
 * de gain.
 */
export async function getOrgContextFacts(
  organizationId: string,
  max = 15,
): Promise<OrgContextFact[]> {
  const rows = await prisma.aiMemory.findMany({
    where: {
      scope: `org:${organizationId}`,
      rejectedAt: null,
      OR: [
        // Validés
        { verifiedAt: { not: null } },
        // Manuels en attente (sources "manual:*")
        { source: { startsWith: "manual:" } },
      ],
    },
    select: { category: true, content: true, verifiedAt: true },
    orderBy: [
      { verifiedAt: { sort: "desc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
    take: max,
  });
  return rows.map((r) => ({
    category: r.category,
    content: r.content,
    verified: r.verifiedAt != null,
  }));
}

/**
 * Formate les faits pour injection dans un prompt système. Renvoie une
 * chaîne vide si aucun fait — le caller peut alors omettre la section.
 */
export function formatFactsForPrompt(facts: OrgContextFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map(
    (f) =>
      `- [${f.category}${f.verified ? "" : ", non vérifié"}] ${f.content}`,
  );
  return `Conventions et particularités connues de ce client :\n${lines.join("\n")}`;
}
