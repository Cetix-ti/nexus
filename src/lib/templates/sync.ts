// ============================================================================
// Template/instance sync helpers — cœur de la logique modèle global ↔
// variante client. Exposé aux modules (Particularity, Policy, Software, …).
//
// Règles :
//   - IN_SYNC   : templateVersion === template.version
//   - DRIFTED   : templateVersion  <  template.version (template a évolué)
//   - DETACHED  : l'utilisateur a rompu le lien ; plus jamais recalé en auto
//
// Quand un template passe à la version N+1, toutes les instances IN_SYNC
// basculent en DRIFTED (via computeSyncState appelé au read ou via job).
// ============================================================================

import type { ContentSyncState } from "@prisma/client";

export interface TemplateLike {
  version: number;
}

export interface InstanceLike {
  templateId: string | null;
  templateVersion: number | null;
  syncState: ContentSyncState;
}

/**
 * Calcule le syncState courant d'une instance vis-à-vis de son template.
 * Ne mute rien — renvoie la valeur attendue. Utiliser dans les routes
 * détail pour afficher un badge à jour, ou dans un cron pour bulk-update.
 */
export function computeSyncState(
  instance: InstanceLike,
  template: TemplateLike | null,
): ContentSyncState {
  if (!instance.templateId || !template) return "DETACHED";
  if (instance.syncState === "DETACHED") return "DETACHED";
  if (instance.templateVersion == null) return "DRIFTED";
  if (instance.templateVersion === template.version) return "IN_SYNC";
  return "DRIFTED";
}

/**
 * Résout les variables {{key}} dans un texte donné.
 * Variables sans valeur → laissées telles quelles (ex: "{{OUList}}") pour
 * que l'UI puisse les surligner en rouge.
 */
export function resolveVariables(
  text: string,
  resolved: Record<string, string | number | boolean | null> | null | undefined,
): string {
  if (!resolved) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
    const v = resolved[key];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Variables non résolues dans un texte — utilisé pour warning avant save. */
export function unresolvedVariables(
  text: string,
  resolved: Record<string, unknown> | null | undefined,
): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    const k = m[1];
    const has = resolved && Object.prototype.hasOwnProperty.call(resolved, k) && resolved[k] != null;
    if (!has) keys.add(k);
  }
  return Array.from(keys);
}
