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

// `urgentRate` reste dans le type pour compat (stocké en DB) mais n'est
// plus affiché dans l'UI — la politique tarifaire courante ne distingue
// plus l'urgence via un taux dédié.
const ALL_NUMERIC_FIELDS: NumericField[] = [
  "standardRate",
  "onsiteRate",
  "remoteRate",
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

// Types de facturation applicables à un client (multi-sélection).
type ClientBillingType = "hour_bank" | "professional_services" | "ftig";
const BILLING_TYPE_LABELS: Record<ClientBillingType, string> = {
  hour_bank: "Banque d'heures",
  professional_services: "Services professionnels",
  ftig: "FTIG",
};
const BILLING_TYPE_DESCRIPTIONS: Record<ClientBillingType, string> = {
  hour_bank: "Bloc d'heures prépayé, déduit au fur et à mesure.",
  professional_services: "Facturation à l'heure selon les taux négociés.",
  ftig: "Forfait de services gérés (mensuel ou fixe).",
};
const ALL_BILLING_TYPES: ClientBillingType[] = [
  "hour_bank",
  "professional_services",
  "ftig",
];
function loadClientBillingTypes(orgId: string): ClientBillingType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`nexus:client-billing-types:${orgId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is ClientBillingType =>
      ALL_BILLING_TYPES.includes(t as ClientBillingType),
    ) : [];
  } catch { return []; }
}
function saveClientBillingTypes(orgId: string, types: ClientBillingType[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`nexus:client-billing-types:${orgId}`, JSON.stringify(types));
  } catch { /* quota */ }
}

interface HourBankPayment {
  id: string;
  date?: string;    // ISO YYYY-MM-DD
  amount?: number;  // $
  note?: string;
}
interface HourBankConfig {
  startDate?: string;       // ISO (YYYY-MM-DD), début de validité de la banque
  endDate?: string;         // ISO (YYYY-MM-DD), fin de validité
  totalHours?: number;      // heures achetées
  hoursConsumed?: number;   // heures consommées à ce jour (saisie manuelle pour l'instant)
  hourlyRate?: number;      // taux horaire de la banque (consommé à ce prix)
  totalAmount?: number;     // montant total de la banque (heures × taux, souvent auto-calculé mais ajustable)
  overageRate?: number;     // taux appliqué en dépassement
  carryOver?: boolean;      // reporter les heures non utilisées en fin de période
  payments?: HourBankPayment[];  // paiements reçus du client
}
interface FtigConfig {
  // Méthode de calcul du forfait
  calculationMethod?: "per_user" | "per_device";
  unitCount?: number;              // nombre d'utilisateurs ou d'appareils
  unitPrice?: number;              // prix par unité (selon méthode)
  // Inclusions dans le forfait (par mois)
  includedTravelCount?: number;    // nombre de déplacements inclus / mois
  includedEveningHours?: number;   // heures de soir incluses / mois
  eveningCarryOver?: boolean;      // reporter les heures de soir non utilisées
  includedOnsiteHours?: number;    // heures sur place incluses / mois
  // Montants
  monthlyAmount?: number;          // montant mensuel facturé au client
  baseCost?: number;               // coûts de base MSP associés (interne)
}
function loadHourBankConfig(orgId: string): HourBankConfig {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(`nexus:client-hour-bank:${orgId}`) || "{}"); } catch { return {}; }
}
function saveHourBankConfig(orgId: string, cfg: HourBankConfig) {
  try { localStorage.setItem(`nexus:client-hour-bank:${orgId}`, JSON.stringify(cfg)); } catch {}
}
function loadFtigConfig(orgId: string): FtigConfig {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(`nexus:client-ftig:${orgId}`) || "{}"); } catch { return {}; }
}
function saveFtigConfig(orgId: string, cfg: FtigConfig) {
  try { localStorage.setItem(`nexus:client-ftig:${orgId}`, JSON.stringify(cfg)); } catch {}
}

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

  // Type(s) de facturation applicable(s) au client (multi-sélection).
  // Persisté en localStorage — quand on aura un vrai modèle DB, remplacer
  // ces loaders par un appel API.
  const [billingTypes, setBillingTypes] = useState<ClientBillingType[]>(
    () => loadClientBillingTypes(organizationId),
  );
  const [hourBankCfg, setHourBankCfg] = useState<HourBankConfig>(
    () => loadHourBankConfig(organizationId),
  );
  const [ftigCfg, setFtigCfg] = useState<FtigConfig>(
    () => loadFtigConfig(organizationId),
  );
  const toggleBillingType = (t: ClientBillingType) => {
    setBillingTypes((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      saveClientBillingTypes(organizationId, next);
      return next;
    });
  };
  const updateHourBank = (patch: Partial<HourBankConfig>) => {
    setHourBankCfg((prev) => {
      const next = { ...prev, ...patch };
      saveHourBankConfig(organizationId, next);
      return next;
    });
  };
  const updateFtig = (patch: Partial<FtigConfig>) => {
    setFtigCfg((prev) => {
      const next = { ...prev, ...patch };
      saveFtigConfig(organizationId, next);
      return next;
    });
  };
  // Si aucun type n'est sélectionné, on affiche les sections "classiques"
  // (taux horaires + déplacements) par défaut — équivalent historique
  // avant l'introduction du sélecteur.
  const hasAnyType = billingTypes.length > 0;
  const showProfessionalServices = !hasAnyType || billingTypes.includes("professional_services");
  const showHourBank = billingTypes.includes("hour_bank");
  const showFtig = billingTypes.includes("ftig");

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

      {/* Types de facturation applicables au client */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Wallet className="h-4 w-4 text-blue-600" />
            Types de facturation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[12px] text-slate-500">
            Sélectionne le ou les types applicables à ce client. Chaque type
            affiche ses propres paramètres ci-dessous.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ALL_BILLING_TYPES.map((t) => {
              const active = billingTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleBillingType(t)}
                  className={cn(
                    "text-left rounded-lg border px-3 py-2.5 transition-all",
                    active
                      ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                      "text-[13px] font-semibold",
                      active ? "text-blue-700" : "text-slate-800",
                    )}>
                      {BILLING_TYPE_LABELS[t]}
                    </span>
                    <span
                      className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center text-[10px] font-bold shrink-0",
                        active ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-transparent",
                      )}
                    >
                      ✓
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-slate-500 leading-snug">
                    {BILLING_TYPE_DESCRIPTIONS[t]}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Banque d'heures — visible seulement si sélectionnée */}
      {showHourBank && (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <Wallet className="h-4 w-4 text-emerald-600" />
              Banque d&apos;heures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Date de début
                </label>
                <Input
                  type="date"
                  value={hourBankCfg.startDate ?? ""}
                  onChange={(e) => updateHourBank({ startDate: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Date de fin
                </label>
                <Input
                  type="date"
                  value={hourBankCfg.endDate ?? ""}
                  onChange={(e) => updateHourBank({ endDate: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Heures achetées (total)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex : 40"
                  value={hourBankCfg.totalHours ?? ""}
                  onChange={(e) => {
                    const hours = e.target.value === "" ? undefined : Number(e.target.value);
                    // Auto-calcule le montant si le taux est défini et que
                    // l'utilisateur n'a pas saisi un montant manuel différent.
                    const rate = hourBankCfg.hourlyRate;
                    const autoAmount =
                      hours !== undefined && rate !== undefined
                        ? Math.round(hours * rate * 100) / 100
                        : undefined;
                    updateHourBank({
                      totalHours: hours,
                      ...(autoAmount !== undefined ? { totalAmount: autoAmount } : {}),
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Taux horaire de la banque
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex : 125"
                  value={hourBankCfg.hourlyRate ?? ""}
                  onChange={(e) => {
                    const rate = e.target.value === "" ? undefined : Number(e.target.value);
                    const hours = hourBankCfg.totalHours;
                    const autoAmount =
                      hours !== undefined && rate !== undefined
                        ? Math.round(hours * rate * 100) / 100
                        : undefined;
                    updateHourBank({
                      hourlyRate: rate,
                      ...(autoAmount !== undefined ? { totalAmount: autoAmount } : {}),
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700 flex items-center justify-between gap-2">
                  <span>Montant de la banque ($)</span>
                  {hourBankCfg.totalHours !== undefined &&
                    hourBankCfg.hourlyRate !== undefined && (
                      <span className="text-[10.5px] font-normal text-slate-400">
                        auto = {Math.round(hourBankCfg.totalHours * hourBankCfg.hourlyRate * 100) / 100} $
                      </span>
                    )}
                </label>
                <Input
                  type="number"
                  min={0}
                  step={10}
                  placeholder="Auto ou manuel"
                  value={hourBankCfg.totalAmount ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    updateHourBank({ totalAmount: v });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Taux en dépassement
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex : 135"
                  value={hourBankCfg.overageRate ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    updateHourBank({ overageRate: v });
                  }}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 w-full">
                  <Switch
                    checked={!!hourBankCfg.carryOver}
                    onCheckedChange={(c) => updateHourBank({ carryOver: c })}
                  />
                  <span className="text-[12px] font-medium text-slate-700">
                    Reporter les heures non utilisées en fin de période
                  </span>
                </div>
              </div>
            </div>

            {/* Paiements reçus du client */}
            {(() => {
              const payments = hourBankCfg.payments && hourBankCfg.payments.length > 0
                ? hourBankCfg.payments
                : [{ id: "default", date: "", amount: undefined }];
              const setPayments = (next: HourBankPayment[]) =>
                updateHourBank({ payments: next });
              const updatePayment = (id: string, patch: Partial<HourBankPayment>) => {
                setPayments(payments.map((p) => (p.id === id ? { ...p, ...patch } : p)));
              };
              const addPayment = () => {
                setPayments([
                  ...payments,
                  { id: `pay_${Date.now()}`, date: "", amount: undefined },
                ]);
              };
              const removePayment = (id: string) => {
                const next = payments.filter((p) => p.id !== id);
                setPayments(next.length ? next : [{ id: "default", date: "", amount: undefined }]);
              };
              const totalPaid = payments.reduce(
                (s, p) => s + (typeof p.amount === "number" ? p.amount : 0),
                0,
              );
              return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      Dates de paiement
                    </h4>
                    <button
                      type="button"
                      onClick={addPayment}
                      className="text-[11.5px] font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded px-2 py-1 transition-colors"
                    >
                      + Ajouter une date
                    </button>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">
                    À titre indicatif — dates et montants prévus pour cette banque
                    d&apos;heures. Pas un suivi de paiements réels.
                  </p>
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_160px_1fr_auto] items-end rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="space-y-1">
                          <label className="text-[10.5px] uppercase tracking-wider text-slate-400 font-medium">
                            Date
                          </label>
                          <Input
                            type="date"
                            value={p.date ?? ""}
                            onChange={(e) => updatePayment(p.id, { date: e.target.value || undefined })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10.5px] uppercase tracking-wider text-slate-400 font-medium">
                            Montant ($)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="0.00"
                            value={p.amount ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? undefined : Number(e.target.value);
                              updatePayment(p.id, { amount: v });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10.5px] uppercase tracking-wider text-slate-400 font-medium">
                            Note (optionnel)
                          </label>
                          <Input
                            placeholder="Ex : Virement bancaire, facture #INV-042…"
                            value={p.note ?? ""}
                            onChange={(e) => updatePayment(p.id, { note: e.target.value || undefined })}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePayment(p.id)}
                          className="h-9 w-9 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                          title="Retirer ce paiement"
                        >
                          <RotateCcw className="h-3.5 w-3.5 rotate-45" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {payments.length > 1 && totalPaid > 0 && (
                    <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400">
                      <span>Total prévu :</span>
                      <span className="tabular-nums">
                        {totalPaid.toLocaleString("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} $
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Heures consommées (saisie manuelle pour l'instant) + résumé */}
            {(() => {
              const total = hourBankCfg.totalHours;
              const consumed = hourBankCfg.hoursConsumed ?? 0;
              const remaining =
                total !== undefined ? Math.max(0, total - consumed) : undefined;
              const end = hourBankCfg.endDate ? new Date(hourBankCfg.endDate) : null;
              const now = new Date();
              const monthsRemaining =
                end && end.getTime() > now.getTime()
                  ? Math.max(
                      1,
                      (end.getFullYear() - now.getFullYear()) * 12 +
                        (end.getMonth() - now.getMonth()) +
                        (end.getDate() >= now.getDate() ? 1 : 0),
                    )
                  : null;
              const hoursPerMonth =
                remaining !== undefined && monthsRemaining
                  ? Math.round((remaining / monthsRemaining) * 10) / 10
                  : null;
              const pctUsed =
                total !== undefined && total > 0
                  ? Math.min(100, Math.round((consumed / total) * 100))
                  : null;
              return (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-emerald-700">
                    État de la banque
                  </h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className="text-[11.5px] font-medium text-slate-700">
                        Heures consommées à ce jour
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step={0.25}
                        placeholder="0"
                        value={hourBankCfg.hoursConsumed ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          updateHourBank({ hoursConsumed: v });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-emerald-700/70 font-medium">
                        Heures restantes
                      </p>
                      <p className="text-[22px] font-semibold text-emerald-800 tabular-nums leading-tight">
                        {remaining !== undefined ? remaining : "—"}
                        {total !== undefined && (
                          <span className="ml-1 text-[12px] font-normal text-slate-500">
                            / {total} h
                          </span>
                        )}
                      </p>
                      {pctUsed !== null && (
                        <div className="mt-1 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              pctUsed > 90 ? "bg-red-500" : pctUsed > 70 ? "bg-amber-500" : "bg-emerald-500",
                            )}
                            style={{ width: `${pctUsed}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-emerald-700/70 font-medium">
                        Capacité / mois restante
                      </p>
                      <p className="text-[22px] font-semibold text-emerald-800 tabular-nums leading-tight">
                        {hoursPerMonth !== null ? hoursPerMonth : "—"}
                        <span className="ml-1 text-[12px] font-normal text-slate-500">
                          h/mois
                        </span>
                      </p>
                      <p className="text-[10.5px] text-slate-500 leading-snug">
                        {monthsRemaining
                          ? `Sur ${monthsRemaining} mois d'ici la date de fin`
                          : end
                            ? "Date de fin dépassée"
                            : "Ajoute une date de fin pour calculer"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* FTIG — forfait TI gérés, visible seulement si sélectionné */}
      {showFtig && (() => {
        const autoMonthly =
          ftigCfg.unitCount !== undefined && ftigCfg.unitPrice !== undefined
            ? Math.round(ftigCfg.unitCount * ftigCfg.unitPrice * 100) / 100
            : undefined;
        const margin =
          ftigCfg.monthlyAmount !== undefined && ftigCfg.baseCost !== undefined
            ? Math.round((ftigCfg.monthlyAmount - ftigCfg.baseCost) * 100) / 100
            : undefined;
        const marginPct =
          margin !== undefined &&
          ftigCfg.monthlyAmount !== undefined &&
          ftigCfg.monthlyAmount > 0
            ? Math.round((margin / ftigCfg.monthlyAmount) * 100)
            : undefined;
        const unitLabel =
          ftigCfg.calculationMethod === "per_device"
            ? "appareil"
            : ftigCfg.calculationMethod === "per_user"
              ? "utilisateur"
              : "unité";
        return (
        <Card className="border-violet-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <Sparkles className="h-4 w-4 text-violet-600" />
              FTIG (Forfait TI gérés)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Méthode de calcul */}
            <div>
              <label className="text-[12px] font-medium text-slate-700 mb-2 block">
                Méthode de calcul
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { id: "per_user" as const, label: "Par utilisateur", hint: "Prix multiplié par le nombre d'usagers supportés" },
                  { id: "per_device" as const, label: "Par appareil", hint: "Prix multiplié par le nombre d'appareils gérés" },
                ].map((m) => {
                  const active = ftigCfg.calculationMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateFtig({ calculationMethod: m.id })}
                      className={cn(
                        "text-left rounded-lg border px-3 py-2.5 transition-all",
                        active
                          ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-[13px] font-semibold", active ? "text-violet-700" : "text-slate-800")}>
                          {m.label}
                        </span>
                        <span
                          className={cn(
                            "h-3.5 w-3.5 rounded-full border-2 shrink-0",
                            active ? "border-violet-600 bg-violet-600 ring-2 ring-white" : "border-slate-300",
                          )}
                        />
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-slate-500 leading-snug">{m.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Unités + prix */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Nombre d&apos;{unitLabel}s
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex : 25"
                  value={ftigCfg.unitCount ?? ""}
                  onChange={(e) => {
                    const count = e.target.value === "" ? undefined : Number(e.target.value);
                    const price = ftigCfg.unitPrice;
                    const auto = count !== undefined && price !== undefined
                      ? Math.round(count * price * 100) / 100
                      : undefined;
                    updateFtig({
                      unitCount: count,
                      ...(auto !== undefined ? { monthlyAmount: auto } : {}),
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Prix par {unitLabel} ($/mois)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex : 75"
                  value={ftigCfg.unitPrice ?? ""}
                  onChange={(e) => {
                    const price = e.target.value === "" ? undefined : Number(e.target.value);
                    const count = ftigCfg.unitCount;
                    const auto = count !== undefined && price !== undefined
                      ? Math.round(count * price * 100) / 100
                      : undefined;
                    updateFtig({
                      unitPrice: price,
                      ...(auto !== undefined ? { monthlyAmount: auto } : {}),
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700 flex items-center justify-between gap-2">
                  <span>Montant mensuel client ($)</span>
                  {autoMonthly !== undefined && (
                    <span className="text-[10.5px] font-normal text-slate-400">
                      auto = {autoMonthly} $
                    </span>
                  )}
                </label>
                <Input
                  type="number"
                  min={0}
                  step={10}
                  placeholder="Auto ou manuel"
                  value={ftigCfg.monthlyAmount ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    updateFtig({ monthlyAmount: v });
                  }}
                />
              </div>
            </div>

            {/* Coûts de base MSP + marge calculée */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Coûts de base MSP ($/mois)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={10}
                  placeholder="Ex : 650"
                  value={ftigCfg.baseCost ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    updateFtig({ baseCost: v });
                  }}
                />
                <p className="text-[10.5px] text-slate-400 leading-snug">
                  Coûts internes (licences, RMM, techs, etc.) tenant compte des inclusions.
                </p>
              </div>
              {margin !== undefined && (
                <div className="sm:col-span-2 lg:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 flex items-center gap-3">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-700">
                    Marge mensuelle estimée
                  </div>
                  <div className="text-[18px] font-semibold text-emerald-800 tabular-nums">
                    {margin.toLocaleString("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} $
                  </div>
                  {marginPct !== undefined && (
                    <span className="text-[11.5px] text-emerald-600">
                      ({marginPct}% du revenu)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Inclusions */}
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Inclusions dans le forfait
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Déplacements inclus / mois
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0 = aucun"
                    value={ftigCfg.includedTravelCount ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateFtig({ includedTravelCount: v });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Heures sur place / mois
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="0 = aucune"
                    value={ftigCfg.includedOnsiteHours ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateFtig({ includedOnsiteHours: v });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Heures de soir / mois
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="0 = aucune"
                    value={ftigCfg.includedEveningHours ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateFtig({ includedEveningHours: v });
                    }}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <Switch
                      checked={!!ftigCfg.eveningCarryOver}
                      onCheckedChange={(c) => updateFtig({ eveningCarryOver: c })}
                    />
                    <span className="text-[12px] font-medium text-slate-700">
                      Reporter les heures de soir non utilisées d&apos;un mois à l&apos;autre
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}

      {/* Sections "Services professionnels" : taux, déplacements, règles.
          Visible si SP est coché OU si aucun type n'est encore sélectionné
          (défaut rétro-compatible pour les orgs existantes). */}
      {showProfessionalServices && (
        <>
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
        </>
      )}

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
                urgentRate: "Urgent",  // non-affiché car retiré de ALL_NUMERIC_FIELDS
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
