"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HardDrive,
  Save,
  Loader2,
  CheckCircle2,
  Info,
} from "lucide-react";
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

interface BackupKanbanConfig {
  titlePattern: string;
  categoryId: string | null;
  subcategoryId: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lookbackDays: number;
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

const EMPTY: BackupKanbanConfig = {
  titlePattern: "Sauvegardes en échec — {clientName}",
  categoryId: null,
  subcategoryId: null,
  priority: "HIGH",
  lookbackDays: 7,
};

// Valeur sentinelle pour "aucune catégorie / aucune sous-catégorie".
// On ne peut pas passer "" comme valeur dans un SelectItem Radix — ça
// déclenche une exception à l'ouverture du dropdown. On utilise donc
// "__none" et on traduit vers null au save.
const NONE = "__none";

export function BackupKanbanSection() {
  const [config, setConfig] = useState<BackupKanbanConfig>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/settings/backup-kanban").then((r) => (r.ok ? r.json() : EMPTY)),
      fetch("/api/v1/categories").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([cfg, cats]: [BackupKanbanConfig, Category[]]) => {
        setConfig({ ...EMPTY, ...cfg });
        setCategories(Array.isArray(cats) ? cats : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Parents = catégories sans parent. Sous-catégories = filles de la
  // catégorie sélectionnée — s'adapte dynamiquement quand on change
  // la catégorie parente.
  const parents = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );
  const subcategories = useMemo(() => {
    if (!config.categoryId) return [];
    return categories.filter((c) => c.parentId === config.categoryId);
  }, [categories, config.categoryId]);

  function upd<K extends keyof BackupKanbanConfig>(
    key: K,
    value: BackupKanbanConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/settings/backup-kanban", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      setSaved(true);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Kanban des sauvegardes
        </h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Paramètres du tableau Kanban de la page Sauvegardes. Contrôle la
          génération automatique des templates de ticket et la conversion en
          tickets réels.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Génération des templates
              </h3>
              <p className="text-[12px] text-slate-500">
                Forme du titre généré automatiquement pour chaque client avec au moins
                une tâche Veeam en échec.
              </p>
            </div>
          </div>

          <Input
            label="Gabarit de titre"
            value={config.titlePattern}
            onChange={(e) => upd("titlePattern", e.target.value)}
            placeholder="Sauvegardes en échec — {clientName}"
          />
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-[11.5px] text-slate-600 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
            <div className="space-y-1">
              <p>Placeholders disponibles :</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li><code className="bg-white px-1 rounded">{"{clientName}"}</code> — nom de l&apos;organisation</li>
                <li><code className="bg-white px-1 rounded">{"{clientCode}"}</code> — code client (vide si non défini)</li>
                <li><code className="bg-white px-1 rounded">{"{failedCount}"}</code> — nombre de tâches en échec</li>
                <li><code className="bg-white px-1 rounded">{"{date}"}</code> — date de la dernière alerte (YYYY-MM-DD)</li>
              </ul>
              <p className="text-slate-500 pt-1">
                L&apos;agent peut éditer le titre directement sur la carte avant de la
                convertir en ticket.
              </p>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500">
              Fenêtre d&apos;alertes prises en compte
            </label>
            <Select
              value={String(config.lookbackDays)}
              onValueChange={(v) => upd("lookbackDays", Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">24 heures</SelectItem>
                <SelectItem value="3">3 jours</SelectItem>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="14">14 jours</SelectItem>
                <SelectItem value="30">30 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900">
              Classification du ticket créé
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Champs appliqués quand la carte est déplacée en colonne « En traitement »
              et convertie en vrai ticket.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500">Catégorie</label>
            <Select
              value={config.categoryId ?? NONE}
              onValueChange={(v) => {
                const id = v === NONE ? null : v;
                setConfig((c) => ({ ...c, categoryId: id, subcategoryId: null }));
                setDirty(true);
                setSaved(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="— Aucune —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Aucune —</SelectItem>
                {parents.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {config.categoryId && (
            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Sous-catégorie
              </label>
              <Select
                value={config.subcategoryId ?? NONE}
                onValueChange={(v) =>
                  upd("subcategoryId", v === NONE ? null : v)
                }
                disabled={subcategories.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      subcategories.length === 0
                        ? "— Aucune sous-catégorie disponible —"
                        : "— Aucune —"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Aucune —</SelectItem>
                  {subcategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-500">Priorité</label>
            <Select
              value={config.priority}
              onValueChange={(v) =>
                upd("priority", v as BackupKanbanConfig["priority"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Basse</SelectItem>
                <SelectItem value="MEDIUM">Moyenne</SelectItem>
                <SelectItem value="HIGH">Haute</SelectItem>
                <SelectItem value="CRITICAL">Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Enregistrer
              </Button>
              {saved && !dirty && (
                <Badge variant="success">
                  <CheckCircle2 className="h-3 w-3" />
                  Sauvegardé
                </Badge>
              )}
              {error && (
                <span className="text-[12px] text-red-600">{error}</span>
              )}
              {dirty && !saved && (
                <span className="text-[12px] text-amber-600">
                  Modifications non sauvegardées
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
