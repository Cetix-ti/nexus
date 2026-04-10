"use client";

import { useMemo, useState } from "react";
import {
  Wallet,
  Clock,
  Car,
  AlertTriangle,
  Settings2,
  CalendarRange,
  RotateCcw,
  Save,
  Sparkles,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  mockBillingProfiles,
  mockClientBillingOverrides,
} from "@/lib/billing/mock-data";
import { resolveClientBillingProfile } from "@/lib/billing/engine";
import type {
  BillingProfile,
  ClientBillingOverride,
} from "@/lib/billing/types";

interface ClientBillingOverridesSectionProps {
  organizationId: string;
  organizationName: string;
}

type NumericField =
  | "standardRate"
  | "onsiteRate"
  | "remoteRate"
  | "urgentRate"
  | "afterHoursRate"
  | "weekendRate"
  | "travelRate"
  | "ratePerKm"
  | "travelFlatFee"
  | "hourBankOverageRate"
  | "mspExcludedRate"
  | "minimumBillableMinutes"
  | "roundingIncrementMinutes";

const ALL_NUMERIC_FIELDS: NumericField[] = [
  "standardRate",
  "onsiteRate",
  "remoteRate",
  "urgentRate",
  "afterHoursRate",
  "weekendRate",
  "travelRate",
  "ratePerKm",
  "travelFlatFee",
  "hourBankOverageRate",
  "mspExcludedRate",
  "minimumBillableMinutes",
  "roundingIncrementMinutes",
];

