// Balises (tags) libres pour classer les dashboards/rapports, en plus
// de l'attribution à une organisation. Stockées en localStorage, purement
// côté client pour l'instant.

export interface TagDef {
  id: string;
  name: string;
  /** Clé dans TAG_COLOR_STYLES ci-dessous. */
  color: string;
}

export const TAG_COLOR_STYLES: Record<string, { bg: string; fg: string; ring: string; dot: string }> = {
  blue:    { bg: "bg-blue-50",    fg: "text-blue-700",    ring: "ring-blue-200",    dot: "bg-blue-500" },
  emerald: { bg: "bg-emerald-50", fg: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  amber:   { bg: "bg-amber-50",   fg: "text-amber-700",   ring: "ring-amber-200",   dot: "bg-amber-500" },
  rose:    { bg: "bg-rose-50",    fg: "text-rose-700",    ring: "ring-rose-200",    dot: "bg-rose-500" },
  violet:  { bg: "bg-violet-50",  fg: "text-violet-700",  ring: "ring-violet-200",  dot: "bg-violet-500" },
  slate:   { bg: "bg-slate-100",  fg: "text-slate-700",   ring: "ring-slate-300",   dot: "bg-slate-500" },
  cyan:    { bg: "bg-cyan-50",    fg: "text-cyan-700",    ring: "ring-cyan-200",    dot: "bg-cyan-500" },
  indigo:  { bg: "bg-indigo-50",  fg: "text-indigo-700",  ring: "ring-indigo-200",  dot: "bg-indigo-500" },
  pink:    { bg: "bg-pink-50",    fg: "text-pink-700",    ring: "ring-pink-200",    dot: "bg-pink-500" },
  orange:  { bg: "bg-orange-50",  fg: "text-orange-700",  ring: "ring-orange-200",  dot: "bg-orange-500" },
};

export const TAG_COLOR_KEYS = Object.keys(TAG_COLOR_STYLES);
export const DEFAULT_TAG_COLOR = "blue";
export const TAG_DEFS_KEY = "nexus:reports:tag-definitions";

const DEFAULT_TAG_DEFS: TagDef[] = [
  { id: "builtin_finances",       name: "Finances",         color: "emerald" },
  { id: "builtin_rapport_mensuel",name: "Rapport mensuel",  color: "blue" },
  { id: "builtin_performance",    name: "Performance",      color: "amber" },
  { id: "builtin_contrats",       name: "Contrats",         color: "violet" },
];

export function loadTagDefinitions(): TagDef[] {
  if (typeof window === "undefined") return DEFAULT_TAG_DEFS;
  try {
    const raw = localStorage.getItem(TAG_DEFS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {}
  // Premier chargement : pré-remplit avec les balises usuelles.
  try { localStorage.setItem(TAG_DEFS_KEY, JSON.stringify(DEFAULT_TAG_DEFS)); } catch {}
  return DEFAULT_TAG_DEFS;
}

export function saveTagDefinitions(defs: TagDef[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(TAG_DEFS_KEY, JSON.stringify(defs)); } catch {}
}

export function tagStyle(color: string) {
  return TAG_COLOR_STYLES[color] ?? TAG_COLOR_STYLES[DEFAULT_TAG_COLOR];
}
