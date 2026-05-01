// ============================================================================
// Cache mémoire éphémère pour les snapshots de dashboards reçus depuis le
// navigateur agent (localStorage) au moment de générer un PDF avec graphiques.
//
// Vie d'une entrée :
//   1. POST /api/v1/reports/monthly/[id]/pdf-with-graphs reçoit le snapshot
//      depuis le client → on le pousse ici avec une clé UUID + TTL court (5 min)
//   2. La route lance Puppeteer avec l'URL /internal/reports/monthly/[id] et
//      passe `?snapshotKey=UUID`
//   3. La page de rendu interne lit le cache via la clé, exécute les queries
//      des widgets côté serveur, et rend les annexes dans le PDF
//   4. Une fois lu, le snapshot peut être consommé (suppression auto pour
//      éviter de garder en mémoire des données obsolètes)
//
// Pas de persistance DB : ces snapshots sont liés à un usage à la demande
// d'un agent connecté. Pour les rapports programmés serveur-side (futur),
// on bascule plutôt sur un modèle DB (option B documentée dans la roadmap).
// ============================================================================

import { randomUUID } from "node:crypto";

export interface DashboardSnapshot {
  /** ID du dashboard côté agent (ex: "monthly_billing", "custom_1234"). */
  id: string;
  /** Libellé affiché dans le PDF (titre de section). */
  label: string;
  /** Description optionnelle, affichée sous le titre si présente. */
  description?: string;
  /** Liste des widgets — schéma libre, on lit ce dont on a besoin au render. */
  widgets: Array<{
    id: string;
    title?: string;
    /** Type de chart (number, bar, line, table, etc.). */
    chartType: string;
    /** Largeur du widget dans le grid d'origine (1-12). On l'utilise pour
     *  reproduire un layout proche dans le PDF (1 ou 2 colonnes selon span). */
    span?: number;
    /** Définition de la query (dataset, dimensions, métriques, filtres). */
    query: Record<string, unknown>;
    /** Style visuel (couleurs, étiquettes, etc.). Optionnel. */
    style?: Record<string, unknown>;
  }>;
}

interface CacheEntry {
  snapshots: DashboardSnapshot[];
  organizationId: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000; // 5 min : suffisant pour Puppeteer (~30s) + marge

/** Stocke un lot de snapshots et retourne une clé UUID. */
export function putSnapshot(
  snapshots: DashboardSnapshot[],
  organizationId: string,
): string {
  pruneExpired();
  const key = randomUUID();
  cache.set(key, {
    snapshots,
    organizationId,
    expiresAt: Date.now() + TTL_MS,
  });
  return key;
}

/** Lit un lot de snapshots. Retourne null si introuvable ou expiré. */
export function getSnapshot(key: string): CacheEntry | null {
  pruneExpired();
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

/** Supprime explicitement une entrée — appelée après lecture pour libérer
 *  la mémoire (on n'aura plus besoin du snapshot après le rendu PDF). */
export function consumeSnapshot(key: string): void {
  cache.delete(key);
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt < now) cache.delete(k);
  }
}
