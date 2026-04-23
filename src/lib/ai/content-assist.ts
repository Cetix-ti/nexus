// ============================================================================
// Content assist — capabilities IA partagées par les modules documentaires
// (Particularités d'abord, puis Politiques, Logiciels, Changements).
//
// Un seul point d'entrée `runContentAssist` : passe par l'orchestrateur
// existant (runAiTask) avec les policies POLICY_CONTENT_ASSIST /
// POLICY_CONTENT_CLASSIFY. Chaque capability est un prompt distinct. Les
// modules appellent ce helper — jamais directement runAiTask.
// ============================================================================

import { runAiTask } from "@/lib/ai/orchestrator";
import {
  POLICY_CONTENT_ASSIST,
  POLICY_CONTENT_CLASSIFY,
} from "@/lib/ai/orchestrator/policies";

export type ContentCapability =
  | "correct"           // corrige fautes/style, conserve le sens
  | "rewrite"           // reformule de façon professionnelle
  | "restructure"       // remet en sections/listes claires
  | "summarize"         // 3 lignes
  | "suggest_category"  // retourne { categoryName, confidence }
  | "suggest_tags"      // retourne { tags: string[] }
  | "detect_missing"    // liste points manquants
  | "extract_variables" // détecte candidats {{var}}
  | "explain"           // explique en langage simple (portail client)
  ;

interface AssistInput {
  capability: ContentCapability;
  title: string;
  body: string; // markdown / HTML — l'IA le traite comme texte
  summary?: string;
  tags?: string[];
  categoryHints?: string[]; // liste de catégories existantes
  organizationName?: string | null;
  userId?: string | null;
  organizationId?: string | null;
}

export interface AssistResult {
  ok: boolean;
  capability: ContentCapability;
  /** Texte brut retourné (pour correct/rewrite/restructure/summarize/explain). */
  text?: string;
  /** JSON structuré (pour suggest_category/tags, detect_missing, extract_variables). */
  data?: unknown;
  invocationId?: string;
  error?: string;
}

function prompts(capability: ContentCapability, input: AssistInput): { system: string; user: string } {
  const body = input.body || "";
  const title = input.title || "";

  switch (capability) {
    case "correct":
      return {
        system:
          "Tu corriges les fautes et maladresses d'un texte documentaire, en conservant strictement son sens, son ton et sa structure. Réponds uniquement par le texte corrigé, sans commentaire.",
        user: `Titre: ${title}\n\nTexte:\n${body}`,
      };
    case "rewrite":
      return {
        system:
          "Tu reformules un texte documentaire de façon claire, professionnelle et concise. Conserve toutes les informations, supprime les redondances, améliore la lisibilité. Réponds uniquement par le texte reformulé en markdown.",
        user: `Titre: ${title}\n\nTexte:\n${body}`,
      };
    case "restructure":
      return {
        system:
          "Tu restructures un texte documentaire en sections claires (titres, listes, paragraphes). Tu ne supprimes aucune information. Retourne du markdown propre.",
        user: `Titre: ${title}\n\nTexte:\n${body}`,
      };
    case "summarize":
      return {
        system:
          "Tu résumes un texte en 3 lignes maximum, en français, factuel, sans titre ni préambule.",
        user: `Titre: ${title}\n\nTexte:\n${body}`,
      };
    case "explain":
      return {
        system:
          "Tu expliques un texte technique en langage simple pour un utilisateur non-technicien. Évite le jargon, donne des exemples concrets. Réponds en 4-6 lignes maximum.",
        user: `Titre: ${title}\n\nTexte:\n${body}`,
      };
    case "suggest_category": {
      const hints = (input.categoryHints ?? []).join(", ") || "(aucune fournie)";
      return {
        system:
          "Tu suggères la catégorie la plus appropriée pour un contenu documentaire. Retourne uniquement du JSON { categoryName, confidence, reasoning } où categoryName est EXACTEMENT l'une des catégories fournies, confidence ∈ {high,medium,low}.",
        user: `Catégories disponibles: ${hints}\n\nTitre: ${title}\nRésumé: ${input.summary || ""}\nTexte: ${body.slice(0, 2000)}`,
      };
    }
    case "suggest_tags":
      return {
        system:
          "Tu suggères 3 à 6 tags courts (1-2 mots, minuscules, sans accents) pertinents pour un contenu documentaire. Retourne UNIQUEMENT du JSON { tags: string[] }.",
        user: `Titre: ${title}\nTexte: ${body.slice(0, 2000)}`,
      };
    case "detect_missing":
      return {
        system:
          "Tu identifies les informations qui manquent dans une fiche documentaire pour qu'elle soit vraiment utile à un technicien de support. Retourne UNIQUEMENT du JSON { missing: [{ field: string, reason: string }] }. Maximum 5 points. Si tout est bien, retourne un tableau vide.",
        user: `Titre: ${title}\nRésumé: ${input.summary || "(aucun)"}\nTags: ${(input.tags ?? []).join(", ")}\n\nTexte:\n${body}`,
      };
    case "extract_variables":
      return {
        system:
          "Tu détectes dans un texte documentaire les valeurs qui seraient susceptibles de varier d'un client à l'autre (nom de domaine, OU AD, email de contact, nom de serveur, chemin spécifique, etc.). Retourne UNIQUEMENT du JSON { variables: [{ key: string, label: string, hint: string, example: string }] }. Les `key` sont en snake_case anglais. Maximum 10.",
        user: `Titre: ${title}\n\nTexte:\n${body}`,
      };
  }
}

const JSON_CAPABILITIES: ContentCapability[] = [
  "suggest_category",
  "suggest_tags",
  "detect_missing",
  "extract_variables",
];

function taskKindFor(capability: ContentCapability): "classification" | "generation" | "summarization" | "extraction" {
  if (capability === "suggest_category" || capability === "suggest_tags") return "classification";
  if (capability === "summarize") return "summarization";
  if (capability === "detect_missing" || capability === "extract_variables") return "extraction";
  return "generation";
}

export async function runContentAssist(input: AssistInput): Promise<AssistResult> {
  const { system, user } = prompts(input.capability, input);
  const isJson = JSON_CAPABILITIES.includes(input.capability);
  const policy = isJson ? POLICY_CONTENT_CLASSIFY : POLICY_CONTENT_ASSIST;

  const result = await runAiTask({
    policy,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    taskKind: taskKindFor(input.capability),
    context: {
      userId: input.userId ?? undefined,
      organizationId: input.organizationId ?? undefined,
    },
  });

  if (!result.ok || !result.content) {
    return {
      ok: false,
      capability: input.capability,
      invocationId: result.invocationId,
      error: result.error?.reason ?? "IA indisponible",
    };
  }

  const raw = result.content.trim();

  if (!isJson) {
    // Strip accidental fences
    const text = raw.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return { ok: true, capability: input.capability, text, invocationId: result.invocationId };
  }

  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const data = JSON.parse(cleaned);
    return { ok: true, capability: input.capability, data, invocationId: result.invocationId };
  } catch {
    return {
      ok: false,
      capability: input.capability,
      invocationId: result.invocationId,
      error: "Réponse IA non parsable",
    };
  }
}
