// ============================================================================
// AI SCRIPT EXTRACT VARS — reverse-engineering d'un script client → template
// générique avec placeholders {{variable}}.
//
// Usage : un agent a un script qui marche pour un client X (avec hostnames,
// paths, IDs codés en dur). Au lieu de réécrire un script générique de zéro,
// il colle ce script + sélectionne le client → l'IA repère les valeurs
// "spécifiques au client" et les transforme en variables, retournant :
//
//   - genericCode : script avec {{variable}} à la place des valeurs concrètes
//   - variables   : liste des variables détectées avec name, description,
//                   type heuristique (path, hostname, id, port, secret, ...)
//   - resolvedVariables : map des valeurs trouvées dans le script source
//                        (= ce qu'il faut sauvegarder côté ScriptInstance
//                        pour que le client X retombe sur sa version)
//
// Le résultat doit être présenté à l'agent pour validation AVANT de créer
// quoi que ce soit en DB (humanApprovalRequired=true dans la policy).
// ============================================================================

import { runAiTask, tryParseJson } from "@/lib/ai/orchestrator";
import { POLICY_SCRIPT_EXTRACT_VARS } from "@/lib/ai/orchestrator/policies";

export type ScriptLanguage = "powershell" | "bash" | "python" | "batch" | "javascript" | "other";

export interface ExtractedVariable {
  /** Nom de la variable, snake_case ou camelCase, sans `{{}}`. */
  name: string;
  /** Description courte (une ligne) — ce que cette variable représente. */
  description: string;
  /** Type heuristique pour aider à la documentation/UI. */
  type: "path" | "hostname" | "ip" | "port" | "user" | "domain" | "id" | "secret" | "url" | "string" | "number";
  /** Valeur trouvée dans le script source (= valeur du client d'origine). */
  resolvedValue: string;
}

export interface ScriptExtractResult {
  genericCode: string;
  variables: ExtractedVariable[];
  /** Notes / warnings éventuels (ex: "valeurs sensibles à anonymiser : token X"). */
  notes: string;
  invocationId?: string;
}

const SYSTEM_PROMPT = `Tu es un expert en automatisation de scripts d'administration système (PowerShell, Bash, Python, Batch). Ta tâche : transformer un script ADAPTÉ À UN CLIENT spécifique en un TEMPLATE GÉNÉRIQUE réutilisable.

RÈGLES STRICTES :

1. Identifie tout ce qui est SPÉCIFIQUE au client et qui devrait être paramétrable :
   - Hostnames (DC01, srv-mail, ws-vdsa-01)
   - Adresses IP, ports
   - Chemins de fichiers spécifiques au client (D:\\Clients\\HVAC\\..., /opt/cetix/HVAC/...)
   - Domaines AD (hvac.local, vdsa.cetix.local)
   - Noms d'utilisateurs / comptes de service
   - IDs (GUID, SID, ObjectID)
   - URLs internes spécifiques
   - Noms de bases de données, partages, OUs

2. NE TRANSFORME PAS en variables :
   - Mots-clés du langage (Get-ADUser, foreach, if, etc.)
   - Constantes universelles (System.IO, "C:\\Windows\\System32", localhost, 127.0.0.1)
   - Chemins standards Windows / Linux qui sont identiques chez tous les clients
   - Valeurs littérales structurelles (true, false, 0, 1, "OK", "ERROR")
   - Noms de commandes ou de fonctions

3. Pour chaque variable identifiée :
   - Donne un nom clair en snake_case (ex: domain_controller_hostname, backup_root_path)
   - Description courte (1 ligne)
   - Type parmi : "path", "hostname", "ip", "port", "user", "domain", "id", "secret", "url", "string", "number"
   - Garde la valeur trouvée comme \`resolvedValue\`

4. Génère le \`genericCode\` en remplaçant chaque occurrence de chaque valeur par son placeholder \`{{variable_name}}\`. PRÉSERVE EXACTEMENT le reste du code (indentation, commentaires, structure). Le seul changement = les substitutions.

5. Si tu détectes des SECRETS (tokens, mots de passe, clés API), liste-les en variables de type "secret" ET ajoute un avertissement dans \`notes\` indiquant qu'il faut les déplacer dans un coffre/secret manager au lieu de les passer en variable claire.

6. Retourne UNIQUEMENT un JSON valide, format :
\`\`\`json
{
  "genericCode": "...",
  "variables": [
    { "name": "...", "description": "...", "type": "...", "resolvedValue": "..." }
  ],
  "notes": "..."
}
\`\`\``;

export async function extractScriptVariables(args: {
  clientCode: string;
  language: ScriptLanguage;
  /** Nom de l'org (utile pour orienter l'IA — ex: "HVAC Inc."). Optionnel. */
  organizationName?: string;
}): Promise<ScriptExtractResult | null> {
  try {
    const code = args.clientCode.trim();
    if (!code || code.length < 20) return null;

    const userPrompt = `Langage : ${args.language}
${args.organizationName ? `Client d'origine : ${args.organizationName}` : ""}

Script à analyser :
\`\`\`${args.language}
${code}
\`\`\`

Identifie toutes les valeurs spécifiques au client et produis le JSON de réponse.`;

    const result = await runAiTask({
      policy: POLICY_SCRIPT_EXTRACT_VARS,
      taskKind: "generation",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    if (!result.ok || !result.content) return null;

    // Le modèle peut entourer le JSON de ```json ... ``` ou de texte. tryParseJson
    // tente de récupérer le premier objet JSON valide.
    const parsed = tryParseJson<{
      genericCode?: unknown;
      variables?: unknown;
      notes?: unknown;
    }>(result.content);
    if (!parsed) return null;

    const genericCode = typeof parsed.genericCode === "string" ? parsed.genericCode : "";
    const notes = typeof parsed.notes === "string" ? parsed.notes : "";
    const rawVars = Array.isArray(parsed.variables) ? parsed.variables : [];

    const variables: ExtractedVariable[] = [];
    for (const v of rawVars) {
      if (!v || typeof v !== "object") continue;
      const obj = v as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      const description = typeof obj.description === "string" ? obj.description : "";
      const type = (typeof obj.type === "string" ? obj.type : "string") as ExtractedVariable["type"];
      const resolvedValue = typeof obj.resolvedValue === "string" ? obj.resolvedValue : "";
      if (!name) continue;
      variables.push({ name, description, type, resolvedValue });
    }

    if (!genericCode) return null;

    return {
      genericCode,
      variables,
      notes,
      invocationId: result.invocationId,
    };
  } catch (err) {
    console.warn(
      "[ai-script-extract-vars] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
