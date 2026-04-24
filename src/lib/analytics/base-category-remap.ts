// ============================================================================
// base-category-remap — utilitaire client-side qui remappe les labels d'un
// résultat de widget quand le groupBy est une catégorie de base (timeType).
//
// Le serveur retourne les valeurs enum brutes ("remote_work", "onsite_work",
// etc.). L'utilisateur peut avoir customisé ces catégories dans Paramètres
// → Facturation → Catégories de base (localStorage). On applique la
// chaîne de fallback de `labelForBaseCategory` pour afficher les bons
// libellés, avec gestion gracieuse des catégories supprimées :
//   - Un ajout → futurs résultats utilisent le nouveau libellé.
//   - Un renommage → id match direct ou fallback systemTimeType.
//   - Une suppression → fallback sur label par défaut, puis raw id si la
//     donnée ne peut plus être associée à une catégorie vivante.
// ============================================================================

import { labelForBaseCategory, loadBaseCategories } from "@/components/billing/client-billing-overrides-section";

/**
 * Indique si le groupBy d'un widget est une catégorie de base.
 * Actuellement uniquement `timeType` dans le dataset `time_entries`, mais
 * la fonction est extensible si on ajoute d'autres colonnes enum.
 */
export function isBaseCategoryGroup(groupBy: string | null | undefined): boolean {
  if (!groupBy) return false;
  return groupBy === "timeType";
}

/**
 * Applique le remap aux labels d'un tableau de résultats, SI le groupBy
 * est une catégorie de base. Sinon retourne les résultats inchangés.
 *
 * Si plusieurs résultats remappent vers le même label humain, on fusionne
 * leurs valeurs — évite deux lignes "À distance" quand un renommage a
 * eu lieu et qu'une ancienne catégorie pointe désormais vers la même
 * étiquette qu'une autre.
 */
export function remapBaseCategoryResults<T extends { label: string; value: number; source?: string }>(
  groupBy: string | null | undefined,
  results: T[],
): T[] {
  if (!isBaseCategoryGroup(groupBy) || !results || results.length === 0) {
    return results;
  }
  const cats = loadBaseCategories();
  const mapped = results.map((r) => ({ ...r, label: labelForBaseCategory(r.label, cats) }));

  // Fusion si deux lignes partagent le même nouveau label (ex : deux ids
  // historiques pointant vers la même catégorie après renommage).
  const merged = new Map<string, T>();
  for (const r of mapped) {
    const key = `${r.label}::${r.source ?? ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.value = Number(existing.value) + Number(r.value);
    } else {
      merged.set(key, { ...r });
    }
  }
  return Array.from(merged.values());
}
