"use client";

// ============================================================================
// Paramètres → Facturation → Catégories de base
//
// Catalogue global (partagé entre toutes les organisations) des catégories
// de base utilisées dans les types de travail par client. Chaque catégorie
// garde un lien vers le TimeType système qui dicte le comportement du
// moteur de facturation — les catégories ajoutées à la main tombent sur
// "other" par défaut.
// ============================================================================

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  loadBaseCategories,
  saveBaseCategories,
  loadSystemTypeLabels,
  saveSystemTypeLabels,
  loadCustomSystemTypes,
  saveCustomSystemTypes,
  type BaseCategory,
  type CustomSystemType,
} from "@/components/billing/client-billing-overrides-section";
import { TIME_TYPE_LABELS, type TimeType } from "@/lib/billing/types";

const SYSTEM_TIME_TYPES = Object.keys(TIME_TYPE_LABELS) as TimeType[];
/** Retourne le libellé personnalisé si défini, sinon le libellé par défaut. */
function resolveSystemLabel(
  t: TimeType,
  overrides: Partial<Record<TimeType, string>>,
): string {
  return overrides[t] ?? TIME_TYPE_LABELS[t];
}

export function WorkTypeCategoriesSection() {
  const [categories, setCategories] = useState<BaseCategory[]>([]);
  const [systemLabels, setSystemLabels] = useState<Partial<Record<TimeType, string>>>({});
  const [customSystemTypes, setCustomSystemTypes] = useState<CustomSystemType[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<TimeType>("other");
  const [newSysLabel, setNewSysLabel] = useState("");
  const [newSysMapsTo, setNewSysMapsTo] = useState<TimeType>("other");

  useEffect(() => {
    // Source de vérité DB. Fallback localStorage si l'API ne répond pas
    // (mode dégradé pendant un restart serveur, par exemple).
    setCategories(loadBaseCategories());
    setSystemLabels(loadSystemTypeLabels());
    setCustomSystemTypes(loadCustomSystemTypes());
    fetch("/api/v1/billing/base-categories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const rows = Array.isArray(data?.data) ? data.data : null;
        if (!rows || rows.length === 0) return;
        const mapped: BaseCategory[] = rows.map((r: { id: string; label: string; systemTimeType: TimeType }) => ({
          id: r.id,
          label: r.label,
          systemTimeType: r.systemTimeType,
        }));
        setCategories(mapped);
      })
      .catch(() => {});
  }, []);

  function updateLabel(id: string, label: string) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
    setDirty(true);
  }
  function updateType(id: string, systemTimeType: TimeType) {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, systemTimeType } : c)),
    );
    setDirty(true);
  }
  function removeCategory(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setDirty(true);
  }
  function addCategory() {
    const label = newLabel.trim();
    if (!label) return;
    const id = `cat_${Date.now()}`;
    setCategories((prev) => [...prev, { id, label, systemTimeType: newType }]);
    setNewLabel("");
    setNewType("other");
    setDirty(true);
  }
  function updateSystemLabel(t: TimeType, label: string) {
    setSystemLabels((prev) => {
      const next = { ...prev };
      const trimmed = label.trim();
      // Libellé vide ou identique au défaut → on retire l'override pour
      // ne pas polluer le storage.
      if (!trimmed || trimmed === TIME_TYPE_LABELS[t]) delete next[t];
      else next[t] = trimmed;
      return next;
    });
    setDirty(true);
  }
  function updateCustomSysLabel(id: string, label: string) {
    setCustomSystemTypes((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
    setDirty(true);
  }
  function updateCustomSysMapsTo(id: string, mapsTo: TimeType) {
    setCustomSystemTypes((prev) => prev.map((s) => (s.id === id ? { ...s, mapsTo } : s)));
    setDirty(true);
  }
  function removeCustomSystemType(id: string) {
    setCustomSystemTypes((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  }
  function addCustomSystemType() {
    const label = newSysLabel.trim();
    if (!label) return;
    const id = `sys_${Date.now()}`;
    setCustomSystemTypes((prev) => [...prev, { id, label, mapsTo: newSysMapsTo }]);
    setNewSysLabel("");
    setNewSysMapsTo("other");
    setDirty(true);
  }

  async function handleSave() {
    // Persiste DB d'abord (source de vérité), puis cache localStorage
    // pour les composants sync (modales). Si la DB échoue, on garde au
    // moins le cache local — meilleur que rien.
    try {
      const r = await fetch("/api/v1/billing/base-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: categories.map((c, idx) => ({
            // ID DB seulement (pas les "cat_…" UI-générés)
            ...(c.id && !c.id.startsWith("cat_") ? { id: c.id } : {}),
            label: c.label,
            systemTimeType: c.systemTimeType,
            sortOrder: idx,
          })),
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const rows = Array.isArray(data?.data) ? data.data : [];
        const mapped: BaseCategory[] = rows.map((r: { id: string; label: string; systemTimeType: TimeType }) => ({
          id: r.id,
          label: r.label,
          systemTimeType: r.systemTimeType,
        }));
        setCategories(mapped);
        saveBaseCategories(mapped);
      } else {
        // En cas de 403 (non admin) ou erreur, on garde le state local
        // pour ne pas perdre les modifications en cours d'édition.
        const d = await r.json().catch(() => ({}));
        console.error("Failed to save categories:", d);
        saveBaseCategories(categories);
      }
    } catch (e) {
      console.error("Failed to save categories:", e);
      saveBaseCategories(categories);
    }
    saveSystemTypeLabels(systemLabels);
    saveCustomSystemTypes(customSystemTypes);
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString("fr-CA"));
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Catégories de base
        </h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Liste globale disponible pour toutes les organisations. Chaque
          organisation peut ensuite créer ses propres libellés de types de
          travail en pointant vers une de ces catégories. Le «&nbsp;Type
          système&nbsp;» reste l&apos;ancre pour le moteur de facturation
          (couverture, règles de dépassement, etc.).
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          {categories.length === 0 ? (
            <p className="text-[12.5px] italic text-slate-400 py-4 text-center">
              Aucune catégorie — ajoute-en une ci-dessous pour commencer.
            </p>
          ) : (
            categories.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px_auto] items-end rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <div className="space-y-1">
                  <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                    Libellé
                  </label>
                  <Input
                    value={c.label}
                    onChange={(e) => updateLabel(c.id, e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                    Type système
                  </label>
                  <select
                    value={c.systemTimeType}
                    onChange={(e) => updateType(c.id, e.target.value as TimeType)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {SYSTEM_TIME_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {resolveSystemLabel(t, systemLabels)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeCategory(c.id)}
                  className="h-10 w-10 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Retirer la catégorie"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Types système — 9 types intégrés (libellé renommable) + types
          personnalisés (CRUD complet). Les intégrés pilotent le moteur
          de facturation ; les customs héritent du comportement de leur
          `mapsTo`. */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h3 className="text-[13px] font-semibold text-slate-800 flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-slate-500" />
              Types système
            </h3>
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              Les 9 types intégrés pilotent le moteur de facturation — tu peux
              seulement renommer leur libellé d&apos;affichage. Tu peux aussi
              ajouter tes propres types ci-dessous ; ils héritent du comportement
              engine du type de base auquel tu les relies.
            </p>
          </div>

          {/* Intégrés — rename seulement */}
          <div>
            <p className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400 mb-1.5">
              Intégrés (rename uniquement)
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SYSTEM_TIME_TYPES.map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="text-[11px] font-mono text-slate-400 w-28 shrink-0 truncate">
                    {t}
                  </span>
                  <Input
                    placeholder={TIME_TYPE_LABELS[t]}
                    value={systemLabels[t] ?? ""}
                    onChange={(e) => updateSystemLabel(t, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Customs — CRUD */}
          <div>
            <p className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400 mb-1.5">
              Personnalisés
            </p>
            {customSystemTypes.length === 0 ? (
              <p className="text-[12px] italic text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">
                Aucun type personnalisé — ajoutes-en un avec le formulaire ci-dessous.
              </p>
            ) : (
              <div className="space-y-2">
                {customSystemTypes.map((s) => (
                  <div
                    key={s.id}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px_auto] items-end rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="space-y-1">
                      <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                        Libellé
                      </label>
                      <Input
                        value={s.label}
                        onChange={(e) => updateCustomSysLabel(s.id, e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                        Comportement engine
                      </label>
                      <select
                        value={s.mapsTo}
                        onChange={(e) => updateCustomSysMapsTo(s.id, e.target.value as TimeType)}
                        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {SYSTEM_TIME_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {resolveSystemLabel(t, systemLabels)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomSystemType(s.id)}
                      className="h-10 w-10 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Supprimer ce type personnalisé"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulaire d'ajout */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px_auto] items-end border-t border-slate-100 pt-3">
              <div className="space-y-1">
                <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                  Nouveau libellé
                </label>
                <Input
                  placeholder="Ex : Formation client"
                  value={newSysLabel}
                  onChange={(e) => setNewSysLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSystemType();
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                  Comportement engine
                </label>
                <select
                  value={newSysMapsTo}
                  onChange={(e) => setNewSysMapsTo(e.target.value as TimeType)}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {SYSTEM_TIME_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {resolveSystemLabel(t, systemLabels)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={addCustomSystemType}
                disabled={!newSysLabel.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add row */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-[13px] font-semibold text-slate-800 mb-2 flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-slate-500" />
            Nouvelle catégorie
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px_auto] items-end">
            <div className="space-y-1">
              <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                Libellé
              </label>
              <Input
                placeholder="Ex : Services professionnels"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10.5px] uppercase tracking-wider font-medium text-slate-400">
                Type système
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as TimeType)}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {SYSTEM_TIME_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {resolveSystemLabel(t, systemLabels)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={addCategory}
              disabled={!newLabel.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {savedAt && !dirty && (
          <span className="text-[12px] text-emerald-600">
            Enregistré à {savedAt}
          </span>
        )}
        {dirty && (
          <span className="text-[12px] text-amber-600">
            Modifications non sauvegardées
          </span>
        )}
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={!dirty}
          className={cn(!dirty && "opacity-60")}
        >
          <Save className="h-3.5 w-3.5" />
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
