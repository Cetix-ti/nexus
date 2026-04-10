"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  Loader2,
  CheckCircle2,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProjectType {
  key: string;
  label: string;
}

export function ProjectTypesSection() {
  const [types, setTypes] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/settings/project-types")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setTypes(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function addType() {
    const key = `type_${Date.now()}`;
    setTypes((prev) => [...prev, { key, label: "" }]);
    setSaved(false);
  }

  function removeType(key: string) {
    setTypes((prev) => prev.filter((t) => t.key !== key));
    setSaved(false);
  }

  function updateLabel(key: string, label: string) {
    setTypes((prev) =>
      prev.map((t) => (t.key === key ? { ...t, label } : t)),
    );
    setSaved(false);
  }

  function updateKey(oldKey: string, newKey: string) {
    setTypes((prev) =>
      prev.map((t) =>
        t.key === oldKey ? { ...t, key: newKey.toLowerCase().replace(/[^a-z0-9_-]/g, "_") } : t,
      ),
    );
    setSaved(false);
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    setTypes((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    // Filter out empty labels
    const valid = types.filter((t) => t.key && t.label.trim());
    if (valid.length === 0) {
      setError("Au moins un type est requis");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/settings/project-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTypes(valid);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Types de projet
        </h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Gérez les types disponibles lors de la création d&apos;un projet.
          L&apos;ordre détermine l&apos;affichage dans les menus déroulants.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <FolderKanban className="h-4 w-4" />
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900">
              Types configurés
            </h3>
            <Badge variant="default" className="text-[10px] ml-auto">
              {types.length} type{types.length > 1 ? "s" : ""}
            </Badge>
          </div>

          <div className="space-y-2">
            {types.map((t, i) => (
              <div
                key={t.key + i}
                className="flex items-center gap-2 group"
              >
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  className="h-8 w-6 flex items-center justify-center text-slate-300 hover:text-slate-500 cursor-grab"
                  title="Monter"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <Input
                  placeholder="Clé (ex: migration)"
                  value={t.key}
                  onChange={(e) => updateKey(t.key, e.target.value)}
                  className="w-40 font-mono text-[12px]"
                />
                <Input
                  placeholder="Libellé (ex: Migration)"
                  value={t.label}
                  onChange={(e) => updateLabel(t.key, e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeType(t.key)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={addType}
            className="mt-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un type
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Enregistrer
        </Button>
        {saved && (
          <Badge variant="success">
            <CheckCircle2 className="h-3 w-3" />
            Sauvegardé
          </Badge>
        )}
        {error && <span className="text-[12px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}
