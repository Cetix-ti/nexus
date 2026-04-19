// ============================================================================
// AI TONE REWRITE — #6 du spec.
//
// Reformule un texte selon une tonalité cible. L'agent écrit son message,
// clique sur un ton, reçoit une version reformulée. Il peut la garder,
// l'éditer ou revenir à son original.
//
// Tons supportés :
//   - "brief"      : 1-2 phrases, direct, factuel
//   - "detailed"   : explicatif complet, structure claire
//   - "vulgarized" : langage non technique, pour utilisateur final
//   - "executive"  : synthétique, orienté décideur / gestionnaire
//
// Règles strictes du prompt : ne PAS inventer de faits non présents, ne
// PAS supprimer d'information concrète (noms, chiffres, références).
// La reformulation est STYLISTIQUE uniquement.
// ============================================================================

import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_TONE_REWRITE } from "@/lib/ai/orchestrator/policies";

export type Tone = "brief" | "detailed" | "vulgarized" | "executive";

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  brief: `Reformule de façon BRÈVE : 1 à 3 phrases maximum, ton direct et factuel. Élimine les politesses redondantes mais garde une salutation courte si c'est un message client. Priorité à l'information essentielle.`,
  detailed: `Reformule de façon DÉTAILLÉE : structure claire (intro - corps - conclusion), paragraphes courts, explications complètes. Ajoute contexte et nuance. Reste professionnel, pas verbeux.`,
  vulgarized: `Reformule de façon VULGARISÉE pour un utilisateur final non technique : pas de jargon, pas d'acronymes sans explication. Si une notion technique est essentielle, explique-la en 1 phrase simple. Ton rassurant, humain, bienveillant.`,
  executive: `Reformule pour un DÉCIDEUR (gestionnaire, direction) : ton synthétique, orienté impact business. Mets en avant ce que ça signifie pour l'organisation. Pas de détail technique sauf si critique à la décision.`,
};

const TONE_LABEL: Record<Tone, string> = {
  brief: "Bref",
  detailed: "Détaillé",
  vulgarized: "Vulgarisé",
  executive: "Exécutif",
};

export interface RewriteResult {
  tone: Tone;
  toneLabel: string;
  rewritten: string;
  /** ID d'invocation pour que l'UI câble le FeedbackButtons. */
  invocationId?: string;
}

export async function rewriteWithTone(args: {
  text: string;
  tone: Tone;
}): Promise<RewriteResult | null> {
  try {
    const text = args.text.trim();
    if (!text || text.length < 5) return null;

    const instruction = TONE_INSTRUCTIONS[args.tone];
    if (!instruction) return null;

    const system = `Tu reformules des messages opérationnels MSP selon une tonalité cible, en français. Règles STRICTES :
- PRÉSERVE tous les faits, noms, chiffres, références, identifiants du texte source.
- Ne AJOUTE PAS d'information qui n'est pas dans le texte source.
- Ne SUPPRIME PAS d'information factuelle.
- Modifie uniquement le STYLE et la STRUCTURE selon la tonalité demandée.
- Conserve la langue du texte source (normalement français).
- Retourne UNIQUEMENT le texte reformulé, sans préambule, sans commentaires, sans guillemets.

${instruction}`;

    const user = `Texte à reformuler :
---
${text}
---

Tonalité cible : ${TONE_LABEL[args.tone]}`;

    const result = await runAiTask({
      policy: POLICY_TONE_REWRITE,
      taskKind: "generation",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    if (!result.ok || !result.content) return null;

    // Nettoyage : certains modèles ajoutent une ligne "Voici la version..."
    // ou encadrent avec des backticks malgré les instructions.
    let rewritten = result.content.trim();
    rewritten = rewritten.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
    rewritten = rewritten.replace(
      /^(voici|voilà|ci-dessous|la version reformulée)[^\n]*\n+/i,
      "",
    );
    rewritten = rewritten.trim();

    if (!rewritten) return null;

    return {
      tone: args.tone,
      toneLabel: TONE_LABEL[args.tone],
      rewritten,
      invocationId: result.invocationId,
    };
  } catch (err) {
    console.warn(
      "[ai-tone-rewrite] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