function toDateInput(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fromDateInput(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(value + "T00:00:00Z").toISOString();
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString("fr-CA", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} $`;
}

interface RateFieldProps {
  label: string;
  field: NumericField;
  value: number | undefined;
  inheritedValue: number;
  unit: "currency" | "minutes" | "perKm";
  onChange: (field: NumericField, value: number | undefined) => void;
}

function RateField({
  label,
  field,
  value,
  inheritedValue,
  unit,
  onChange,
}: RateFieldProps) {
  const isOverridden = value !== undefined;

  const placeholder =
    unit === "currency"
      ? `Hérité : ${formatCurrency(inheritedValue)}`
      : unit === "perKm"
        ? `Hérité : ${inheritedValue.toFixed(2)} $/km`
        : `Hérité : ${inheritedValue} min`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[12px] font-medium text-slate-700">
          {label}
        </label>
        {isOverridden && (
          <button
            type="button"
            onClick={() => onChange(field, undefined)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 transition-colors hover:text-blue-600"
            title="Réinitialiser à la valeur héritée"
          >
            <RotateCcw className="h-3 w-3" />
            Réinitialiser
          </button>
        )}
      </div>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              onChange(field, undefined);
            } else {
              const parsed = parseFloat(v);
              if (!Number.isNaN(parsed)) onChange(field, parsed);
            }
          }}
          className={cn(
            "pr-12 transition-all",
            isOverridden &&
              "border-blue-400 bg-blue-50/40 ring-1 ring-blue-300/60 focus:bg-white"
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400">
          {unit === "currency" ? "$/h" : unit === "perKm" ? "$/km" : "min"}
        </span>
      </div>
      {isOverridden && (
        <p className="text-[11px] text-blue-600">
          Personnalisé · base : {unit === "currency"
            ? formatCurrency(inheritedValue)
            : unit === "perKm"
              ? `${inheritedValue.toFixed(2)} $/km`
              : `${inheritedValue} min`}
        </p>
      )}
    </div>
  );
}

export function ClientBillingOverridesSection({
  organizationId,
  organizationName,
}: ClientBillingOverridesSectionProps) {
  // Find existing override
  const existingOverride = useMemo(
    () =>
      mockClientBillingOverrides.find(
        (o) => o.organizationId === organizationId
      ),
    [organizationId]
  );

  // Pick base profile (existing override → its base, otherwise default)
  const baseProfile: BillingProfile = useMemo(() => {
    if (existingOverride) {
      const found = mockBillingProfiles.find(
        (p) => p.id === existingOverride.baseProfileId
      );
      if (found) return found;
    }
    return (
      mockBillingProfiles.find((p) => p.isDefault) || mockBillingProfiles[0]
    );
  }, [existingOverride]);

  // Local mutable state for the override
  const [overrideState, setOverrideState] = useState<ClientBillingOverride>(
    () =>
      existingOverride ?? {
        id: `cbo_new_${organizationId}`,
        organizationId,
        organizationName,
        baseProfileId: baseProfile.id,
        isActive: true,
        effectiveFrom: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const updateField = (field: NumericField, value: number | undefined) => {
    setOverrideState((prev) => {
      const next = { ...prev };
      if (value === undefined) {
        delete (next as Record<string, unknown>)[field];
      } else {
        (next as Record<string, unknown>)[field] = value;
      }
      return next;
    });
  };

  // Resolved profile (merged)
  const resolved = useMemo(
    () => resolveClientBillingProfile(baseProfile, overrideState),
    [baseProfile, overrideState]
  );

  const overriddenCount = ALL_NUMERIC_FIELDS.filter(
    (f) => overrideState[f] !== undefined
  ).length;
  const totalFields = ALL_NUMERIC_FIELDS.length;

  const handleSave = async () => {
    setSaving(true);
    // Simulate save (no real persistence — mock)
    await new Promise((r) => setTimeout(r, 400));
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString("fr-CA"));
  };

  const handleResetAll = () => {
    setOverrideState((prev) => {
      const next: ClientBillingOverride = {
        id: prev.id,
        organizationId: prev.organizationId,
        organizationName: prev.organizationName,
        baseProfileId: prev.baseProfileId,
        isActive: prev.isActive,
        effectiveFrom: prev.effectiveFrom,
        effectiveTo: prev.effectiveTo,
        notes: prev.notes,
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
      };
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Header card */}
      <Card className="overflow-hidden border-slate-200">
        <div className="relative bg-gradient-to-br from-blue-50 via-white to-indigo-50/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Tarifs spécifiques au client
                </h3>
                <p className="mt-0.5 text-[13px] text-slate-600">
                  Profil hérité :{" "}
                  <span className="font-medium text-slate-800">
                    {baseProfile.name}
                  </span>
                  {" — "}
                  <span className="text-slate-500">{baseProfile.description}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="primary">
                    <Sparkles className="h-3 w-3" />
                    {overriddenCount} champ{overriddenCount > 1 ? "s" : ""}{" "}
                    personnalisé{overriddenCount > 1 ? "s" : ""} sur{" "}
                    {totalFields}
                  </Badge>
                  <Badge variant={overrideState.isActive ? "success" : "default"}>
                    {overrideState.isActive ? "Actif" : "Inactif"}
                  </Badge>
                  {savedAt && (
                    <span className="text-[11px] text-slate-500">
                      Enregistré à {savedAt}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-[12px] font-medium text-slate-600">
                  Override actif
                </span>
                <Switch
                  checked={overrideState.isActive}
                  onCheckedChange={(checked) =>
                    setOverrideState((p) => ({ ...p, isActive: checked }))
                  }
                />
              </div>
              {overriddenCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetAll}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Tout réinitialiser
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </div>

          {overriddenCount > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200/70 bg-white/70 p-3 text-[12px] text-blue-900 backdrop-blur-sm">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                <strong>{organizationName}</strong> bénéficie de tarifs
                négociés. Les valeurs personnalisées remplacent celles du profil{" "}
                <strong>{baseProfile.name}</strong> lors de la facturation.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Hourly rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Clock className="h-4 w-4 text-blue-600" />
            Taux horaires
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RateField
              label="Standard"
              field="standardRate"
              value={overrideState.standardRate}
              inheritedValue={baseProfile.standardRate}
              unit="currency"
              onChange={updateField}
            />
            <RateField
              label="Sur site"
              field="onsiteRate"
              value={overrideState.onsiteRate}
              inheritedValue={baseProfile.onsiteRate}
              unit="currency"
              onChange={updateField}
            />
            <RateField
              label="À distance"
              field="remoteRate"
              value={overrideState.remoteRate}
              inheritedValue={baseProfile.remoteRate}
              unit="currency"
              onChange={updateField}
            />
            <RateField
              label="Urgent"
              field="urgentRate"
              value={overrideState.urgentRate}
              inheritedValue={baseProfile.urgentRate}
              unit="currency"
              onChange={updateField}
            />
            <RateField
              label="Après-heures"
              field="afterHoursRate"
              value={overrideState.afterHoursRate}
              inheritedValue={baseProfile.afterHoursRate}
              unit="currency"
              onChange={updateField}
            />
            <RateField
              label="Week-end"
              field="weekendRate"
              value={overrideState.weekendRate}
              inheritedValue={baseProfile.weekendRate}
              unit="currency"
              onChange={updateField}
            />
          </div>
        </CardContent>
      </Card>

      {/* Travel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Car className="h-4 w-4 text-blue-600" />
            Déplacements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RateField
              label="Taux horaire de déplacement"
              field="travelRate"
              value={overrideState.travelRate}
              inheritedValue={baseProfile.travelRate}
              unit="currency"
              onChange={updateField}
            />
            <RateField
              label="Taux au kilomètre"
              field="ratePerKm"
              value={overrideState.ratePerKm}
              inheritedValue={baseProfile.ratePerKm}
              unit="perKm"
              onChange={updateField}
            />
            <RateField
              label="Frais fixes par déplacement"
              field="travelFlatFee"
              value={overrideState.travelFlatFee}
              inheritedValue={baseProfile.travelFlatFee}
              unit="currency"
              onChange={updateField}
            />
          </div>
        </CardContent>
      </Card>

      {/* Overages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Dépassements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RateField
              label="Dépassement banque d'heures"
              field="hourBankOverageRate"
              value={overrideState.hourBankOverageRate}
              inheritedValue={baseProfile.hourBankOverageRate}
              unit="currency"
              onChange={updateField}
            />
            <RateField
              label="Hors forfait MSP"
              field="mspExcludedRate"
              value={overrideState.mspExcludedRate}
              inheritedValue={baseProfile.mspExcludedRate}
              unit="currency"
              onChange={updateField}
            />
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Settings2 className="h-4 w-4 text-blue-600" />
            Règles de facturation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RateField
              label="Minimum facturable"
              field="minimumBillableMinutes"
              value={overrideState.minimumBillableMinutes}
              inheritedValue={baseProfile.minimumBillableMinutes}
              unit="minutes"
              onChange={updateField}
            />
            <RateField
              label="Incrément d'arrondi"
              field="roundingIncrementMinutes"
              value={overrideState.roundingIncrementMinutes}
              inheritedValue={baseProfile.roundingIncrementMinutes}
              unit="minutes"
              onChange={updateField}
            />
          </div>
        </CardContent>
      </Card>

      {/* Validity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <CalendarRange className="h-4 w-4 text-blue-600" />
            Validité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-slate-700">
                Date d'entrée en vigueur
              </label>
              <Input
                type="date"
                value={toDateInput(overrideState.effectiveFrom)}
                onChange={(e) =>
                  setOverrideState((p) => ({
                    ...p,
                    effectiveFrom:
                      fromDateInput(e.target.value) ?? p.effectiveFrom,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-slate-700">
                Date de fin (optionnel)
              </label>
              <Input
                type="date"
                value={toDateInput(overrideState.effectiveTo)}
                onChange={(e) =>
                  setOverrideState((p) => ({
                    ...p,
                    effectiveTo: fromDateInput(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-4">
            <Textarea
              label="Notes internes"
              placeholder="Ex. : Tarifs négociés depuis janvier 2025 — contrat 3 ans"
              value={overrideState.notes ?? ""}
              onChange={(e) =>
                setOverrideState((p) => ({ ...p, notes: e.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Resolved summary */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Profil effectif après fusion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ALL_NUMERIC_FIELDS.map((f) => {
              const isOver = resolved.overriddenFields.includes(f);
              const val = (resolved as unknown as Record<string, number>)[f];
              const labelMap: Record<NumericField, string> = {
                standardRate: "Standard",
                onsiteRate: "Sur site",
                remoteRate: "À distance",
                urgentRate: "Urgent",
                afterHoursRate: "Après-heures",
                weekendRate: "Week-end",
                travelRate: "Déplacement",
                ratePerKm: "Au km",
                travelFlatFee: "Frais fixes",
                hourBankOverageRate: "Dépass. banque",
                mspExcludedRate: "Hors MSP",
                minimumBillableMinutes: "Min. facturable",
                roundingIncrementMinutes: "Arrondi",
              };
              const isMinutes =
                f === "minimumBillableMinutes" ||
                f === "roundingIncrementMinutes";
              const isPerKm = f === "ratePerKm";
              return (
                <div
                  key={f}
                  className={cn(
                    "rounded-lg border bg-white p-3 transition-colors",
                    isOver
                      ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200"
                      : "border-slate-200"
                  )}
                >
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {labelMap[f]}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-[15px] font-semibold",
                        isOver ? "text-blue-700" : "text-slate-900"
                      )}
                    >
                      {isMinutes
                        ? `${val} min`
                        : isPerKm
                          ? `${val.toFixed(2)} $/km`
                          : formatCurrency(val)}
                    </span>
                    {isOver && (
                      <span className="text-[10px] font-medium text-blue-600">
                        custom
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ClientBillingOverridesSection;
