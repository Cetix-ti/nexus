// ============================================================================
// Response cache — gain d'efficacité énorme quand plusieurs appels posent la
// même question au même modèle peu après l'autre.
//
// Cas typiques :
//   - Double-clic utilisateur sur un bouton IA
//   - Re-ouverture d'un ticket qui relance triage/response-assist
//   - Re-run identique après une erreur réseau
//
// Structure : Map<key, { response, at }> + nettoyage paresseux.
//   - Key = sha256(feature + model + promptHash) pour que des policies
//     différentes n'écrasent jamais leurs résultats.
//   - Les réponses ne sont cachées QUE si la feature le permet (temperature
//     basse = sortie ± déterministe → cache OK). Les features à haute
//     créativité/variabilité s'abstiennent.
//   - TTL configurable par policy via `cacheTtlSeconds`. 0/undefined = pas
//     de cache.
// ============================================================================

import crypto from "node:crypto";

interface CacheEntry {
  content: string;
  modelName: string;
  promptTokens?: number;
  responseTokens?: number;
  costCents: number;
  at: number;
  ttlMs: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 500;

function makeKey(feature: string, model: string, promptHash: string): string {
  const h = crypto.createHash("sha256");
  h.update(feature);
  h.update("|");
  h.update(model);
  h.update("|");
  h.update(promptHash);
  return h.digest("hex");
}

export function getCached(
  feature: string,
  model: string,
  promptHash: string,
): CacheEntry | null {
  const key = makeKey(feature, model, promptHash);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > entry.ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCached(
  feature: string,
  model: string,
  promptHash: string,
  entry: Omit<CacheEntry, "at">,
): void {
  // LRU simplifié : purge le 1/10e le plus ancien si on atteint MAX_ENTRIES.
  if (cache.size >= MAX_ENTRIES) {
    const toEvict = Math.floor(MAX_ENTRIES / 10);
    let i = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++i >= toEvict) break;
    }
  }
  const key = makeKey(feature, model, promptHash);
  cache.set(key, { ...entry, at: Date.now() });
}

export function invalidateFeature(feature: string): number {
  // Utile quand une config change (ex: nouvelles catégories → invalidate
  // cache des category_suggest). La clé est hashée, on scan tout pour
  // préserver la simplicité — OK vu que MAX_ENTRIES = 500.
  let removed = 0;
  for (const [k, v] of cache) {
    if (v.modelName.includes(feature)) continue; // pas de collision réelle, belt-and-suspenders
    // Le feature n'est PAS dans la clé en clair (elle est hashée). Cette
    // fonction ne peut pas filtrer exactement sans garder l'info en clair.
    // Pour v1 on purge tout — simple et safe.
    cache.delete(k);
    removed++;
  }
  return removed;
}

export function cacheStats() {
  return {
    entries: cache.size,
    maxEntries: MAX_ENTRIES,
  };
}
