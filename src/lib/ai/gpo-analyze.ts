// ============================================================================
// Analyse IA d'une GPO exportée — transforme un XML/backup brut en proposition
// structurée : title, description, procédure, variables détectées.
// ============================================================================

import { runAiTask } from "@/lib/ai/orchestrator";
import { POLICY_CONTENT_CLASSIFY } from "@/lib/ai/orchestrator/policies";

export interface GpoAnalysisResult {
  ok: boolean;
  nameSuggested?: string;
  scopeSuggested?: "COMPUTER" | "USER" | "MIXED";
  description?: string;
  procedure?: string;
  variables?: Array<{ key: string; label: string; hint: string; example: string }>;
  dependencies?: { scripts: string[]; scheduledTasks: string[]; otherGpos: string[] };
  error?: string;
  invocationId?: string;
}

/** Trunque un texte XML volumineux pour tenir dans la fenêtre de contexte. */
function truncateXml(raw: string, maxChars = 20000): string {
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars) + `\n\n[... tronqué — ${raw.length - maxChars} chars supplémentaires ...]`;
}

export async function analyzeGpoSource(opts: {
  rawContent: string;
  filename: string;
  organizationName?: string | null;
  userId?: string | null;
}): Promise<GpoAnalysisResult> {
  const content = truncateXml(opts.rawContent);
  const result = await runAiTask({
    policy: POLICY_CONTENT_CLASSIFY,
    messages: [
      {
        role: "system",
        content: `Tu analyses un fichier GPO exporté depuis un contrôleur de domaine Active Directory.
Tu dois en déduire :
  1. Un nom clair et concis (sans préfixe c_/u_/cu_, on l'ajoute après)
  2. Le scope : COMPUTER (configuration ordinateur) | USER (configuration utilisateur) | MIXED
  3. Une description courte en français de ce que fait la GPO
  4. Une procédure de déploiement en markdown (étapes claires)
  5. Les variables spécifiques au domaine/client à adapter (OU, groupes, domaines, chemins UNC)
  6. Les dépendances : scripts locaux cités, tâches planifiées, autres GPO référencées

Retourne UNIQUEMENT du JSON valide :
{
  "nameSuggested": "Nom clair, 30-60 chars",
  "scopeSuggested": "COMPUTER|USER|MIXED",
  "description": "1-2 phrases en français",
  "procedure": "Markdown avec étapes de déploiement",
  "variables": [{"key":"snake_case","label":"Libellé","hint":"aide","example":"valeur exemple"}],
  "dependencies": {"scripts":[],"scheduledTasks":[],"otherGpos":[]}
}`,
      },
      {
        role: "user",
        content: `Fichier : ${opts.filename}\nClient : ${opts.organizationName ?? "(non spécifié)"}\n\nContenu :\n${content}`,
      },
    ],
    taskKind: "extraction",
    context: { userId: opts.userId ?? undefined },
  });

  if (!result.ok || !result.content) {
    return { ok: false, error: result.error?.reason ?? "IA indisponible", invocationId: result.invocationId };
  }
  const raw = result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      nameSuggested: parsed.nameSuggested,
      scopeSuggested: parsed.scopeSuggested,
      description: parsed.description,
      procedure: parsed.procedure,
      variables: parsed.variables,
      dependencies: parsed.dependencies,
      invocationId: result.invocationId,
    };
  } catch {
    return { ok: false, error: "Réponse IA non parsable", invocationId: result.invocationId };
  }
}
