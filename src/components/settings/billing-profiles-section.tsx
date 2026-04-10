"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Copy, Trash2, X, DollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  TIME_TYPE_LABELS,
  type BillingProfile,
  type TimeType,
} from "@/lib/billing/types";

const ALL_TIME_TYPES = Object.keys(TIME_TYPE_LABELS) as TimeType[];

function fmt(n: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function RateCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-slate-900">
        {value}
      </div>
    </div>
  );
}

export function BillingProfilesSection() {
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [editing, setEditing] = useState<BillingProfile | null>(null);
  const [creating, setCreating] = useState(false);

  function toggleActive(id: string) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p))
    );
  }

  function duplicate(p: BillingProfile) {
    const copy: BillingProfile = {
      ...p,
      id: `${p.id}_copy_${Date.now()}`,
      name: `${p.name} (copie)`,
      isDefault: false,
    };
    setProfiles((prev) => [...prev, copy]);
  }

  function remove(id: string) {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  function save(updated: BillingProfile) {
    setProfiles((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      return exists
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : [...prev, updated];
    });
    setEditing(null);
    setCreating(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Profils de facturation
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Définissez les taux horaires et règles de facturation
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nouveau profil
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[16px] font-semibold tracking-tight text-slate-900">
                    {p.name}
                  </h3>
                  {p.isDefault && <Badge variant="primary">Par défaut</Badge>}
                  {!p.isActive && <Badge variant="default">Inactif</Badge>}
                </div>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  {p.description}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(p)}
                  title="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => duplicate(p)}
                  title="Dupliquer"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {!p.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(p.id)}
                    title="Supprimer"
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <RateCell label="Standard" value={`${fmt(p.standardRate)}/h`} />
              <RateCell label="Sur site" value={`${fmt(p.onsiteRate)}/h`} />
              <RateCell label="À distance" value={`${fmt(p.remoteRate)}/h`} />
              <RateCell label="Urgent" value={`${fmt(p.urgentRate)}/h`} />
              <RateCell label="Après-heures" value={`${fmt(p.afterHoursRate)}/h`} />
              <RateCell label="Week-end" value={`${fmt(p.weekendRate)}/h`} />
            </div>

            <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Déplacements
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-[12.5px]">
                <div>
                  <span className="text-slate-500">Taux horaire</span>
                  <div className="font-medium tabular-nums text-slate-900">
                    {fmt(p.travelRate)}/h
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Taux/km</span>
                  <div className="font-medium tabular-nums text-slate-900">
                    {fmt(p.ratePerKm)}/km
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Frais fixes</span>
                  <div className="font-medium tabular-nums text-slate-900">
                    {fmt(p.travelFlatFee)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
              <div className="rounded-lg border border-slate-200/80 px-3 py-2">
                <div className="text-slate-500">Dépassement banque</div>
                <div className="font-semibold tabular-nums text-slate-900">
                  {fmt(p.hourBankOverageRate)}/h
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/80 px-3 py-2">
                <div className="text-slate-500">Hors forfait MSP</div>
                <div className="font-semibold tabular-nums text-slate-900">
                  {fmt(p.mspExcludedRate)}/h
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[12.5px] text-slate-600">
              <span>
                Min facturable :{" "}
                <span className="font-medium text-slate-900">
                  {p.minimumBillableMinutes} min
                </span>
              </span>
              <span>
                Arrondi :{" "}
                <span className="font-medium text-slate-900">
                  {p.roundingIncrementMinutes} min
                </span>
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={p.isActive}
                  onCheckedChange={() => toggleActive(p.id)}
                />
                <span className="text-[12.5px] text-slate-600">
                  {p.isActive ? "Profil actif" : "Profil désactivé"}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                <DollarSign className="inline h-3 w-3" /> {p.billableTimeTypes.length} types
                facturables
              </div>
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <BillingProfileModal
          profile={
            editing || {
              id: `bp_new_${Date.now()}`,
              name: "",
              description: "",
              standardRate: 125,
              onsiteRate: 145,
              remoteRate: 125,
              urgentRate: 195,
              afterHoursRate: 175,
              weekendRate: 195,
              travelRate: 95,
              ratePerKm: 0.65,
              travelFlatFee: 0,
              hourBankOverageRate: 145,
              mspExcludedRate: 165,
              minimumBillableMinutes: 15,
              roundingIncrementMinutes: 15,
              billableTimeTypes: ["remote_work", "onsite_work"],
              isDefault: false,
              isActive: true,
              createdAt: new Date().toISOString(),
            }
          }
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function BillingProfileModal({
  profile,
  onClose,
  onSave,
}: {
  profile: BillingProfile;
  onClose: () => void;
  onSave: (p: BillingProfile) => void;
}) {
  const [draft, setDraft] = useState<BillingProfile>(profile);

  function set<K extends keyof BillingProfile>(key: K, value: BillingProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleTimeType(t: TimeType) {
    setDraft((d) => ({
      ...d,
      billableTimeTypes: d.billableTimeTypes.includes(t)
        ? d.billableTimeTypes.filter((x) => x !== t)
        : [...d.billableTimeTypes, t],
    }));
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-6">
      <div className="relative my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <DollarSign className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {profile.name ? "Modifier le profil" : "Nouveau profil"}
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Configuration complète des taux et règles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft);
          }}
          className="space-y-6 p-6"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Nom du profil"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
            <Input
              label="Description"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div>
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Taux horaires
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Input
                label="Standard"
                type="number"
                value={draft.standardRate}
                onChange={(e) => set("standardRate", Number(e.target.value))}
              />
              <Input
                label="Sur site"
                type="number"
                value={draft.onsiteRate}
                onChange={(e) => set("onsiteRate", Number(e.target.value))}
              />
              <Input
                label="À distance"
                type="number"
                value={draft.remoteRate}
                onChange={(e) => set("remoteRate", Number(e.target.value))}
              />
              <Input
                label="Urgent"
                type="number"
                value={draft.urgentRate}
                onChange={(e) => set("urgentRate", Number(e.target.value))}
              />
              <Input
                label="Après-heures"
                type="number"
                value={draft.afterHoursRate}
                onChange={(e) => set("afterHoursRate", Number(e.target.value))}
              />
              <Input
                label="Week-end"
                type="number"
                value={draft.weekendRate}
                onChange={(e) => set("weekendRate", Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Déplacements
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Taux horaire"
                type="number"
                value={draft.travelRate}
                onChange={(e) => set("travelRate", Number(e.target.value))}
              />
              <Input
                label="Taux/km"
                type="number"
                step="0.01"
                value={draft.ratePerKm}
                onChange={(e) => set("ratePerKm", Number(e.target.value))}
              />
              <Input
                label="Frais fixes"
                type="number"
                value={draft.travelFlatFee}
                onChange={(e) => set("travelFlatFee", Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Taux spéciaux
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Dépassement banque"
                type="number"
                value={draft.hourBankOverageRate}
                onChange={(e) =>
                  set("hourBankOverageRate", Number(e.target.value))
                }
              />
              <Input
                label="Hors forfait MSP"
                type="number"
                value={draft.mspExcludedRate}
                onChange={(e) => set("mspExcludedRate", Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Règles d&apos;arrondi
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Minimum facturable (min)"
                type="number"
                value={draft.minimumBillableMinutes}
                onChange={(e) =>
                  set("minimumBillableMinutes", Number(e.target.value))
                }
              />
              <Input
                label="Incrément d'arrondi (min)"
                type="number"
                value={draft.roundingIncrementMinutes}
                onChange={(e) =>
                  set("roundingIncrementMinutes", Number(e.target.value))
                }
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Types de temps facturables
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_TIME_TYPES.map((t) => {
                const checked = draft.billableTimeTypes.includes(t);
                return (
                  <label
                    key={t}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200/80 px-3 py-2 text-[12.5px] hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTimeType(t)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-700">{TIME_TYPE_LABELS[t]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/40 px-4 py-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={draft.isActive}
                onCheckedChange={(v) => set("isActive", v)}
              />
              <span className="text-[13px] text-slate-700">Profil actif</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={draft.isDefault}
                onCheckedChange={(v) => set("isDefault", v)}
              />
              <span className="text-[13px] text-slate-700">Profil par défaut</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
