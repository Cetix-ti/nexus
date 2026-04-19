// ============================================================================
// AI KB REWRITE — reformule un article KB pour le rendre plus professionnel
// / concis / structuré selon un "focus" choisi par l'admin.
//
// Règle d'or : on NE CHANGE PAS le fond technique (commandes, étapes,
// versions). On améliore la forme : structure, titres de section, listes,
// ton, cohérence, fautes.
//
// L'admin voit la version reformulée AVANT de l'appliquer (diff côté UI).
// Aucune mutation DB dans cette feature — l'application est faite en
// client après validation.
// ============================================================================

import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_KB_REWRITE } from "@/lib/ai/orchestrator/policies";

export type RewriteFocus =
  | "professional" // ton pro, clair, corrige les fautes
  | "concise" // garde l'essentiel, trim le superflu
  | "structured" // ajoute titres, listes, étapes numérotées
  | "beginner"; // vulgarise le vocabulaire technique, ajoute explications

export interface RewriteInput {
  title: string;
  summary?: string;
  /** HTML du body (TipTap). Peut contenir des balises structurées. */
  body: string;
  focus: RewriteFocus;
}

export interface RewriteResult {
  newTitle: string;
  newSummary: string;
  newBody: string;
  changes: string[]; // liste courte "ce qui a changé"
}

const FOCUS_INSTRUCTIONS: Record<RewriteFocus, string> = {
  professional: `Ton professionnel et clair. Corrige les fautes d'orthographe/grammaire. Harmonise le ton (pas de "on" + "nous" mélangés). Retire le langage familier. Garde la longueur.`,
  concise: `Trim tout ce qui est redondant. Condense les phrases longues. Retire les transitions inutiles. Conserve chaque information technique. Objectif : -30% à -40% de longueur.`,
  structured: `Restructure avec des titres de section (H2/H3), des listes à puces pour les étapes, des blocs <code> pour les commandes. Numérote les procédures. Ajoute un paragraphe d'introduction si absent.`,
  beginner: `Vulgarise le vocabulaire technique. Ajoute des définitions en parenthèses pour les acronymes. Remplace le jargon par des termes accessibles. Ajoute des mini-explications "pourquoi on fait ça" sur les étapes non évidentes.`,
};

export async function rewriteArticle(
  input: RewriteInput,
): Promise<RewriteResult | null> {
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title || !body) return null;

  const focusInstruction = FOCUS_INSTRUCTIONS[input.focus];
  const summary = (input.summary ?? "").trim();

  const system = `Tu es un éditeur technique pour la base de connaissances d'un MSP. Tu réécris des articles KB en gardant 100% du CONTENU TECHNIQUE (commandes, noms de produits, versions, étapes, valeurs numériques) et en améliorant uniquement la FORME.

Focus demandé : ${input.focus}
Instruction : ${focusInstruction}

Règles strictes :
- NE JAMAIS inventer, supprimer ou modifier une information technique.
- Conserve toutes les commandes (PowerShell, bash, CMD, SQL...) EXACTEMENT — y compris les caractères spéciaux et les majuscules.
- Conserve les noms propres, versions de logiciels, chemins de fichiers, URLs.
- Le body reste en HTML valide (balises <p>, <h2>, <h3>, <ul>, <li>, <ol>, <code>, <pre>, <strong>, <em>, <a href>). Pas de <script>, pas de styles inline.
- Le titre et le résumé peuvent être reformulés mais doivent rester fidèles.
- La liste "changes" décrit en 3-6 bullet points ce que tu as changé (ex: "Ajout d'une section Prérequis", "Correction de 3 fautes d'orthographe").

Réponds EXCLUSIVEMENT en JSON strict :
{
  "newTitle": "...",
  "newSummary": "...",
  "newBody": "<p>...</p>",
  "changes": ["...", "..."]
}`;

  const user = `# Article actuel

## Titre
${title}

## Résumé
${summary || "(aucun)"}

## Corps (HTML)
${body}`;

  const result = await runAiTask({
    policy: POLICY_KB_REWRITE,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: "generation",
  });

  if (!result.ok || !result.content) return null;

  try {
    const cleaned = result.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const newTitle =
      typeof parsed.newTitle === "string" && parsed.newTitle.trim()
        ? parsed.newTitle.trim()
        : title;
    const newSummary =
      typeof parsed.newSummary === "string" ? parsed.newSummary.trim() : "";
    const newBody =
      typeof parsed.newBody === "string" && parsed.newBody.trim()
        ? parsed.newBody
        : null;
    if (!newBody) return null;

    const changes = Array.isArray(parsed.changes)
      ? (parsed.changes as unknown[])
          .filter((c): c is string => typeof c === "string")
          .slice(0, 10)
      : [];

    return { newTitle, newSummary, newBody, changes };
  } catch {
    return null;
  }
}
