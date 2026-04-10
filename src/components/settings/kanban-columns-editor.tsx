"use client";

import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GROUP_BY_LABELS,
  type BoardColumn,
  type BoardGroupBy,
} from "@/stores/kanban-boards-store";

const COLUMN_COLORS = [
  "#3B82F6", "#0EA5E9", "#06B6D4", "#10B981", "#84CC16",
  "#F59E0B", "#F97316", "#EF4444", "#EC4899", "#8B5CF6",
  "#6366F1", "#64748B",
];

// Sensible default column sets per groupBy
export const DEFAULT_COLUMNS_BY_GROUP: Record<BoardGroupBy, BoardColumn[]> = {
  status: [
    { id: "c_new", label: "Nouveau", value: "new", color: "#3B82F6", order: 0, visible: true },
    { id: "c_open", label: "Ouvert", value: "open", color: "#0EA5E9", order: 1, visible: true },
    { id: "c_in_progress", label: "En cours", value: "in_progress", color: "#F59E0B", order: 2, visible: true },
    { id: "c_on_site", label: "Sur place", value: "on_site", color: "#06B6D4", order: 3, visible: true },
    { id: "c_waiting", label: "Attente client", value: "waiting_client", color: "#8B5CF6", order: 4, visible: true },
    { id: "c_resolved", label: "Résolu", value: "resolved", color: "#10B981", order: 5, visible: true },
  ],
  priority: [
    { id: "c_low", label: "Faible", value: "low", color: "#10B981", order: 0, visible: true },
    { id: "c_medium", label: "Moyenne", value: "medium", color: "#3B82F6", order: 1, visible: true },
    { id: "c_high", label: "Élevée", value: "high", color: "#F59E0B", order: 2, visible: true },
    { id: "c_critical", label: "Critique", value: "critical", color: "#EF4444", order: 3, visible: true },
  ],
  sla: [
    { id: "c_sla_ok", label: "Dans les délais", value: "on_track", color: "#10B981", order: 0, visible: true },
    { id: "c_sla_risk", label: "À risque", value: "at_risk", color: "#F59E0B", order: 1, visible: true },
    { id: "c_sla_breach", label: "SLA dépassé", value: "breached", color: "#EF4444", order: 2, visible: true },
  ],
  organization: [],
  assignee: [],
  category: [],
  ticket_type: [
    { id: "c_incident", label: "Incident", value: "incident", color: "#EF4444", order: 0, visible: true },
    { id: "c_request", label: "Demande", value: "request", color: "#3B82F6", order: 1, visible: true },
    { id: "c_problem", label: "Problème", value: "problem", color: "#F59E0B", order: 2, visible: true },
    { id: "c_change", label: "Changement", value: "change", color: "#8B5CF6", order: 3, visible: true },
  ],
};

interface Props {
  groupBy: BoardGroupBy;
  columns: BoardColumn[];
  onGroupByChange: (g: BoardGroupBy) => void;
  onColumnsChange: (cols: BoardColumn[]) => void;
}

export function KanbanColumnsEditor({
  groupBy,
  columns,
  onGroupByChange,
  onColumnsChange,
}: Props) {
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  function updateColumn(id: string, patch: Partial<BoardColumn>) {
    onColumnsChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function deleteColumn(id: string) {
    onColumnsChange(
      columns
        .filter((c) => c.id !== id)
        .map((c, i) => ({ ...c, order: i }))
    );
  }

  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((c) => c.id === id);
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    const next = [...sorted];
    [next[idx], next[target]] = [next[target], next[idx]];
    onColumnsChange(next.map((c, i) => ({ ...c, order: i })));
  }

  function addColumn() {
    const newCol: BoardColumn = {
      id: `c_${Date.now()}`,
      label: "Nouvelle colonne",
      value: "",
      color: "#3B82F6",
      order: columns.length,
      visible: true,
    };
    onColumnsChange([...columns, newCol]);
  }

  function resetDefaults() {
    onColumnsChange(DEFAULT_COLUMNS_BY_GROUP[groupBy]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
            Grouper les colonnes par
          </label>
          <Select
            value={groupBy}
            onValueChange={(v) => {
              const g = v as BoardGroupBy;
              onGroupByChange(g);
              // Seed defaults when switching to a preset groupBy
              if (DEFAULT_COLUMNS_BY_GROUP[g].length > 0) {
                onColumnsChange(DEFAULT_COLUMNS_BY_GROUP[g]);
              } else {
                onColumnsChange([]);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(GROUP_BY_LABELS) as BoardGroupBy[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {GROUP_BY_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={resetDefaults}>
          Valeurs par défaut
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            Colonnes ({sorted.filter((c) => c.visible).length} visibles / {sorted.length})
          </p>
          <Button variant="ghost" size="sm" onClick={addColumn}>
            <Plus className="h-3 w-3" />
            Ajouter
          </Button>
        </div>

        {sorted.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-slate-500">
            Aucune colonne. Cliquez sur « Ajouter » pour en créer une, ou « Valeurs par défaut » pour pré-remplir.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((col, i) => (
              <li
                key={col.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5",
                  !col.visible && "opacity-50"
                )}
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(col.id, -1)}
                    className="h-4 w-5 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={i === sorted.length - 1}
                    onClick={() => move(col.id, 1)}
                    className="h-4 w-5 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>

                <input
                  type="color"
                  value={col.color}
                  onChange={(e) => updateColumn(col.id, { color: e.target.value })}
                  className="h-7 w-7 rounded cursor-pointer border border-slate-200 bg-transparent"
                  title="Couleur"
                />

                <input
                  type="text"
                  value={col.label}
                  onChange={(e) => updateColumn(col.id, { label: e.target.value })}
                  placeholder="Titre"
                  className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                />

                <input
                  type="text"
                  value={col.value}
                  onChange={(e) => updateColumn(col.id, { value: e.target.value })}
                  placeholder="Valeur (clé)"
                  className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-mono text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                  title="Ex: in_progress, high, org-1"
                />

                <button
                  type="button"
                  onClick={() => updateColumn(col.id, { visible: !col.visible })}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title={col.visible ? "Masquer" : "Afficher"}
                >
                  {col.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => deleteColumn(col.id)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {COLUMN_COLORS.map((c) => (
          <span
            key={c}
            className="h-3 w-3 rounded-sm ring-1 ring-slate-200"
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        <span className="text-[10.5px] text-slate-400 ml-1">
          Palette suggérée (cliquez sur le carré coloré d&apos;une colonne pour choisir)
        </span>
      </div>
    </div>
  );
}
