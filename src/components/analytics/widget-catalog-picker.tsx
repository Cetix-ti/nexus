"use client";

// Liste unifiée de widgets (built-in + personnalisés) avec recherche et
// actions par rang : sélection/ajout, attribution organisation, balises.
// Utilisé dans la modale "Nouveau dashboard" ET dans le drawer
// "Ajouter des widgets" pour un dashboard existant.

import { useMemo } from "react";
import { Search, Building2, Tag as TagIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagStyle, type TagDef } from "@/lib/analytics/dashboard-tags";

export interface UnifiedWidget {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  kind: "builtin" | "custom";
  /** Couleur d'accent pour les widgets custom (affichée sur l'icône). */
  color?: string;
}

interface Props {
  widgets: UnifiedWidget[];
  search: string;
  onSearchChange: (s: string) => void;
  /**
   * Rend l'action principale sur la droite (checkbox, bouton Add, etc.).
   * Laisse la liberté au caller d'implémenter mode single vs multi.
   */
  renderAction: (w: UnifiedWidget) => React.ReactNode;
  /** Menu secondaire : ouvre la modale d'attribution org pour ce widget. */
  onAttribute?: (w: UnifiedWidget) => void;
  /** Menu secondaire : ouvre la modale d'attribution balises pour ce widget. */
  onTag?: (w: UnifiedWidget) => void;
  /** Métadonnées pour afficher les badges (orgs/tags). */
  orgIdsByWidgetId?: Record<string, string[]>;
  tagIdsByWidgetId?: Record<string, string[]>;
  orgNameById?: Record<string, string>;
  tagDefById?: Record<string, TagDef>;
  /** Message si la recherche ne retourne rien. */
  emptyMessage?: string;
}

export function WidgetCatalogPicker({
  widgets, search, onSearchChange, renderAction, onAttribute, onTag,
  orgIdsByWidgetId = {}, tagIdsByWidgetId = {},
  orgNameById = {}, tagDefById = {},
  emptyMessage = "Aucun widget ne correspond à la recherche.",
}: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return widgets;
    return widgets.filter((w) =>
      w.label.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q)
    );
  }, [widgets, search]);

  const builtins = filtered.filter((w) => w.kind === "builtin");
  const customs = filtered.filter((w) => w.kind === "custom");

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Rechercher parmi ${widgets.length} widget${widgets.length > 1 ? "s" : ""}…`}
          className="w-full rounded-md border border-slate-300 pl-7 pr-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-6 text-[12px] text-slate-400">{emptyMessage}</div>
      ) : (
        <div className="space-y-4">
          {builtins.length > 0 && (
            <Section title={`Widgets prédéfinis (${builtins.length})`}>
              {builtins.map((w) => (
                <WidgetRow
                  key={w.id}
                  w={w}
                  renderAction={renderAction}
                  onAttribute={onAttribute}
                  onTag={onTag}
                  orgIds={orgIdsByWidgetId[w.id] ?? []}
                  tagIds={tagIdsByWidgetId[w.id] ?? []}
                  orgNameById={orgNameById}
                  tagDefById={tagDefById}
                />
              ))}
            </Section>
          )}
          {customs.length > 0 && (
            <Section title={`Mes widgets (${customs.length})`}>
              {customs.map((w) => (
                <WidgetRow
                  key={w.id}
                  w={w}
                  renderAction={renderAction}
                  onAttribute={onAttribute}
                  onTag={onTag}
                  orgIds={orgIdsByWidgetId[w.id] ?? []}
                  tagIds={tagIdsByWidgetId[w.id] ?? []}
                  orgNameById={orgNameById}
                  tagDefById={tagDefById}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-1 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function WidgetRow({
  w, renderAction, onAttribute, onTag,
  orgIds, tagIds, orgNameById, tagDefById,
}: {
  w: UnifiedWidget;
  renderAction: (w: UnifiedWidget) => React.ReactNode;
  onAttribute?: (w: UnifiedWidget) => void;
  onTag?: (w: UnifiedWidget) => void;
  orgIds: string[];
  tagIds: string[];
  orgNameById: Record<string, string>;
  tagDefById: Record<string, TagDef>;
}) {
  const tagDefs = tagIds.map((id) => tagDefById[id]).filter(Boolean) as TagDef[];
  return (
    <div className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 ring-1 ring-inset ring-slate-200/60 bg-white hover:ring-blue-200 hover:bg-blue-50/20 transition-all">
      <div
        className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
          w.kind === "builtin" ? "bg-slate-100 text-slate-500" : "",
        )}
        style={w.kind === "custom" && w.color ? { backgroundColor: `${w.color}20`, color: w.color } : undefined}
      >
        {w.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[12.5px] font-medium text-slate-900">{w.label}</p>
          {orgIds.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 ring-1 ring-inset ring-blue-200 px-1.5 py-0 text-[9.5px] font-medium text-blue-700"
              title={`Attribué à : ${orgIds.map((id) => orgNameById[id] ?? "…").join(", ")}`}
            >
              <Building2 className="h-2.5 w-2.5" />
              {orgIds.length === 1 ? (orgNameById[orgIds[0]] ?? "…") : `${orgIds.length} orgs`}
            </span>
          )}
          {tagDefs.map((t) => {
            const st = tagStyle(t.color);
            return (
              <span
                key={t.id}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[9.5px] font-medium ring-1 ring-inset ${st.bg} ${st.fg} ${st.ring}`}
              >
                <span className={`h-1 w-1 rounded-full ${st.dot}`} />
                {t.name}
              </span>
            );
          })}
        </div>
        <p className="text-[10.5px] text-slate-500 truncate mt-0.5">{w.description}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        {onAttribute && (
          <button
            type="button"
            onClick={() => onAttribute(w)}
            className={cn(
              "h-6 w-6 rounded transition-colors inline-flex items-center justify-center",
              orgIds.length > 0
                ? "text-blue-600 hover:bg-blue-50"
                : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-blue-600",
            )}
            title="Attribuer à une organisation"
          >
            <Building2 className="h-3.5 w-3.5" />
          </button>
        )}
        {onTag && (
          <button
            type="button"
            onClick={() => onTag(w)}
            className={cn(
              "h-6 w-6 rounded transition-colors inline-flex items-center justify-center",
              tagIds.length > 0
                ? "text-violet-600 hover:bg-violet-50"
                : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-violet-600",
            )}
            title="Balises"
          >
            <TagIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {renderAction(w)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions pré-faites pour les deux modes courants.
// ---------------------------------------------------------------------------
export function renderAddAction(
  w: UnifiedWidget,
  isActive: boolean,
  onAdd: (id: string) => void,
): React.ReactNode {
  if (isActive) {
    return <span className="text-[10px] text-emerald-600 font-medium">Actif</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onAdd(w.id)}
      className="h-6 w-6 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
      title="Ajouter ce widget"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

export function renderToggleAction(
  w: UnifiedWidget,
  isSelected: boolean,
  onToggle: (id: string) => void,
): React.ReactNode {
  return (
    <button
      type="button"
      onClick={() => onToggle(w.id)}
      className={cn(
        "h-5 w-5 rounded border flex items-center justify-center transition-colors",
        isSelected
          ? "bg-blue-600 border-blue-600 text-white"
          : "bg-white border-slate-300 hover:border-blue-400",
      )}
      title={isSelected ? "Décocher" : "Sélectionner"}
    >
      {isSelected && <Plus className="h-3 w-3 rotate-45" />}
    </button>
  );
}
