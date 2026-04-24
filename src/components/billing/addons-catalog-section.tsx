"use client";

// ============================================================================
// Catalogue d'abonnements supplémentaires — composant admin.
//
// Liste des services connexes vendus (ex: licences M365, antivirus managé,
// sauvegarde Veeam). Chaque entrée a un prix de référence ; l'assignation
// à une org peut avoir un prix négocié différent.
//
// Fonctionnalités :
//   - CRUD du catalogue (ajouter, renommer, changer prix, désactiver).
//   - Voir combien d'orgs utilisent chaque addon (comptage des assignations
//     actives).
//   - Cliquer sur une ligne ouvre un panneau latéral avec la liste des orgs
//     qui l'utilisent et leur prix négocié.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Save,
  X,
  Package,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Addon {
  id: string;
  name: string;
  description: string;
  defaultMonthlyPrice: number;
  active: boolean;
  sortOrder: number;
  usageCount: number;
}

interface Assignment {
  id: string;
  organizationId: string;
  organizationName: string;
  quantity: number;
  monthlyPrice: number;
  effectivePrice: number;
  isPriceOverridden: boolean;
  active: boolean;
}

function fmtMoney(v: number): string {
  return v.toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AddonsCatalogSection() {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/v1/billing/addons");
    if (r.ok) {
      const d = await r.json();
      setAddons(d.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!newName.trim() || !newPrice) return;
    setSaving(true);
    await fetch("/api/v1/billing/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        defaultMonthlyPrice: Number(newPrice),
      }),
    });
    setSaving(false);
    setNewName("");
    setNewDescription("");
    setNewPrice("");
    load();
  }

  async function update(id: string, patch: Partial<Addon>) {
    await fetch("/api/v1/billing/addons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    load();
  }

  async function remove(a: Addon) {
    if (!confirm(
      `Supprimer « ${a.name} » du catalogue ?\n${
        a.usageCount > 0
          ? `${a.usageCount} organisation${a.usageCount > 1 ? "s" : ""} l'utilise${a.usageCount > 1 ? "nt" : ""} — elles perdront cette assignation.`
          : ""
      }`,
    )) return;
    await fetch(`/api/v1/billing/addons?id=${a.id}`, { method: "DELETE" });
    if (selectedAddonId === a.id) setSelectedAddonId(null);
    load();
  }

  const selected = addons.find((a) => a.id === selectedAddonId) ?? null;

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              Catalogue d&apos;abonnements supplémentaires
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Services connexes que vous vendez à vos clients (antivirus, sauvegarde,
              licences, etc.). Chaque service peut être assigné à une ou plusieurs
              organisations avec un prix spécifique par client.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="py-6 text-center text-[13px] text-slate-400">Chargement…</p>
        ) : addons.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-slate-400 rounded-lg border border-dashed border-slate-300 bg-slate-50/40">
            Aucun abonnement dans le catalogue — ajoutez-en un ci-dessous.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
            {/* Liste */}
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Abonnement</th>
                    <th className="px-3 py-2 text-right">Prix défaut</th>
                    <th className="px-3 py-2 text-center">Clients</th>
                    <th className="px-3 py-2 text-center">Actif</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {addons.map((a) => (
                    <AddonRow
                      key={a.id}
                      a={a}
                      editing={editingId === a.id}
                      onSelect={() => setSelectedAddonId(a.id)}
                      isSelected={selectedAddonId === a.id}
                      onStartEdit={() => setEditingId(a.id)}
                      onSaveEdit={async (patch) => {
                        await update(a.id, patch);
                        setEditingId(null);
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onToggleActive={() => update(a.id, { active: !a.active })}
                      onDelete={() => remove(a)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Panneau latéral : détail d'un addon */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              {selected ? (
                <AddonDetailPanel addon={selected} />
              ) : (
                <p className="text-[12.5px] text-slate-400 italic text-center py-8">
                  Clique sur un abonnement pour voir les organisations qui l&apos;utilisent.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Formulaire d'ajout */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Ajouter un abonnement
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Nom</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Antivirus managé Bitdefender"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Description (optionnel)</label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Par poste, par mois…"
              />
            </div>
            <div className="w-32">
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Prix ($/mois)</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={add}
              disabled={saving || !newName.trim() || !newPrice}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Ajouter
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddonRow({
  a, editing, isSelected, onSelect, onStartEdit, onSaveEdit, onCancelEdit,
  onToggleActive, onDelete,
}: {
  a: Addon;
  editing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: (patch: Partial<Addon>) => Promise<void>;
  onCancelEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(a.name);
  const [description, setDescription] = useState(a.description);
  const [price, setPrice] = useState(String(a.defaultMonthlyPrice));

  useEffect(() => {
    if (editing) {
      setName(a.name);
      setDescription(a.description);
      setPrice(String(a.defaultMonthlyPrice));
    }
  }, [editing, a]);

  if (editing) {
    return (
      <tr className="bg-blue-50/40">
        <td className="px-3 py-2">
          <div className="space-y-1.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optionnel)"
            />
          </div>
        </td>
        <td className="px-3 py-2 text-right">
          <Input
            type="number"
            min={0}
            step={0.01}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 tabular-nums text-right"
          />
        </td>
        <td className="px-3 py-2 text-center text-slate-500">{a.usageCount}</td>
        <td className="px-3 py-2 text-center">
          <span className={a.active ? "text-emerald-600" : "text-slate-400"}>
            {a.active ? "Oui" : "Non"}
          </span>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() =>
                onSaveEdit({
                  name: name.trim(),
                  description,
                  defaultMonthlyPrice: Number(price) || 0,
                })
              }
              className="h-7 w-7 inline-flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50"
              title="Enregistrer"
            >
              <Save className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100"
              title="Annuler"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={`hover:bg-slate-50 cursor-pointer ${isSelected ? "bg-blue-50/40" : ""}`}
      onClick={onSelect}
    >
      <td className="px-3 py-2">
        <p className={`font-medium ${a.active ? "text-slate-800" : "text-slate-400"}`}>{a.name}</p>
        {a.description && (
          <p className="text-[11.5px] text-slate-500 truncate">{a.description}</p>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">
        {a.defaultMonthlyPrice.toLocaleString("fr-CA", {
          style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2,
        })}
      </td>
      <td className="px-3 py-2 text-center">
        {a.usageCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-blue-700">
            {a.usageCount} <ChevronRight className="h-3 w-3" />
          </span>
        ) : (
          <span className="text-[11.5px] text-slate-400">0</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
          className={`text-[11.5px] font-semibold ${a.active ? "text-emerald-700" : "text-slate-400"}`}
        >
          {a.active ? "Oui" : "Non"}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-blue-600"
            title="Modifier"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-500"
            title="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddonDetailPanel({ addon }: { addon: Addon }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/billing/addons/${addon.id}/assignments`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setAssignments(d.data ?? []))
      .finally(() => setLoading(false));
  }, [addon.id]);

  const totalMrr = assignments
    .filter((a) => a.active)
    .reduce((s, a) => s + a.effectivePrice, 0);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11.5px] uppercase tracking-wider text-slate-500 font-semibold">
          Assignations actives
        </p>
        <p className="text-[22px] font-bold text-slate-900 tabular-nums mt-0.5">
          {fmtMoney(totalMrr)}
          <span className="text-[11.5px] font-normal text-slate-500 ml-1">/ mois</span>
        </p>
      </div>

      {loading ? (
        <p className="text-[12px] text-slate-400">Chargement…</p>
      ) : assignments.length === 0 ? (
        <p className="text-[12.5px] text-slate-500 italic">
          Aucune organisation n&apos;utilise cet abonnement. Assigne-le depuis la
          fiche facturation d&apos;une organisation.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {assignments.map((a) => (
            <li
              key={a.id}
              className={`rounded-md border bg-white px-2.5 py-1.5 text-[12px] ${
                a.active ? "border-slate-200" : "border-slate-200 opacity-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/organisations/${a.organizationId}`}
                  className="font-medium text-slate-800 truncate hover:text-blue-600"
                >
                  {a.organizationName}
                </Link>
                <span className="tabular-nums font-semibold text-slate-700 shrink-0">
                  {fmtMoney(a.effectivePrice)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {a.quantity > 1 && <>{a.quantity} × </>}
                {fmtMoney(a.monthlyPrice)}
                {a.isPriceOverridden && (
                  <span className="ml-1 text-blue-600">(prix négocié)</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
