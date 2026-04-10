"use client";

import { useState } from "react";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useKbStore, type KbCategory } from "@/stores/kb-store";

interface ManageCategoriesModalProps {
  open: boolean;
  onClose: () => void;
}

const COLORS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B",
  "#EF4444", "#06B6D4", "#EC4899", "#64748B",
];

const ICONS = ["📁", "🚀", "📧", "🌐", "🖥️", "📦", "🛡️", "🔑", "📞", "⚙️", "📊", "💼"];

export function ManageCategoriesModal({ open, onClose }: ManageCategoriesModalProps) {
  const categories = useKbStore((s) => s.categories);
  const articles = useKbStore((s) => s.articles);
  const addCategory = useKbStore((s) => s.addCategory);
  const updateCategory = useKbStore((s) => s.updateCategory);
  const deleteCategory = useKbStore((s) => s.deleteCategory);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(categories.filter((c) => c.parentId === null).map((c) => c.id))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<KbCategory>>({});
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [newIcon, setNewIcon] = useState("📁");

  if (!open) return null;

  function articleCountForCategory(catId: string): number {
    return articles.filter((a) => a.categoryId === catId).length;
  }

  function startEdit(c: KbCategory) {
    setEditingId(c.id);
    setEditForm({ name: c.name, color: c.color, icon: c.icon, description: c.description });
  }

  function saveEdit() {
    if (editingId && editForm.name?.trim()) {
      updateCategory(editingId, editForm);
    }
    setEditingId(null);
    setEditForm({});
  }

  function startCreate(parentId: string | null) {
    setCreatingUnder(parentId);
    setNewName("");
    setNewColor("#3B82F6");
    setNewIcon("📁");
  }

  function confirmCreate() {
    if (newName.trim() && creatingUnder !== undefined) {
      addCategory(newName.trim(), creatingUnder, newColor, newIcon);
      if (creatingUnder) {
        setExpanded((prev) => new Set([...prev, creatingUnder]));
      }
    }
    setCreatingUnder(undefined);
  }

  async function handleDelete(c: KbCategory) {
    const count = articleCountForCategory(c.id);
    const childCount = categories.filter((cat) => cat.parentId === c.id).length;
    let msg = `Supprimer « ${c.name} » ?`;
    if (count > 0 || childCount > 0) {
      msg += `\n\n${count > 0 ? `${count} article(s) seront détachés.` : ""}${
        childCount > 0 ? `\n${childCount} sous-catégorie(s) seront aussi supprimées.` : ""
      }`;
    }
    if (!confirm(msg)) return;
    try {
      await deleteCategory(c.id);
    } catch (e) {
      alert("Erreur lors de la suppression : " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Build children map
  const childrenMap = new Map<string | null, KbCategory[]>();
  categories.forEach((c) => {
    const list = childrenMap.get(c.parentId) || [];
    list.push(c);
    childrenMap.set(c.parentId, list);
  });
  childrenMap.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

  function renderNode(cat: KbCategory, depth: number) {
    const children = childrenMap.get(cat.id) || [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(cat.id);
    const isEditing = editingId === cat.id;
    const count = articleCountForCategory(cat.id);

    return (
      <div key={cat.id}>
        <div
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(cat.id)}
              className="h-4 w-4 inline-flex items-center justify-center text-slate-400 hover:text-slate-700"
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          {hasChildren && isOpen ? (
            <FolderOpen className="h-4 w-4 shrink-0" style={{ color: cat.color }} />
          ) : (
            <Folder className="h-4 w-4 shrink-0" style={{ color: cat.color }} />
          )}
          <span className="text-[13px]">{cat.icon}</span>

          {isEditing ? (
            <div className="flex-1 flex items-center gap-1.5">
              <input
                type="text"
                value={editForm.name || ""}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="h-7 flex-1 rounded border border-slate-200 px-2 text-[12.5px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditForm({});
                  }
                }}
              />
              <input
                type="color"
                value={editForm.color || cat.color}
                onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                className="h-7 w-7 rounded cursor-pointer border border-slate-200"
              />
              <button
                type="button"
                onClick={saveEdit}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <>
              <span className="flex-1 text-[13px] text-slate-800 font-medium truncate">
                {cat.name}
              </span>
              <span className="text-[10.5px] text-slate-400 tabular-nums">
                {count} article{count !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => startCreate(cat.id)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                  title="Ajouter une sous-catégorie"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(cat)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Renommer"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cat)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Supprimer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Inline create form when this is the parent target */}
        {creatingUnder === cat.id && isOpen && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2 py-2 bg-blue-50/60 border border-blue-200/60 my-1"
            style={{ marginLeft: `${(depth + 1) * 16 + 8}px` }}
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom de la sous-catégorie"
              className="h-7 flex-1 rounded border border-slate-200 px-2 text-[12.5px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCreate();
                if (e.key === "Escape") setCreatingUnder(undefined);
              }}
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-7 w-7 rounded cursor-pointer border border-slate-200"
            />
            <Button variant="primary" size="sm" onClick={confirmCreate}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreatingUnder(undefined)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {isOpen && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  const roots = childrenMap.get(null) || [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <FolderTree className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Gérer les catégories
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Hiérarchisez vos catégories et sous-catégories comme une bibliothèque SharePoint
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 pt-4 shrink-0">
          <Button variant="primary" size="sm" onClick={() => startCreate(null)}>
            <Plus className="h-3 w-3" />
            Nouvelle catégorie racine
          </Button>
        </div>

        {/* Inline create at root */}
        {creatingUnder === null && (
          <div className="mx-6 mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 bg-blue-50/60 border border-blue-200/60">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom de la catégorie racine"
              className="h-8 flex-1 rounded border border-slate-200 px-2 text-[13px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCreate();
                if (e.key === "Escape") setCreatingUnder(undefined);
              }}
            />
            <select
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              className="h-8 rounded border border-slate-200 px-2 text-[13px]"
            >
              {ICONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-8 w-8 rounded cursor-pointer border border-slate-200"
            />
            <Button variant="primary" size="sm" onClick={confirmCreate}>
              <Check className="h-3 w-3" />
              Créer
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreatingUnder(undefined)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-4">
          {roots.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-slate-500">
              Aucune catégorie. Créez-en une pour démarrer.
            </div>
          ) : (
            <div className="space-y-0.5">{roots.map((c) => renderNode(c, 0))}</div>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-3 shrink-0 text-[11px] text-slate-500">
          💡 Astuce : passez la souris sur une catégorie pour voir les actions
          (ajouter sous-catégorie, renommer, supprimer).
        </div>
      </div>
    </div>
  );
}
