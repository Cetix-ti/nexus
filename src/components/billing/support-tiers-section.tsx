"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  GraduationCap,
  ArrowUp,
  ArrowDown,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_SUPPORT_TIERS,
  type SupportTier,
} from "@/lib/billing/types";
import { getSupportTiersForOrg } from "@/lib/billing/support-tiers-data";

interface SupportTiersSectionProps {
  organizationId: string;
  organizationName: string;
}

const COLOR_CHOICES = [
  "#10B981", "#3B82F6", "#8B5CF6", "#F59E0B",
  "#EF4444", "#06B6D4", "#EC4899", "#64748B",
  "#84CC16", "#6366F1",
];

interface FormState {
  name: string;
  shortCode: string;
  description: string;
  color: string;
  hourlyRate: number;
  afterHoursRate?: number;
  weekendRate?: number;
  urgentRate?: number;
  onsiteRate?: number;
  travelRate?: number;
}

const EMPTY_FORM: FormState = {
  name: "",
  shortCode: "",
  description: "",
  color: "#3B82F6",
  hourlyRate: 125,
};

export function SupportTiersSection({
  organizationId,
  organizationName,
}: SupportTiersSectionProps) {
  const initial = useMemo(
    () => getSupportTiersForOrg(organizationId),
    [organizationId]
  );
  const [tiers, setTiers] = useState<SupportTier[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function startCreate() {
    setForm({ ...EMPTY_FORM, color: COLOR_CHOICES[tiers.length % COLOR_CHOICES.length] });
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(tier: SupportTier) {
    setForm({
      name: tier.name,
      shortCode: tier.shortCode,
      description: tier.description || "",
      color: tier.color,
      hourlyRate: tier.hourlyRate,
      afterHoursRate: tier.afterHoursRate,
      weekendRate: tier.weekendRate,
      urgentRate: tier.urgentRate,
      onsiteRate: tier.onsiteRate,
      travelRate: tier.travelRate,
    });
    setEditingId(tier.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  function saveTier() {
    if (!form.name.trim() || !form.shortCode.trim() || form.hourlyRate <= 0)
      return;
    if (editingId) {
      setTiers((prev) =>
        prev.map((t) =>
          t.id === editingId
            ? {
                ...t,
                ...form,
                updatedAt: new Date().toISOString(),
              }
            : t
        )
      );
    } else if (creating) {
      const newTier: SupportTier = {
        id: `tier_${Date.now()}`,
        organizationId,
        order: tiers.length + 1,
        isActive: true,
        ...form,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setTiers((prev) => [...prev, newTier]);
    }
    cancelEdit();
  }

  function deleteTier(id: string) {
    setTiers((prev) => prev.filter((t) => t.id !== id));
  }

  function move(idx: number, direction: -1 | 1) {
    const next = [...tiers];
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((t, i) => (t.order = i + 1));
    setTiers(next);
  }

  function loadDefaults() {
    if (tiers.length > 0) {
      if (!confirm("Cela remplacera les niveaux existants. Continuer ?"))
        return;
    }
    setTiers(
      DEFAULT_SUPPORT_TIERS.map((t, i) => ({
        ...t,
        id: `tier_default_${i}_${Date.now()}`,
        organizationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
    );
  }

  const isEditing = editingId !== null || creating;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60 shrink-0">
              <GraduationCap className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Niveaux de support « à la carte »
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Définissez les niveaux d&apos;expertise et leur taux horaire
                pour {organizationName}. S&apos;applique aux tickets facturés
                à la carte (hors banque d&apos;heures et forfait).
              </p>
            </div>
          </div>
          {!isEditing && (
            <div className="flex items-center gap-2">
              {tiers.length === 0 && (
                <Button variant="outline" size="sm" onClick={loadDefaults}>
                  Charger les défauts
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={startCreate}>
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Nouveau niveau
              </Button>
            </div>
          )}
        </div>

        {/* Edit / Create form */}
        {isEditing && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-3">
            <h4 className="text-[13px] font-semibold text-slate-900">
              {editingId ? "Modifier le niveau" : "Nouveau niveau"}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Input
                  label="Nom"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Niveau 1"
                />
              </div>
              <Input
                label="Code court"
                value={form.shortCode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shortCode: e.target.value.toUpperCase().slice(0, 4),
                  })
                }
                placeholder="N1"
              />
            </div>
            <Input
              label="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Décrit le type d'expertise..."
            />
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
            <div>
              <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Tarification
              </h5>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Input
                  label="Taux horaire ($/h)"
                  type="number"
                  step="0.01"
                  value={form.hourlyRate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hourlyRate: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <Input
                  label="Sur site ($/h)"
                  type="number"
                  step="0.01"
                  value={form.onsiteRate ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      onsiteRate: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="—"
                />
                <Input
                  label="Après-heures ($/h)"
                  type="number"
                  step="0.01"
                  value={form.afterHoursRate ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      afterHoursRate: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="—"
                />
                <Input
                  label="Week-end ($/h)"
                  type="number"
                  step="0.01"
                  value={form.weekendRate ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      weekendRate: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="—"
                />
                <Input
                  label="Urgence ($/h)"
                  type="number"
                  step="0.01"
                  value={form.urgentRate ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      urgentRate: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="—"
                />
                <Input
                  label="Déplacement ($/h)"
                  type="number"
                  step="0.01"
                  value={form.travelRate ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      travelRate: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="—"
                />
              </div>
              <p className="mt-2 text-[10.5px] text-slate-400">
                Les champs vides utilisent le taux horaire de base.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-3 w-3" />
                Annuler
              </Button>
              <Button variant="primary" size="sm" onClick={saveTier}>
                <Check className="h-3 w-3" strokeWidth={2.5} />
                Enregistrer
              </Button>
            </div>
          </div>
        )}

        {/* Tier list */}
        {tiers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <GraduationCap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-slate-600">
              Aucun niveau configuré
            </p>
            <p className="text-[12px] text-slate-400 mt-0.5">
              Cliquez sur « Charger les défauts » ou « Nouveau niveau »
              pour commencer
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 -mx-5">
            {tiers.map((tier, idx) => (
              <div
                key={tier.id}
                className="group flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === tiers.length - 1}
                    className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>

                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 text-white text-[11px] font-bold ring-1 ring-inset ring-current/20"
                  style={{ backgroundColor: tier.color }}
                >
                  {tier.shortCode}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-[13.5px] font-semibold text-slate-900">
                    {tier.name}
                  </h4>
                  {tier.description && (
                    <p className="text-[11.5px] text-slate-500 truncate">
                      {tier.description}
                    </p>
                  )}
                </div>

                {/* Rates */}
                <div className="flex items-center gap-3 text-[11.5px] tabular-nums">
                  <div>
                    <span className="text-slate-400">Taux : </span>
                    <span className="font-semibold text-slate-900">
                      {tier.hourlyRate.toFixed(2)} $/h
                    </span>
                  </div>
                  {tier.onsiteRate && (
                    <Badge variant="default" className="font-mono">
                      Site {tier.onsiteRate.toFixed(0)} $
                    </Badge>
                  )}
                  {tier.afterHoursRate && (
                    <Badge variant="default" className="font-mono">
                      AH {tier.afterHoursRate.toFixed(0)} $
                    </Badge>
                  )}
                  {tier.weekendRate && (
                    <Badge variant="default" className="font-mono">
                      WE {tier.weekendRate.toFixed(0)} $
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(tier)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTier(tier.id)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-blue-50/40 border border-blue-200/60 px-3 py-2.5 text-[11.5px] text-blue-900">
          💡 Les niveaux de support s&apos;appliquent automatiquement quand un
          ticket n&apos;est ni couvert par une banque d&apos;heures, ni par un
          forfait MSP. Vous pouvez assigner un niveau à chaque ticket lors de
          la saisie de temps.
        </div>
      </CardContent>
    </Card>
  );
}
