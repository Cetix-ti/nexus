// ============================================================================
// Parser JSON robuste pour les sorties LLM.
//
// gemma3:12b et d'autres modèles locaux émettent parfois du JSON légèrement
// non conforme malgré `responseFormat: json_object` :
//   - Wrapping ```json ... ```
//   - Texte narratif autour ("Voici le JSON : {...}")
//   - Trailing commas
//   - Single-quotes au lieu de double-quotes
//   - Clés non quotées
//
// tryParseJson applique une cascade de stratégies :
//   1. Parse direct
//   2. Strip markdown fences + parse
//   3. Extract first {...} balanced + parse
//   4. Fix trailing commas + parse
//   5. Fix single-quote strings + parse
// Retourne null si aucune stratégie ne fonctionne.
// ============================================================================

export function tryParseJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;

  // 1. Direct
  const direct = safeParse<T>(raw.trim());
  if (direct !== null) return direct;

  // 2. Strip markdown fences (```json ... ```)
  const stripped = raw
    .trim()
    .replace(/^```(?:json|javascript)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (stripped !== raw.trim()) {
    const parsed = safeParse<T>(stripped);
    if (parsed !== null) return parsed;
  }

  // 3. Extract first balanced {...} or [...]
  const extracted = extractJsonBlock(raw);
  if (extracted) {
    const parsed = safeParse<T>(extracted);
    if (parsed !== null) return parsed;
    // 4. Fix trailing commas dans le bloc extrait
    const fixed1 = fixTrailingCommas(extracted);
    const parsed1 = safeParse<T>(fixed1);
    if (parsed1 !== null) return parsed1;
    // 5. Fix single-quotes
    const fixed2 = fixSingleQuotes(fixed1);
    const parsed2 = safeParse<T>(fixed2);
    if (parsed2 !== null) return parsed2;
  }

  return null;
}

function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Extrait le premier bloc JSON équilibré {...} ou [...] de la chaîne.
 * Respecte les strings (ignore les accolades à l'intérieur de "...").
 */
function extractJsonBlock(s: string): string | null {
  const openChar = findFirstOpener(s);
  if (openChar === null) return null;
  const openIdx = s.indexOf(openChar.char);
  const closeChar = openChar.char === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === openChar.char) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return s.slice(openIdx, i + 1);
    }
  }
  return null;
}

function findFirstOpener(s: string): { char: "{" | "[" } | null {
  for (const c of s) {
    if (c === "{") return { char: "{" };
    if (c === "[") return { char: "[" };
  }
  return null;
}

function fixTrailingCommas(s: string): string {
  // Retire les virgules avant } ou ] (pas dans les strings). Naïf mais
  // suffisant pour les artefacts LLM typiques.
  return s.replace(/,(\s*[}\]])/g, "$1");
}

function fixSingleQuotes(s: string): string {
  // Convertit les strings entourées de guillemets simples ('...') en
  // double-quotes. Évite le contenu des doubles existantes.
  // Approche : split sur " (inchanger ce qui est déjà entre doubles),
  // remplacer ' → " dans le reste.
  let out = "";
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== "\\") inDouble = !inDouble;
    if (!inDouble && c === "'") {
      out += '"';
    } else {
      out += c;
    }
  }
  return out;
}
