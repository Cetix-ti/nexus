"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Pin,
  Lock,
  Users,
  Globe,
  LayoutGrid,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useKanbanBoardsStore,
  SHARE_SCOPE_LABELS,
  GROUP_BY_LABELS,
  type KanbanBoard,
  type BoardShareScope,
  type BoardGroupBy,
} from "@/stores/kanban-boards-store";
import {
  KanbanColumnsEditor,
  DEFAULT_COLUMNS_BY_GROUP,
} from "./kanban-columns-editor";

const COLOR_CHOICES = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B",
  "#EF4444", "#06B6D4", "#EC4899", "#64748B",
];

const ICON_CHOICES = ["📋", "🛡️", "🎧", "🖥️", "📞", "🚀", "⚡", "🔧", "📊", "💼", "🎯", "🌐"];

const TEAM_GROUPS = [
  { id: "g_security", name: "Équipe sécurité" },
  { id: "g_infra", name: "Équipe infrastructure" },
  { id: "g_support", name: "Support N1/N2" },
  { id: "g_n3", name: "Niveau 3 / Senior" },
  { id: "g_dev", name: "Équipe développement" },
];

const SHARE_ICONS = { private: Lock, team: Users, everyone: Globe };

export function KanbanBoardsSection() {
  const boards = useKanbanBoardsStore((s) => s.boards);
  const loadAllBoards = useKanbanBoardsStore((s) => s.loadAll);
  const boardsLoaded = useKanbanBoardsStore((s) => s.loaded);
  useEffect(() => {
    if (!boardsLoaded) loadAllBoards();
  }, [boardsLoaded, loadAllBoards]);
  const addBoard = useKanbanBoardsStore((s) => s.addBoard);
  const updateBoard = useKanbanBoardsStore((s) => s.updateBoard);
  const deleteBoard = useKanbanBoardsStore((s) => s.deleteBoard);
  const duplicateBoard = useKanbanBoardsStore((s) => s.duplicateBoard);
  const togglePin = useKanbanBoardsStore((s) => s.togglePin);
  const resetBoards = useKanbanBoardsStore((s) => s.resetBoards);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const empty: Omit<KanbanBoard, "id" | "createdAt" | "updatedAt"> = {
    name: "",
    description: "",
    icon: "📋",
    color: "#3B82F6",
    filterOrgIds: [],
    filterTechIds: [],
    filterCategories: [],
    filterTags: [],
    filterPriorities: [],
    filterTicketTypes: [],
    columns: boards[0]?.columns || [],
    groupBy: "status" as BoardGroupBy,
    customColumns: DEFAULT_COLUMNS_BY_GROUP.status,
    ownerId: "current_user",
    ownerName: "Vous",
    shareScope: "private" as BoardShareScope,
    sharedWithGroupIds: [],
    sharedWithGroupNames: [],
    isPinned: false,
  };

  const [form, setForm] = useState(empty);

  function startCreate() {
    setForm(empty);
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(b: KanbanBoard) {
    setForm({
      ...b,
      groupBy: b.groupBy || "status",
      customColumns:
        b.customColumns && b.customColumns.length > 0
          ? b.customColumns
          : DEFAULT_COLUMNS_BY_GROUP[b.groupBy || "status"],
    });
    setEditingId(b.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  function saveBoard() {
    if (!form.name.trim()) return;
    if (editingId) {
      updateBoard(editingId, form);
    } else if (creating) {
      addBoard(form);
    }
    cancelEdit();
  }

  function toggleGroup(groupId: string, groupName: string) {
    const has = form.sharedWithGroupIds.includes(groupId);
    if (has) {
      setForm({
        ...form,
        sharedWithGroupIds: form.sharedWithGroupIds.filter((g) => g !== groupId),
        sharedWithGroupNames: form.sharedWithGroupNames.filter((n) => n !== groupName),
      });
    } else {
      setForm({
        ...form,
        sharedWithGroupIds: [...form.sharedWithGroupIds, groupId],
        sharedWithGroupNames: [...form.sharedWithGroupNames, groupName],
      });
    }
  }

  const isEditing = editingId !== null || creating;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
            Tableaux Kanban
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Créez des tableaux Kanban dédiés à différents usages ou équipes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={resetBoards}>
            Réinitialiser
          </Button>
          <Button variant="primary" size="md" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Nouveau tableau
          </Button>
        </div>
      </div>

      {isEditing && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-[13px] font-semibold text-slate-900">
              {editingId ? "Modifier le tableau" : "Nouveau tableau"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Nom"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Cybersécurité"
              />
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Partage
                </label>
                <Select
                  value={form.shareScope}
                  onValueChange={(v) =>
                    setForm({ ...form, shareScope: v as BoardShareScope })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">🔒 Privé (vous seul)</SelectItem>
                    <SelectItem value="team">👥 Équipe(s) spécifique(s)</SelectItem>
                    <SelectItem value="everyone">🌐 Tous les agents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Input
              label="Description"
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="À quoi sert ce tableau ?"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Icône
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_CHOICES.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setForm({ ...form, icon: ic })}
                      className={cn(
                        "h-9 w-9 rounded-lg text-[18px] transition-all bg-white",
                        form.icon === ic
                          ? "ring-2 ring-blue-500 scale-110"
                          : "hover:bg-slate-100"
                      )}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Couleur
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={cn(
                        "h-7 w-7 rounded-md transition-all",
                        form.color === c
                          ? "ring-2 ring-offset-2 ring-slate-900 scale-110"
                          : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Team selection */}
            {form.shareScope === "team" && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Équipes ayant accès
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {TEAM_GROUPS.map((g) => {
                    const selected = form.sharedWithGroupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroup(g.id, g.name)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-[12.5px] text-left transition-colors",
                          selected
                            ? "border-blue-300 ring-1 ring-blue-200"
                            : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <div
                          className={cn(
                            "h-4 w-4 rounded shrink-0 border-2 flex items-center justify-center",
                            selected
                              ? "bg-blue-600 border-blue-600"
                              : "border-slate-300"
                          )}
                        >
                          {selected && (
                            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                          )}
                        </div>
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        <span className="font-medium text-slate-700">{g.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Column configuration */}
            <div className="pt-3 border-t border-blue-200 space-y-2">
              <div>
                <h4 className="text-[13px] font-semibold text-slate-900">
                  Configuration des colonnes
                </h4>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  Choisissez la variable de regroupement et personnalisez les
                  titres, couleurs et ordre des colonnes.
                </p>
              </div>
              <KanbanColumnsEditor
                groupBy={form.groupBy || "status"}
                columns={form.customColumns || []}
                onGroupByChange={(g) => setForm({ ...form, groupBy: g })}
                onColumnsChange={(cols) =>
                  setForm({ ...form, customColumns: cols })
                }
              />
            </div>

            <div className="rounded-lg bg-amber-50/40 border border-amber-200/60 px-3 py-2 text-[11px] text-amber-900">
              💡 Pour configurer les filtres prédéfinis (catégories, priorités,
              tags...), enregistrez d&apos;abord, puis utilisez les filtres de la
              vue Kanban.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-200">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-3 w-3" />
                Annuler
              </Button>
              <Button variant="primary" size="sm" onClick={saveBoard}>
                <Check className="h-3 w-3" strokeWidth={2.5} />
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {boards.map((b) => {
          const SI = SHARE_ICONS[b.shareScope];
          return (
            <Card key={b.id} className="card-hover">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className="h-11 w-11 rounded-xl flex items-center justify-center text-[20px] shrink-0 ring-1 ring-inset"
                      style={{
                        backgroundColor: b.color + "15",
                        boxShadow: `inset 0 0 0 1px ${b.color}30`,
                      }}
                    >
                      {b.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] font-semibold text-slate-900">
                          {b.name}
                        </h3>
                        {b.isPinned && (
                          <Pin className="h-3 w-3 text-amber-500 fill-amber-500" />
                        )}
                      </div>
                      {b.description && (
                        <p className="text-[11.5px] text-slate-500 mt-0.5">
                          {b.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                        <Badge variant="default">
                          <SI className="h-2.5 w-2.5" />
                          {SHARE_SCOPE_LABELS[b.shareScope]}
                        </Badge>
                        <Badge variant="outline">
                          <LayoutGrid className="h-2.5 w-2.5" />
                          {GROUP_BY_LABELS[b.groupBy || "status"]}
                        </Badge>
                        {b.filterCategories.length > 0 && (
                          <Badge variant="primary">
                            {b.filterCategories.length} catégories
                          </Badge>
                        )}
                        {b.filterTicketTypes.length > 0 && (
                          <Badge variant="primary">
                            {b.filterTicketTypes.length} types
                          </Badge>
                        )}
                        {b.filterPriorities.length > 0 && (
                          <Badge variant="warning">
                            {b.filterPriorities.length} priorités
                          </Badge>
                        )}
                        {b.filterTags.length > 0 && (
                          <Badge variant="default">
                            {b.filterTags.length} tags
                          </Badge>
                        )}
                      </div>
                      {b.sharedWithGroupNames.length > 0 && (
                        <p className="mt-2 text-[10.5px] text-slate-500">
                          Partagé avec : {b.sharedWithGroupNames.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => togglePin(b.id)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      title="Épingler"
                    >
                      <Pin
                        className={cn(
                          "h-3.5 w-3.5",
                          b.isPinned && "text-amber-500 fill-amber-500"
                        )}
                      />
                    </button>
                    <button
                      onClick={() => duplicateBoard(b.id)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      title="Dupliquer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => startEdit(b)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      title="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {b.id !== "board_default" && (
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer le tableau « ${b.name} » ?`))
                            deleteBoard(b.id);
                        }}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11.5px] text-slate-500">
        💾 Les tableaux et leur configuration sont enregistrés localement dans
        votre navigateur. En production, ils seront synchronisés en base de
        données et partagés selon les droits d&apos;accès.
      </p>
    </div>
  );
}
