// Métadonnées attachées à un widget (built-in OU personnalisé) au niveau
// du catalogue : attribution à des organisations + balises. Indépendant
// de la définition du widget (qui peut vivre dans `WIDGETS` en dur ou
// dans `nexus:custom-widgets-v2` pour les widgets query-builder).
//
// Stockage simple en localStorage : on s'appuie sur la clé
// `nexus:widget-meta` qui mappe widgetId → métadonnées. Les built-ins
// ne sont pas modifiés (leur définition reste dans le code), mais on
// peut leur attacher une attribution ou des balises sans toucher au
// catalogue.

export interface WidgetMeta {
  organizationIds?: string[];
  tags?: string[];
}

export type WidgetMetaStore = Record<string, WidgetMeta>;

export const WIDGET_META_KEY = "nexus:widget-meta";

export function loadWidgetMeta(): WidgetMetaStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(WIDGET_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as WidgetMetaStore : {};
  } catch { return {}; }
}

export function saveWidgetMeta(store: WidgetMetaStore): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(WIDGET_META_KEY, JSON.stringify(store)); } catch {}
}

export function getWidgetMeta(store: WidgetMetaStore, widgetId: string): WidgetMeta {
  return store[widgetId] ?? {};
}

export function updateWidgetMeta(
  store: WidgetMetaStore,
  widgetId: string,
  patch: WidgetMeta,
): WidgetMetaStore {
  const current = store[widgetId] ?? {};
  const merged: WidgetMeta = {
    organizationIds: patch.organizationIds ?? current.organizationIds,
    tags: patch.tags ?? current.tags,
  };
  // Nettoie les valeurs vides pour éviter l'empreinte inutile.
  const clean: WidgetMeta = {};
  if (merged.organizationIds && merged.organizationIds.length > 0) clean.organizationIds = merged.organizationIds;
  if (merged.tags && merged.tags.length > 0) clean.tags = merged.tags;
  const next = { ...store };
  if (Object.keys(clean).length === 0) delete next[widgetId];
  else next[widgetId] = clean;
  return next;
}
