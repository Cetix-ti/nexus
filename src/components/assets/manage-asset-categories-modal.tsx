"use client";

import { useState, useEffect } from "react";
import { X, Plus, Pencil, Trash2, Check, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AssetCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const ICONS = ["📦", "🖥️", "💻", "🖨️", "📱", "🌐", "☁️", "🛡️", "💾", "🔌", "⚡", "📡", "🖧", "🎛️"];

export function ManageAssetCategoriesModal({ open, onClose }: Props) {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "📦",
    color: "#3B82F6",
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/asset-categories");
      const data = await res.json();
      if (Array.isArray(data)) setCategories(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  function startCreate() {
    setForm({ name: "", description: "", icon: "📦", color: "#3B82F6" });
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(c: AssetCategory) {
    setForm({
      name: c.name,
      description: c.description || "",
      icon: c.icon,
      color: c.color,
    });
    setEditingId(c.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  async function save() {
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        const res = await fetch(`/api/v1/asset-categories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const updated = await res.json();
        if (!res.ok) throw new Error(updated.error);
        setCategories((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const res = await fetch("/api/v1/asset-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const created = await res.json();
        if (!res.ok) throw new Error(created.error);
        setCategories((prev) => [...prev, created]);
      }
      cancelEdit();
    } catch (e) {
      alert("Erreur : " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette catégorie ?")) return;
    try {
      const res = await fetch(`/api/v1/asset-categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      alert("Erreur : " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Boxes className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Catégories d&apos;actifs
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Définissez les types d&apos;actifs que vous souhaitez suivre
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

        <div className="px-6 pt-4 shrink-0">
          {!creating && !editingId && (
            <Button variant="primary" size="sm" onClick={startCreate}>
              <Plus className="h-3 w-3" />
              Nouvelle catégorie
            </Button>
          )}
        </div>

        {(creating || editingId) && (
          <div className="mx-6 mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-slate-700">Nom</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full h-9 rounded border border-slate-200 px-2.5 text-[13px]"
                  placeholder="Imprimante, Switch, Tablette..."
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-700">Couleur</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-9 w-9 rounded cursor-pointer border border-slate-200"
                  />
                  <input
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="flex-1 h-9 rounded border border-slate-200 px-2 text-[12px] font-mono"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700">Icône</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setForm({ ...form, icon: ic })}
                    className={`h-8 w-8 rounded-md text-[16px] transition-all ${
                      form.icon === ic
                        ? "bg-white ring-2 ring-blue-500 scale-110"
                        : "bg-white hover:bg-slate-100"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-700">
                Description (optionnelle)
              </label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full h-9 rounded border border-slate-200 px-2.5 text-[13px]"
                placeholder="À quoi sert cette catégorie ?"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                Annuler
              </Button>
              <Button variant="primary" size="sm" onClick={save}>
                <Check className="h-3 w-3" />
                {editingId ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-[12px] text-slate-400 py-8">Chargement...</p>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-slate-500">
              Aucune catégorie. Cliquez sur « Nouvelle catégorie » pour démarrer.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="group flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50/60"
                >
                  <div
                    className="h-9 w-9 rounded-md flex items-center justify-center text-[18px] shrink-0 ring-1 ring-inset"
                    style={{
                      backgroundColor: c.color + "15",
                      boxShadow: `inset 0 0 0 1px ${c.color}30`,
                    }}
                  >
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900">{c.name}</p>
                    {c.description && (
                      <p className="text-[11.5px] text-slate-500 truncate">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => startEdit(c)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      title="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
