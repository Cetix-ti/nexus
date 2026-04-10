"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  X,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useKanbanStore,
  COLOR_PRESETS,
  STATUS_OPTIONS,
  type KanbanColumn,
} from "@/stores/kanban-store";
import type { TicketStatus } from "@/lib/mock-data";

export function KanbanColumnsSection() {
  const columns = useKanbanStore((s) => s.columns);
  const addColumn = useKanbanStore((s) => s.addColumn);
  const updateColumn = useKanbanStore((s) => s.updateColumn);
  const deleteColumn = useKanbanStore((s) => s.deleteColumn);
  const reorderColumns = useKanbanStore((s) => s.reorderColumns);
  const resetColumns = useKanbanStore((s) => s.resetColumns);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    label: "",
    status: "open" as TicketStatus,
    colorIndex: 0,
  });

  function startCreate() {
    setForm({ label: "", status: "open", colorIndex: 0 });
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(col: KanbanColumn) {
    const colorIndex =
      COLOR_PRESETS.findIndex((p) => p.dot === col.dotClass) ?? 0;
    setForm({
      label: col.label,
      status: col.status,
      colorIndex: colorIndex >= 0 ? colorIndex : 0,
    });
    setEditingId(col.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  function saveColumn() {
    if (!form.label.trim()) return;
    const color = COLOR_PRESETS[form.colorIndex];
    if (editingId) {
      updateColumn(editingId, {
        label: form.label.trim(),
        status: form.status,
        dotClass: color.dot,
        headerBg: color.bg,
        headerRing: color.ring,
      });
    } else if (creating) {
      addColumn({
        label: form.label.trim(),
        status: form.status,
        dotClass: color.dot,
        headerBg: color.bg,
        headerRing: color.ring,
        visible: true,
      });
    }
    cancelEdit();
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const ids = sorted.map((c) => c.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    reorderColumns(ids);
  }

  function moveDown(idx: number) {
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    if (idx === sorted.length - 1) return;
    const ids = sorted.map((c) => c.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    reorderColumns(ids);
  }

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
  const isEditing = editingId !== null || creating;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
            Colonnes du tableau Kanban
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Configurez les colonnes affichées dans la vue Kanban des tickets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={resetColumns}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
            Réinitialiser
          </Button>
          <Button variant="primary" size="md" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Nouvelle colonne
          </Button>
        </div>
      </div>

      {/* Edit/Create form */}
      {isEditing && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-[13px] font-semibold text-slate-900">
              {editingId ? "Modifier la colonne" : "Nouvelle colonne"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Libellé de la colonne"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex: En revue"
              />
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Statut technique associé
                </label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as TicketStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-medium text-slate-700">
                Couleur
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setForm({ ...form, colorIndex: idx })}
                    title={preset.name}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 transition-all",
                      form.colorIndex === idx
                        ? "border-blue-500 ring-2 ring-blue-500/20 bg-white shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    <span className={cn("h-3 w-3 rounded-full", preset.dot)} />
                    <span className="text-[11.5px] font-medium text-slate-700">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {/* Preview */}
            <div>
              <label className="mb-2 block text-[13px] font-medium text-slate-700">
                Aperçu
              </label>
              <div
                className={cn(
                  "rounded-xl border border-slate-200/80 bg-slate-50/40 w-[280px]"
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/80 rounded-t-xl ring-1 ring-inset",
                    COLOR_PRESETS[form.colorIndex].bg,
                    COLOR_PRESETS[form.colorIndex].ring
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      COLOR_PRESETS[form.colorIndex].dot
                    )}
                  />
                  <h3 className="flex-1 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-700">
                    {form.label || "Nom de la colonne"}
                  </h3>
                  <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-slate-700 tabular-nums shadow-sm ring-1 ring-inset ring-slate-200/60">
                    0
                  </span>
                </div>
                <div className="p-3 text-[11px] text-slate-400 italic">
                  Aperçu de la colonne
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5" />
                Annuler
              </Button>
              <Button variant="primary" size="sm" onClick={saveColumn}>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Columns list */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {sortedColumns.map((col, idx) => (
              <div
                key={col.id}
                className={cn(
                  "flex items-center gap-3 px-5 py-3.5 group hover:bg-slate-50/60 transition-colors",
                  !col.visible && "opacity-60"
                )}
              >
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === sortedColumns.length - 1}
                    className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>

                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ring-1 ring-inset",
                    col.headerBg,
                    col.headerRing
                  )}
                >
                  <LayoutGrid className="h-4 w-4 text-slate-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", col.dotClass)} />
                    <h3 className="text-[14px] font-semibold text-slate-900">
                      {col.label}
                    </h3>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-slate-500">
                    Statut associé :{" "}
                    <span className="font-mono text-slate-600">{col.status}</span>
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() =>
                      updateColumn(col.id, { visible: !col.visible })
                    }
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                    title={col.visible ? "Masquer" : "Afficher"}
                  >
                    {col.visible ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => startEdit(col)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                    title="Modifier"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteColumn(col.id)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {sortedColumns.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-[13px] text-slate-400 italic">
                  Aucune colonne configurée. Cliquez sur « Nouvelle colonne » pour
                  commencer.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-[11.5px] text-slate-500">
        Les modifications sont enregistrées localement dans votre navigateur et
        s&apos;appliquent immédiatement à la vue Kanban.
      </p>
    </div>
  );
}
