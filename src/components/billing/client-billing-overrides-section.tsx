"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Clock,
  Car,
  RotateCcw,
  Save,
  Sparkles,
  Info,
  X,
  Edit3,
  Undo2,
  Redo2,
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
import { OrgAddonsSection } from "@/components/billing/org-addons-section";
import { mockBillingProfiles } from "@/lib/billing/mock-data";
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
  // Push à l'API : autorité partagée entre agents (avant : localStorage
  // ne se propageait pas → Bruno active "Services pro", Marcel ne voit rien).
  void fetch(`/api/v1/organizations/${encodeURIComponent(orgId)}/billing-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ billingTypes: types }),
  }).catch(() => {});
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
  overageRate?: number;     // taux appliqué en dépassement (heures régulières au-delà de la banque)
  carryOver?: boolean;      // reporter les heures non utilisées en fin de période
  // Inclusions dans la banque. Par défaut (frequencyMonths absent ou 0)
  // les quantités s'appliquent SUR LA DURÉE TOTALE du contrat. Si une
  // fréquence est définie, la quantité se renouvelle tous les N mois
  // (ex: 5 déplacements tous les 3 mois). Permet aux contrats avec
  // crédit récurrent (ex: forfait trimestriel inclus) sans avoir à
  // multiplier la quantité × nombre de périodes.
  includedTravelCount?: number;     // nombre de déplacements inclus
  includedTravelFrequencyMonths?: number;
  includedOnsiteHours?: number;     // heures sur place incluses
  includedOnsiteFrequencyMonths?: number;
  includedEveningHours?: number;    // heures de soir incluses
  includedEveningFrequencyMonths?: number;
  eveningCarryOver?: boolean;       // reporter les heures de soir non utilisées
  // Tarifs appliqués au-delà des inclusions :
  extraTravelRate?: number;         // déplacement hors banque
  extraOnsiteRate?: number;         // sur place hors banque
  extraEveningRate?: number;        // soir hors banque
  // Types de travail qui consomment la banque. Undefined ou vide = tous
  // (compatibilité avec les configs existantes).
  consumedByWorkTypeIds?: string[];
  payments?: HourBankPayment[];     // paiements reçus du client
}
interface FtigConfig {
  // Période du forfait (contrat)
  startDate?: string;              // ISO YYYY-MM-DD
  endDate?: string;                // ISO YYYY-MM-DD
  // Méthode de calcul du forfait
  calculationMethod?: "per_user" | "per_device";
  unitCount?: number;              // nombre d'utilisateurs ou d'appareils
  unitPrice?: number;              // prix par unité (selon méthode)
  // Inclusions dans le forfait (par mois) — quotas orthogonaux :
  //   onsite : sur place + jour normal
  //   evening: à distance + soir
  //   weekend: weekend (par défaut 0 = toujours facturable)
  //   travel : nombre de déplacements
  includedTravelCount?: number;
  includedOnsiteHours?: number;
  includedEveningHours?: number;
  includedWeekendHours?: number;
  eveningCarryOver?: boolean;
  // Types de travail explicitement HORS forfait (« Services professionnels »
  // pour les projets/implantations qui n'étaient pas dans le contrat de
  // base). Toute saisie sur ces types contourne intégralement le FTIG et
  // tombe en T&M classique (taux palier × multiplicateur).
  excludedWorkTypeIds?: string[];
  // Champs legacy gardés pour compat (jamais consommés par le moteur — on
  // les laisse pour ne pas casser les configs existantes mais ils sont
  // remplacés par excludedWorkTypeIds dans la nouvelle UX).
  includedWorkTypeIds?: string[];
  onsiteWorkTypeIds?: string[];
  // Tarif fallback pour les overages onsite (utilisé seulement si l'agent
  // n'a pas choisi de palier — sinon le palier × multiplicateurs prime).
  extraOnsiteHourlyRate?: number;
  // Montants
  monthlyAmount?: number;          // montant mensuel facturé au client
  baseCost?: number;               // coûts de base MSP associés (interne)
}
function loadHourBankConfig(orgId: string): HourBankConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`nexus:client-hour-bank:${orgId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Protège contre `null` / valeurs primitives / arrays — on a observé des
    // entrées `"null"` stockées historiquement qui crashaient le composant
    // au premier `{ ...hourBankCfg }` ou accès propriété.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch { return {}; }
}
function saveHourBankConfig(orgId: string, cfg: HourBankConfig) {
  try { localStorage.setItem(`nexus:client-hour-bank:${orgId}`, JSON.stringify(cfg)); } catch {}
  // `hoursConsumed` est exclu du payload : le serveur est la source de
  // vérité (incrément atomique à chaque saisie de temps). Sans ce strip,
  // un superviseur qui sauvegarde avec un snapshot obsolète écraserait
  // la consommation calculée par les agents en parallèle.
  const { hoursConsumed: _ignored, ...sanitized } = cfg;
  void fetch(`/api/v1/organizations/${encodeURIComponent(orgId)}/billing-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hourBank: sanitized }),
  }).catch(() => {});
}
function loadFtigConfig(orgId: string): FtigConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`nexus:client-ftig:${orgId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch { return {}; }
}
function saveFtigConfig(orgId: string, cfg: FtigConfig) {
  try { localStorage.setItem(`nexus:client-ftig:${orgId}`, JSON.stringify(cfg)); } catch {}
  void fetch(`/api/v1/organizations/${encodeURIComponent(orgId)}/billing-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ftig: cfg }),
  }).catch(() => {});
}

/**
 * Incrémente `hoursConsumed` de la banque d'heures du client quand on lui
 * saisit du temps facturable. Appelée après un POST `/api/v1/time-entries`
 * réussi par les modales de saisie de temps.
 *
 * No-op si :
 *   - l'org n'a pas coché `hour_bank` comme type de facturation
 *   - l'entrée est forcée non-facturable
 *   - la durée est <= 0
 */
export function bumpHourBankUsage(
  organizationId: string,
  durationMinutes: number,
  opts?: { forceNonBillable?: boolean; workTypeId?: string | null },
): void {
  if (!organizationId || durationMinutes <= 0) return;
  if (opts?.forceNonBillable) return;
  const types = loadClientBillingTypes(organizationId);
  if (!types.includes("hour_bank")) return;
  const cfg = loadHourBankConfig(organizationId);
  // Si une liste explicite est configurée, seuls ces types de travail
  // déduisent de la banque. Liste vide ou non définie = tous les types.
  if (
    cfg.consumedByWorkTypeIds &&
    cfg.consumedByWorkTypeIds.length > 0 &&
    (!opts?.workTypeId || !cfg.consumedByWorkTypeIds.includes(opts.workTypeId))
  ) {
    return;
  }
  const prev = cfg.hoursConsumed ?? 0;
  const hours = durationMinutes / 60;
  const next: HourBankConfig = {
    ...cfg,
    hoursConsumed: Math.round((prev + hours) * 100) / 100,
  };
  saveHourBankConfig(organizationId, next);
  // Événement synthétique pour que l'écran d'override ouvert côté
  // Organisations rafraîchisse son affichage immédiatement.
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new StorageEvent("storage", { key: `nexus:client-hour-bank:${organizationId}` }),
      );
    } catch { /* older browsers */ }
  }
}

// Types de travail configurés pour un client — filtre les options
// affichées dans la modale de saisie de temps. Le `timeType` de base
// reste un TimeType du catalogue (utilisé par le moteur de facturation) ;
// le `label` est libre et personnalisable par client.
export interface WorkTypeOption {
  id: string;
  label: string;
  timeType:
    | "remote_work"
    | "onsite_work"
    | "travel"
    | "internal"
    | "other";
  /** @deprecated Le tarif est maintenant porté par les paliers (RateTierOption).
   *  Le champ reste pour compat de signature mais n'est plus exploité. */
  hourlyRateOverride?: number;
}

/** Palier tarifaire d'un client : libellé + taux horaire. Choisi par l'agent
 *  à la saisie pour donner le taux de base utilisé par le moteur. */
export interface RateTierOption {
  id: string;
  label: string;
  hourlyRate: number;
}
// Catégories de base — gérables globalement dans Paramètres → Facturation
// → Catégories de base. Le `systemTimeType` conserve le lien vers l'enum
// TimeType utilisé par le moteur de facturation. Les catégories ajoutées
// par l'utilisateur sans mapping tombent sur "other".
export interface BaseCategory {
  id: string;
  label: string;
  systemTimeType: WorkTypeOption["timeType"];
}
// Catégories de base proposées par défaut au niveau client. Volontairement
// minimaliste : À distance + Sur place suffisent pour 95 % des saisies.
// Les enums système (travel / preparation / administration / waiting /
// follow_up / internal / other) restent valides côté moteur si une saisie
// historique en porte un — on évite simplement de les exposer comme
// libellés cliquables dans l'UI client.
const DEFAULT_BASE_CATEGORIES: BaseCategory[] = [
  { id: "remote_work", label: "À distance", systemTimeType: "remote_work" },
  { id: "onsite_work", label: "Sur place", systemTimeType: "onsite_work" },
];
const BASE_CATEGORIES_KEY = "nexus:base-categories";
export function loadBaseCategories(): BaseCategory[] {
  if (typeof window === "undefined") return DEFAULT_BASE_CATEGORIES;
  try {
    const raw = localStorage.getItem(BASE_CATEGORIES_KEY);
    if (!raw) return DEFAULT_BASE_CATEGORIES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_BASE_CATEGORIES;
  } catch { return DEFAULT_BASE_CATEGORIES; }
}
export function saveBaseCategories(list: BaseCategory[]) {
  try { localStorage.setItem(BASE_CATEGORIES_KEY, JSON.stringify(list)); } catch {}
}

// Surcharge locale des libellés des TimeType système — permet de renommer
// les valeurs affichées (ex : "Travail à distance" → "À distance") sans
// toucher au moteur de facturation qui continue d'utiliser l'enum.
const SYSTEM_TYPE_LABELS_KEY = "nexus:system-type-labels";
export function loadSystemTypeLabels(): Partial<Record<WorkTypeOption["timeType"], string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SYSTEM_TYPE_LABELS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch { return {}; }
}
export function saveSystemTypeLabels(
  labels: Partial<Record<WorkTypeOption["timeType"], string>>,
) {
  try { localStorage.setItem(SYSTEM_TYPE_LABELS_KEY, JSON.stringify(labels)); } catch {}
}

// ---------------------------------------------------------------------------
// Types système personnalisés — étendent les 9 TimeType de base avec de
// nouvelles entrées définies par l'utilisateur. Chaque type custom pointe
// vers un type de base (`mapsTo`) qui dicte le comportement du moteur de
// facturation. Visibles partout où les TimeType apparaissent (Catégories de
// base, types de travail des orgs, filtres analytics).
// ---------------------------------------------------------------------------
export interface CustomSystemType {
  id: string;                                // id stable stocké sur les TimeEntry
  label: string;                             // affichage
  mapsTo: WorkTypeOption["timeType"];        // comportement engine
}
const CUSTOM_SYSTEM_TYPES_KEY = "nexus:custom-system-types";
export function loadCustomSystemTypes(): CustomSystemType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_SYSTEM_TYPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
export function saveCustomSystemTypes(list: CustomSystemType[]) {
  try { localStorage.setItem(CUSTOM_SYSTEM_TYPES_KEY, JSON.stringify(list)); } catch {}
}

/**
 * Liste unifiée des types système — built-ins + customs. Chaque entrée
 * expose son `id`, son `label` (avec override user appliqué) et son type
 * de base pour l'engine (`mapsTo`).
 */
export interface SystemTypeEntry {
  id: string;
  label: string;
  mapsTo: WorkTypeOption["timeType"];
  builtin: boolean;
}
export function loadAllSystemTypes(): SystemTypeEntry[] {
  const overrides = loadSystemTypeLabels();
  const customs = loadCustomSystemTypes();
  const builtins: SystemTypeEntry[] = [
    { id: "remote_work", label: overrides.remote_work ?? "Travail à distance", mapsTo: "remote_work", builtin: true },
    { id: "onsite_work", label: overrides.onsite_work ?? "Travail sur site",   mapsTo: "onsite_work", builtin: true },
    { id: "travel",      label: overrides.travel      ?? "Déplacement",        mapsTo: "travel",      builtin: true },
    { id: "internal",    label: overrides.internal    ?? "Temps interne",      mapsTo: "internal",    builtin: true },
    { id: "other",       label: overrides.other       ?? "Autre",              mapsTo: "other",       builtin: true },
  ];
  return [...builtins, ...customs.map((c): SystemTypeEntry => ({ id: c.id, label: c.label, mapsTo: c.mapsTo, builtin: false }))];
}
/**
 * Retourne le label lisible d'une catégorie à partir de son identifiant.
 *
 * Chaîne de fallback (dans l'ordre) :
 *   1. Match exact par `id` (cas nominal).
 *   2. Match par `systemTimeType` — si l'id exact a été supprimé/renommé
 *      mais qu'une autre catégorie existe avec le même systemTimeType,
 *      on utilise son label. Permet à l'analytique de continuer à
 *      afficher des données historiques sous la bonne bannière après
 *      que l'admin ait réorganisé ses catégories de base.
 *   3. Match contre les labels par défaut de l'enum (ex. "remote_work"
 *      → "À distance") — cas où l'user a tout supprimé mais les
 *      anciennes données pointent encore vers l'enum raw.
 *   4. Fallback final : l'id raw, préservé tel quel en analytique pour
 *      que l'historique reste visible même s'il ne correspond plus à
 *      aucune catégorie vivante.
 */
const DEFAULT_TIME_TYPE_LABELS: Record<string, string> = {
  remote_work: "À distance",
  onsite_work: "Sur place",
  travel: "Déplacement",
  preparation: "Préparation",
  administration: "Administration",
  waiting: "Attente",
  follow_up: "Suivi",
  internal: "Interne",
  other: "Autre",
};

export function labelForBaseCategory(id: string, cats?: BaseCategory[]): string {
  const list = cats ?? loadBaseCategories();
  // 1. Match exact par id
  const byId = list.find((c) => c.id === id);
  if (byId) return byId.label;
  // 2. Match par systemTimeType — quand l'id a été supprimé mais qu'une
  //    autre catégorie ciblant le même type système existe.
  const bySystem = list.find((c) => c.systemTimeType === id);
  if (bySystem) return bySystem.label;
  // 3. Match dans la liste unifiée des types système (built-in + custom).
  const allSys = loadAllSystemTypes();
  const sys = allSys.find((s) => s.id === id);
  if (sys) return sys.label;
  // 4. Fallback sur le label par défaut du TimeType
  if (DEFAULT_TIME_TYPE_LABELS[id]) return DEFAULT_TIME_TYPE_LABELS[id];
  // 5. Raw id — garde l'info en analytique même si la catégorie n'existe plus.
  return id;
}
// Defaults proposés à la création d'une nouvelle org (côté DB et UI). On
// garde volontairement minimaliste : 2 prestations couvrent 90% des saisies
// et l'utilisateur peut ajouter ses propres libellés (Maintenance, Projet X,
// etc.) au besoin via Organisations → Facturation → Types de travail.
const DEFAULT_WORK_TYPES: WorkTypeOption[] = [
  { id: "wt_remote", label: "À distance", timeType: "remote_work" },
  { id: "wt_onsite", label: "Sur place", timeType: "onsite_work" },
];
export function loadWorkTypes(orgId: string): WorkTypeOption[] {
  if (typeof window === "undefined") return DEFAULT_WORK_TYPES;
  try {
    const raw = localStorage.getItem(`nexus:client-work-types:${orgId}`);
    if (!raw) return DEFAULT_WORK_TYPES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_WORK_TYPES;
  } catch { return DEFAULT_WORK_TYPES; }
}
function saveWorkTypes(orgId: string, list: WorkTypeOption[]) {
  try { localStorage.setItem(`nexus:client-work-types:${orgId}`, JSON.stringify(list)); } catch {}
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
  // "currency" = $/h · "amount" = $ (flat) · "perKm" = $/km · "minutes" = min
  unit: "currency" | "amount" | "minutes" | "perKm";
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
    unit === "currency" || unit === "amount"
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
          {unit === "currency"
            ? "$/h"
            : unit === "amount"
              ? "$"
              : unit === "perKm"
                ? "$/km"
                : "min"}
        </span>
      </div>
      {isOverridden && (
        <p className="text-[11px] text-blue-600">
          Personnalisé · base : {unit === "currency" || unit === "amount"
            ? formatCurrency(inheritedValue)
            : unit === "perKm"
              ? `${inheritedValue.toFixed(2)} $/km`
              : `${inheritedValue} min`}
        </p>
      )}
    </div>
  );
}

// Error boundary : empêche qu'une exception dans la section fasse échouer
// silencieusement toute la page Facturation. Affiche un message avec les
// détails pour qu'on puisse diagnostiquer les régressions sur certains
// clients (données localStorage corrompues, mock absent, etc.).
interface BillingBoundaryState { hasError: boolean; message?: string; stack?: string; componentStack?: string }
class BillingErrorBoundary extends React.Component<
  { children: React.ReactNode; organizationName: string },
  BillingBoundaryState
> {
  state: BillingBoundaryState = { hasError: false };
  static getDerivedStateFromError(err: Error): BillingBoundaryState {
    return { hasError: true, message: err?.message ?? String(err), stack: err?.stack };
  }
  componentDidCatch(err: unknown, info: { componentStack?: string }) {
    console.error("[ClientBillingOverridesSection]", err, info);
    this.setState({ componentStack: info?.componentStack });
  }
  handleResetLocalStorage = () => {
    if (typeof window === "undefined") return;
    if (!confirm("Réinitialiser la configuration locale (localStorage) pour ce client ? Les widgets et préférences spécifiques à ce client seront perdus. Les données serveur restent intactes.")) return;
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith("nexus:client-")) localStorage.removeItem(k);
    }
    location.reload();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-900">
          <p className="font-semibold text-[14px]">⚠ Impossible d&apos;afficher la facturation de {this.props.organizationName}</p>
          <p className="mt-2 text-[12px] text-amber-800">
            Erreur capturée — l&apos;équipe technique va l&apos;analyser à partir du détail ci-dessous.
          </p>
          <details className="mt-3" open>
            <summary className="cursor-pointer text-[11.5px] font-medium">Détails techniques</summary>
            <div className="mt-2 rounded bg-white border border-amber-200 p-2.5 text-[11px] text-slate-800 font-mono">
              <div><strong>Message :</strong> {this.state.message}</div>
              {this.state.componentStack && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-slate-700">{this.state.componentStack.trim()}</pre>
              )}
              {this.state.stack && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10.5px] text-slate-600">Stack trace</summary>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap text-[10px] text-slate-600">{this.state.stack.trim()}</pre>
                </details>
              )}
            </div>
          </details>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => location.reload()}
              className="text-[11.5px] rounded bg-amber-700 text-white px-3 py-1.5 hover:bg-amber-800"
            >
              Recharger la page
            </button>
            <button
              onClick={this.handleResetLocalStorage}
              className="text-[11.5px] rounded border border-amber-400 bg-white text-amber-900 px-3 py-1.5 hover:bg-amber-100"
              title="Supprime toutes les clés nexus:client-* du localStorage"
            >
              Réinitialiser la config locale (localStorage)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ----------------------------------------------------------------------------
// InclusionField — input couplé "quantité + fréquence" pour les inclusions
// de la banque d'heures. Permet de choisir si la quantité s'applique sur la
// durée totale du contrat (défaut, frequency=undefined ou 0) ou se renouvelle
// tous les N mois (1=mensuel, 3=trimestriel, 6=semestriel, 12=annuel, autre).
// ----------------------------------------------------------------------------
const FREQUENCY_PRESETS: { label: string; months: number | null }[] = [
  { label: "Sur la durée totale", months: null },
  { label: "Tous les mois", months: 1 },
  { label: "Tous les 3 mois", months: 3 },
  { label: "Tous les 6 mois", months: 6 },
  { label: "Tous les ans", months: 12 },
];

function InclusionField({
  label,
  count,
  frequency,
  onChangeCount,
  onChangeFrequency,
  countPlaceholder,
  countStep = 1,
}: {
  label: string;
  count: number | undefined;
  frequency: number | undefined;
  onChangeCount: (v: number | undefined) => void;
  onChangeFrequency: (v: number | undefined) => void;
  countPlaceholder?: string;
  countStep?: number;
}) {
  // On considère "personnalisé" toute fréquence > 0 qui ne correspond
  // pas exactement à un preset. Permet à l'admin de saisir 4, 8, 18 mois
  // sans être enfermé dans les presets.
  const matchesPreset = FREQUENCY_PRESETS.some(
    (p) => p.months === (frequency ?? null),
  );
  const isCustom = !matchesPreset && (frequency ?? 0) > 0;
  const [customMode, setCustomMode] = useState(isCustom);

  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-slate-700">{label}</label>
      <Input
        type="number"
        min={0}
        step={countStep}
        placeholder={countPlaceholder}
        value={count ?? ""}
        onChange={(e) => {
          const v = e.target.value === "" ? undefined : Number(e.target.value);
          onChangeCount(v);
        }}
      />
      <div className="flex items-center gap-1.5">
        <select
          value={customMode ? "__custom__" : String(frequency ?? "")}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "__custom__") {
              setCustomMode(true);
              // Si pas encore défini, on initialise à 2 mois pour
              // matérialiser le mode personnalisé.
              if (!frequency) onChangeFrequency(2);
              return;
            }
            setCustomMode(false);
            onChangeFrequency(val === "" ? undefined : Number(val));
          }}
          className="flex-1 h-8 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {FREQUENCY_PRESETS.map((p) => (
            <option key={p.label} value={p.months === null ? "" : String(p.months)}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">Personnalisé…</option>
        </select>
        {customMode && (
          <div className="flex items-center gap-1 shrink-0">
            <Input
              type="number"
              min={1}
              step={1}
              value={frequency ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? undefined : Number(e.target.value);
                onChangeFrequency(v);
              }}
              className="!h-8 !w-16 !text-[11.5px]"
            />
            <span className="text-[11px] text-slate-500">mois</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientBillingOverridesSection(props: ClientBillingOverridesSectionProps) {
  return (
    <BillingErrorBoundary organizationName={props.organizationName}>
      <ClientBillingOverridesSectionInner {...props} />
    </BillingErrorBoundary>
  );
}

function ClientBillingOverridesSectionInner({
  organizationId,
  organizationName,
}: ClientBillingOverridesSectionProps) {
  // Diagnostic : permet de confirmer rapidement dans la console que la
  // section a bien monté pour une org donnée (et n'a pas été interceptée
  // avant). Volontairement en log pour être visible sans devtools pro.
  if (typeof window !== "undefined") {
    console.log("[Facturation] section mounted", { organizationId, organizationName });
  }
  // Profil de base : profil "Standard MSP" par défaut. Une fois l'override
  // chargé depuis l'API, baseProfileId peut pointer vers un autre profil.
  const baseProfile: BillingProfile = useMemo(() => {
    return (
      mockBillingProfiles.find((p) => p.isDefault) || mockBillingProfiles[0]
    );
  }, []);

  // Local mutable state for the override (rempli par l'API au mount).
  const [overrideState, setOverrideState] = useState<ClientBillingOverride>(
    () => ({
      id: `cbo_new_${organizationId}`,
      organizationId,
      organizationName,
      baseProfileId: baseProfile.id,
      isActive: true,
      effectiveFrom: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );

  // Charge l'override existant depuis la DB au montage.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/organizations/${organizationId}/billing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const ov = data?.data?.override as ClientBillingOverride | null;
        if (ov) {
          setOverrideState((prev) => ({ ...prev, ...ov, organizationId, organizationName }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [organizationId, organizationName]);
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

  // CRITIQUE : recharge la config de facturation depuis l'API DB au
  // montage. Avant : la config vivait en localStorage de chaque agent
  // → Bruno active "Services pro" sur HVAC, Marcel ne voit rien.
  // Maintenant : tous les agents partagent la même autorité (table
  // OrgBillingConfig). localStorage reste comme cache de premier paint
  // mais l'API écrase si elles divergent.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/billing-config`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { billingTypes?: string[]; hourBank?: HourBankConfig | null; ftig?: FtigConfig | null } | null) => {
        if (cancelled || !d) return;
        if (Array.isArray(d.billingTypes)) {
          const valid = d.billingTypes.filter((t): t is ClientBillingType =>
            ALL_BILLING_TYPES.includes(t as ClientBillingType),
          );
          setBillingTypes(valid);
          try { localStorage.setItem(`nexus:client-billing-types:${organizationId}`, JSON.stringify(valid)); } catch {}
        }
        if (d.hourBank && typeof d.hourBank === "object") {
          setHourBankCfg(d.hourBank as HourBankConfig);
          try { localStorage.setItem(`nexus:client-hour-bank:${organizationId}`, JSON.stringify(d.hourBank)); } catch {}
        }
        if (d.ftig && typeof d.ftig === "object") {
          setFtigCfg(d.ftig as FtigConfig);
          try { localStorage.setItem(`nexus:client-ftig:${organizationId}`, JSON.stringify(d.ftig)); } catch {}
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const [workTypes, setWorkTypes] = useState<WorkTypeOption[]>(
    () => loadWorkTypes(organizationId),
  );
  // Charge la liste des libellés depuis la DB au mount. Avant : seulement
  // localStorage → invisible côté serveur, donc le moteur de facturation
  // ne pouvait pas appliquer le hourlyRate spécifique. Maintenant l'API
  // est la source de vérité (table OrgWorkType).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/organizations/${organizationId}/work-types`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : null;
        if (!rows) return;
        const mapped: WorkTypeOption[] = rows.map((w: { id: string; label: string; timeType: WorkTypeOption["timeType"]; hourlyRate: number | null }) => ({
          id: w.id,
          label: w.label,
          timeType: w.timeType,
          hourlyRateOverride: w.hourlyRate ?? undefined,
        }));
        // Ne remplace que si le serveur a effectivement des données. Sinon
        // on garde le snapshot localStorage pour que l'éditeur ne se vide pas
        // tant que l'utilisateur n'a pas explicitement sauvegardé.
        if (mapped.length > 0) setWorkTypes(mapped);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [organizationId]);

  // Paliers tarifaires — axe "combien", indépendant des types de travail.
  // Source de vérité : table OrgRateTier (DB), exposée via /rate-tiers.
  const [rateTiers, setRateTiers] = useState<RateTierOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/organizations/${organizationId}/rate-tiers`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : [];
        const mapped: RateTierOption[] = rows.map((t: { id: string; label: string; hourlyRate: number }) => ({
          id: t.id,
          label: t.label,
          hourlyRate: t.hourlyRate,
        }));
        setRateTiers(mapped);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [organizationId]);

  // Catégories de base gérables globalement dans Paramètres → Facturation.
  // On s'y abonne via l'event storage pour refléter les ajouts/renommages
  // sans rechargement de page.
  const [baseCategories, setBaseCategories] = useState<BaseCategory[]>(
    () => loadBaseCategories(),
  );
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== BASE_CATEGORIES_KEY) return;
      setBaseCategories(loadBaseCategories());
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
  }, []);
  // Rafraîchit l'affichage de la banque d'heures quand une saisie de temps
  // l'a incrémentée (la modale de saisie dispatche un `storage` synthétique
  // sur la clé `nexus:client-hour-bank:<orgId>`).
  useEffect(() => {
    function onBankStorage(e: StorageEvent) {
      if (e.key !== `nexus:client-hour-bank:${organizationId}`) return;
      setHourBankCfg(loadHourBankConfig(organizationId));
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onBankStorage);
      return () => window.removeEventListener("storage", onBankStorage);
    }
  }, [organizationId]);
  const [newWorkTypeLabel, setNewWorkTypeLabel] = useState("");
  const [newWorkTypeBase, setNewWorkTypeBase] =
    useState<WorkTypeOption["timeType"]>(
      (baseCategories[0]?.systemTimeType ?? "remote_work") as WorkTypeOption["timeType"],
    );
  // ---------------------------------------------------------------------
  // Mode édition + historique (undo / redo / annuler / sauvegarder).
  //
  // Principe :
  //   - Hors édition : toutes les inputs sont disabled (fieldset racine).
  //   - En édition : changements locaux uniquement. Rien n'est écrit
  //     dans localStorage avant "Sauvegarder". "Annuler" restaure la
  //     snapshot prise en entrant dans le mode édition.
  //   - Chaque mutation pousse l'état précédent dans `history` ; "Revenir"
  //     le dépile, "Rétablir" ré-applique depuis `future`.
  // ---------------------------------------------------------------------
  interface Snapshot {
    overrideState: ClientBillingOverride;
    billingTypes: ClientBillingType[];
    hourBankCfg: HourBankConfig;
    ftigCfg: FtigConfig;
    workTypes: WorkTypeOption[];
  }
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  const snap = (): Snapshot => ({
    overrideState: { ...overrideState },
    billingTypes: [...billingTypes],
    hourBankCfg: { ...hourBankCfg },
    ftigCfg: { ...ftigCfg },
    workTypes: workTypes.map((w) => ({ ...w })),
  });
  const applySnapshot = (s: Snapshot) => {
    setOverrideState(s.overrideState);
    setBillingTypes(s.billingTypes);
    setHourBankCfg(s.hourBankCfg);
    setFtigCfg(s.ftigCfg);
    setWorkTypes(s.workTypes);
  };
  const pushHistory = () => {
    if (!editing) return;
    setHistory((h) => [...h, snap()]);
    setFuture([]);
  };
  const enterEdit = () => {
    setBaseline(snap());
    setHistory([]);
    setFuture([]);
    setEditing(true);
    setSavedAt(null);
  };
  const cancelEdit = () => {
    if (baseline) applySnapshot(baseline);
    setBaseline(null);
    setHistory([]);
    setFuture([]);
    setEditing(false);
  };
  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture((f) => [snap(), ...f]);
    setHistory((h) => h.slice(0, -1));
    applySnapshot(prev);
  };
  const redo = () => {
    if (future.length === 0) return;
    const [next, ...rest] = future;
    setHistory((h) => [...h, snap()]);
    setFuture(rest);
    applySnapshot(next);
  };
  const commitSave = async () => {
    setSaving(true);
    // Flush localStorage — config locale (banque d'heures, FTIG, types
    // de travail) reste en localStorage pour le moment.
    saveClientBillingTypes(organizationId, billingTypes);
    saveHourBankConfig(organizationId, hourBankCfg);
    saveFtigConfig(organizationId, ftigCfg);
    saveWorkTypes(organizationId, workTypes);

    // Persiste les overrides de taux côté serveur (DB, table
    // client_billing_overrides). Sans cette étape, les taux restaient
    // ignorés par l'engine de facturation et n'apparaissaient pas dans
    // les rapports mensuels.
    try {
      const ratePayload: Record<string, unknown> = {
        baseProfileId: overrideState.baseProfileId,
        isActive: overrideState.isActive ?? true,
        notes: overrideState.notes ?? null,
      };
      // Champs numériques — null efface la surcharge, number la pose.
      const numericKeys: NumericField[] = ALL_NUMERIC_FIELDS;
      for (const k of numericKeys) {
        const v = (overrideState as unknown as Record<string, unknown>)[k];
        ratePayload[k] = v === undefined || v === null || v === "" ? null : Number(v);
      }
      const r = await fetch(`/api/v1/organizations/${organizationId}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ratePayload),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        console.error("Failed to save billing override:", d);
      }
    } catch (e) {
      console.error("Failed to save billing override:", e);
    }

    // Persiste les types de prestation (axe "quoi" — table OrgWorkType).
    // Le tarif est géré séparément via les paliers (cf. plus bas).
    try {
      const workTypesPayload = workTypes.map((w, idx) => ({
        ...(w.id && !w.id.startsWith("wt_") ? { id: w.id } : {}),
        label: w.label,
        timeType: w.timeType,
        sortOrder: idx,
      }));
      const r = await fetch(`/api/v1/organizations/${organizationId}/work-types`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workTypes: workTypesPayload }),
      });
      if (r.ok) {
        const data = await r.json();
        const rows = Array.isArray(data?.data) ? data.data : [];
        const mapped: WorkTypeOption[] = rows.map((w: { id: string; label: string; timeType: WorkTypeOption["timeType"] }) => ({
          id: w.id,
          label: w.label,
          timeType: w.timeType,
        }));
        setWorkTypes(mapped);
      }
    } catch (e) {
      console.error("Failed to save work types:", e);
    }

    // Persiste les paliers tarifaires (axe "combien" — table OrgRateTier).
    try {
      const rateTiersPayload = rateTiers.map((t, idx) => ({
        ...(t.id && !t.id.startsWith("rt_") ? { id: t.id } : {}),
        label: t.label,
        hourlyRate: t.hourlyRate,
        sortOrder: idx,
      }));
      const r = await fetch(`/api/v1/organizations/${organizationId}/rate-tiers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateTiers: rateTiersPayload }),
      });
      if (r.ok) {
        const data = await r.json();
        const rows = Array.isArray(data?.data) ? data.data : [];
        const mapped: RateTierOption[] = rows.map((t: { id: string; label: string; hourlyRate: number }) => ({
          id: t.id,
          label: t.label,
          hourlyRate: t.hourlyRate,
        }));
        setRateTiers(mapped);
      }
    } catch (e) {
      console.error("Failed to save rate tiers:", e);
    }

    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString("fr-CA"));
    setBaseline(null);
    setHistory([]);
    setFuture([]);
    setEditing(false);
  };

  const addWorkType = () => {
    const label = newWorkTypeLabel.trim();
    if (!label) return;
    pushHistory();
    const option: WorkTypeOption = {
      id: `wt_${Date.now()}`,
      label,
      timeType: newWorkTypeBase,
    };
    setWorkTypes((prev) => [...prev, option]);
    setNewWorkTypeLabel("");
  };
  const updateWorkType = (id: string, patch: Partial<WorkTypeOption>) => {
    pushHistory();
    setWorkTypes((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };
  const removeWorkType = (id: string) => {
    pushHistory();
    setWorkTypes((prev) => prev.filter((w) => w.id !== id));
  };
  const toggleBillingType = (t: ClientBillingType) => {
    pushHistory();
    setBillingTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };
  const updateHourBank = (patch: Partial<HourBankConfig>) => {
    pushHistory();
    setHourBankCfg((prev) => ({ ...prev, ...patch }));
  };
  const updateFtig = (patch: Partial<FtigConfig>) => {
    pushHistory();
    setFtigCfg((prev) => ({ ...prev, ...patch }));
  };
  // Si aucun type n'est sélectionné, on affiche les sections "classiques"
  // (taux horaires + déplacements) par défaut — équivalent historique
  // avant l'introduction du sélecteur.
  const hasAnyType = billingTypes.length > 0;
  const showProfessionalServices = !hasAnyType || billingTypes.includes("professional_services");
  const showHourBank = billingTypes.includes("hour_bank");
  const showFtig = billingTypes.includes("ftig");

  // Sous-onglets pour réduire la longueur verticale de la vue (on
  // passait 7+ blocs linéaires). Chaque onglet garde accès aux
  // contrôles d'édition globaux placés dans le header au-dessus.
  type BillingSubTab = "general" | "hour_bank" | "ftig" | "addons" | "travel";
  const [subTab, setSubTab] = useState<BillingSubTab>("general");

  const updateField = (field: NumericField, value: number | undefined) => {
    pushHistory();
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

  const overriddenCount = ALL_NUMERIC_FIELDS.filter(
    (f) => overrideState[f] !== undefined
  ).length;
  const totalFields = ALL_NUMERIC_FIELDS.length;

  const handleResetAll = () => {
    pushHistory();
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
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="text-[12px] font-medium text-slate-600">
                  Override actif
                </span>
                <Switch
                  disabled={!editing}
                  checked={overrideState.isActive}
                  onCheckedChange={(checked) => {
                    pushHistory();
                    setOverrideState((p) => ({ ...p, isActive: checked }));
                  }}
                />
              </div>

              {/* Mode édition — pattern dashboards : on entre en édition,
                  on modifie, puis on sauvegarde (ou on annule). Sans ce
                  garde-fou, un clic malheureux écrasait un tarif négocié
                  sans possibilité de rollback. */}
              {!editing ? (
                <Button onClick={enterEdit} className="gap-1.5">
                  <Edit3 className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              ) : (
                <>
                  <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={undo}
                      disabled={history.length === 0}
                      title="Revenir en arrière"
                      className="h-9 w-9 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed border-r border-slate-200"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={redo}
                      disabled={future.length === 0}
                      title="Rétablir"
                      className="h-9 w-9 inline-flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Redo2 className="h-4 w-4" />
                    </button>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Annuler
                  </Button>
                  <Button onClick={commitSave} disabled={saving} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Enregistrement…" : "Sauvegarder"}
                  </Button>
                </>
              )}
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

      {/* Navigation sous-onglets — remplace l'ancienne scroll-list
          linéaire de 7 blocs. Les contrôles d'édition du header
          au-dessus restent actifs sur tous les onglets. Les onglets
          Banque/FTIG affichent un état d'activation si le mode n'est
          pas coché. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1">
        {([
          { key: "general",   label: "Général",              activated: true },
          { key: "hour_bank", label: "Banque d'heures",      activated: showHourBank },
          { key: "ftig",      label: "Forfait FTIG",         activated: showFtig },
          { key: "addons",    label: "Services connexes",    activated: true },
          { key: "travel",    label: "Déplacements",         activated: true },
        ] as const).map((t) => {
          const active = subTab === t.key;
          // Badge vert "activé" pour Banque/FTIG quand le mode est coché
          // dans l'onglet Général, pour que l'user voit au coup d'œil
          // quels modes sont en place. Gris pour les modes non actifs.
          const showDot = (t.key === "hour_bank" || t.key === "ftig");
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/70"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {t.label}
              {showDot && (
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    t.activated ? "bg-emerald-500" : "bg-slate-300",
                  )}
                  aria-label={t.activated ? "Activé" : "Non activé"}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tout le contenu éditable est dans ce fieldset — le `disabled` se
          propage à toutes les <input>, <select>, <button> descendants,
          sauf ceux explicitement marqués avec `disabled={false}`. Quand on
          n'est pas en mode édition, tout est read-only sans avoir à
          décorer chaque composant individuellement. */}
      <fieldset
        disabled={!editing}
        className={cn(
          "space-y-5 min-w-0",
          !editing && "opacity-90",
        )}
      >

      {/* ==== Onglet: Général (types de facturation + types de travail) ==== */}
      {subTab === "general" && (<>
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

      {/* Types de travail affichés dans la saisie de temps pour ce client */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Clock className="h-4 w-4 text-blue-600" />
            Types de travail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[12px] text-slate-500">
            Ces options sont les seules proposées dans la modale
            &laquo;&nbsp;Ajouter du temps&nbsp;&raquo; pour ce client. Ajoute ou
            retire les entrées selon les services réellement offerts.
          </p>
          <div className="space-y-1.5">
            {workTypes.length === 0 ? (
              <p className="text-[12px] italic text-slate-400">
                Aucun type — la modale affichera le catalogue complet par défaut.
              </p>
            ) : (
              workTypes.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-800 truncate">
                      {w.label}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      Base&nbsp;: {
                        baseCategories.find((c) => c.systemTimeType === w.timeType)?.label
                          ?? w.timeType
                      }
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWorkType(w.id)}
                    className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
                    title="Retirer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-100">
            <div className="flex-1 min-w-[180px] space-y-1">
              <label className="text-[11.5px] font-medium text-slate-600">
                Libellé
              </label>
              <Input
                placeholder="Ex : Configuration Office 365"
                value={newWorkTypeLabel}
                onChange={(e) => setNewWorkTypeLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addWorkType();
                  }
                }}
              />
            </div>
            <div className="min-w-[160px] space-y-1">
              <label className="text-[11.5px] font-medium text-slate-600">
                Catégorie de base
              </label>
              <select
                value={newWorkTypeBase}
                onChange={(e) => setNewWorkTypeBase(e.target.value as WorkTypeOption["timeType"])}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {baseCategories.map((c) => (
                  <option key={c.id} value={c.systemTimeType}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addWorkType}
              disabled={!newWorkTypeLabel.trim()}
            >
              + Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Paliers tarifaires — axe "combien". L'agent en choisit un à la
          saisie pour donner le taux horaire de base. Indépendant du type
          de prestation. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Wallet className="h-4 w-4 text-blue-600" />
            Paliers tarifaires
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[12px] text-slate-500">
            Le palier choisi à la saisie donne le taux horaire de base. Les
            multiplicateurs soir/weekend du client s&apos;appliquent par-dessus.
            Sans aucun palier défini, le moteur retombe sur le taux standard.
          </p>
          <div className="space-y-1.5">
            {rateTiers.length === 0 ? (
              <p className="text-[12px] italic text-slate-400">
                Aucun palier — la saisie utilisera le taux standard du client.
              </p>
            ) : (
              rateTiers.map((t, idx) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <Input
                    value={t.label}
                    placeholder="Ex : Niveau 1, Sysadmin Sr…"
                    onChange={(e) => {
                      pushHistory();
                      const v = e.target.value;
                      setRateTiers((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, label: v } : x)),
                      );
                    }}
                    className="flex-1 h-8 text-[12.5px]"
                  />
                  <div className="relative shrink-0">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={t.hourlyRate}
                      onChange={(e) => {
                        pushHistory();
                        const v = parseFloat(e.target.value);
                        setRateTiers((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, hourlyRate: Number.isNaN(v) ? 0 : v }
                              : x,
                          ),
                        );
                      }}
                      className="w-28 pr-8 h-8 text-[12.5px] tabular-nums text-right"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-medium text-slate-400">
                      $/h
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      pushHistory();
                      setRateTiers((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0 transition-colors"
                    title="Retirer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              pushHistory();
              setRateTiers((prev) => [
                ...prev,
                {
                  id: `rt_${Date.now()}`,
                  label: "",
                  hourlyRate: 0,
                },
              ]);
            }}
          >
            + Ajouter un palier
          </Button>
        </CardContent>
      </Card>
      </>)}

      {/* ==== Onglet: Banque d'heures ==== */}
      {subTab === "hour_bank" && !showHourBank && (
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="p-6 text-center">
            <Wallet className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-[13.5px] font-medium text-slate-700">Banque d&apos;heures désactivée</p>
            <p className="mt-1 text-[12px] text-slate-500">
              Active ce mode dans l&apos;onglet <strong>Général</strong> → <em>Types de facturation</em> pour configurer le solde et les règles.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Banque d'heures — config complète, visible quand le mode est activé ET qu'on est sur cet onglet */}
      {subTab === "hour_bank" && showHourBank && (
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

            {/* Inclusions dans la banque — ce qui est couvert par la banque
                sans coût additionnel, et tarifs appliqués au-delà. Chaque
                inclusion peut être globale (sur la durée du contrat) OU
                récurrente (renouvelée tous les N mois). */}
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Inclusions dans la banque
              </h4>
              <p className="text-[11px] text-slate-500 mb-3 leading-snug">
                Période d&apos;inclusion : laisse «&nbsp;Sur la durée totale&nbsp;»
                pour appliquer la quantité au contrat entier, ou choisis une
                période pour renouveler le quota tous les N mois.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InclusionField
                  label="Déplacements inclus"
                  countPlaceholder="0 = aucun"
                  countStep={1}
                  count={hourBankCfg.includedTravelCount}
                  frequency={hourBankCfg.includedTravelFrequencyMonths}
                  onChangeCount={(v) => updateHourBank({ includedTravelCount: v })}
                  onChangeFrequency={(v) => updateHourBank({ includedTravelFrequencyMonths: v })}
                />
                <InclusionField
                  label="Heures sur place incluses"
                  countPlaceholder="0 = aucune"
                  countStep={0.5}
                  count={hourBankCfg.includedOnsiteHours}
                  frequency={hourBankCfg.includedOnsiteFrequencyMonths}
                  onChangeCount={(v) => updateHourBank({ includedOnsiteHours: v })}
                  onChangeFrequency={(v) => updateHourBank({ includedOnsiteFrequencyMonths: v })}
                />
                <InclusionField
                  label="Heures de soir incluses"
                  countPlaceholder="0 = aucune"
                  countStep={0.5}
                  count={hourBankCfg.includedEveningHours}
                  frequency={hourBankCfg.includedEveningFrequencyMonths}
                  onChangeCount={(v) => updateHourBank({ includedEveningHours: v })}
                  onChangeFrequency={(v) => updateHourBank({ includedEveningFrequencyMonths: v })}
                />
                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <Switch
                      checked={!!hourBankCfg.eveningCarryOver}
                      onCheckedChange={(c) => updateHourBank({ eveningCarryOver: c })}
                    />
                    <span className="text-[12px] font-medium text-slate-700">
                      Reporter les heures de soir non utilisées d&apos;un mois à l&apos;autre
                    </span>
                  </div>
                </div>
              </div>

              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mt-4 mb-2">
                Tarifs hors inclusions
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Déplacement hors banque ($)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex : 85"
                    value={hourBankCfg.extraTravelRate ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateHourBank({ extraTravelRate: v });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Sur place hors banque ($)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex : 145"
                    value={hourBankCfg.extraOnsiteRate ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateHourBank({ extraOnsiteRate: v });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Soir hors banque ($)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex : 165"
                    value={hourBankCfg.extraEveningRate ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateHourBank({ extraEveningRate: v });
                    }}
                  />
                </div>
              </div>
              <p className="mt-2 text-[10.5px] text-slate-400 leading-snug">
                Tarifs appliqués quand la quantité utilisée dépasse les
                inclusions (ex&nbsp;: un 4<sup>e</sup> déplacement si 3 sont
                inclus). Laisser vide pour utiliser le taux général de dépassement.
              </p>
            </div>

            {/* Types de travail qui déduisent de la banque. Par défaut (liste
                vide), TOUS les types déduisent — rétro-compat. */}
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Types de travail qui consomment la banque
              </h4>
              {workTypes.length === 0 ? (
                <p className="text-[11.5px] italic text-slate-400">
                  Aucun type de travail configuré pour ce client. Ajoute-en
                  dans la carte &laquo;&nbsp;Types de travail&nbsp;&raquo;.
                </p>
              ) : (
                <>
                  <p className="text-[11.5px] text-slate-500 mb-2">
                    Coche les types qui doivent réduire les heures restantes.
                    Si rien n&apos;est coché, tous les types déduisent (par
                    défaut).
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {workTypes.map((w) => {
                      const list = hourBankCfg.consumedByWorkTypeIds ?? [];
                      const checked = list.includes(w.id);
                      return (
                        <label
                          key={w.id}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-1.5 cursor-pointer transition-colors",
                            checked
                              ? "border-emerald-300 bg-emerald-50/50"
                              : "border-slate-200 hover:bg-slate-50",
                          )}
                        >
                          <span className="text-[12.5px] text-slate-700 truncate">
                            {w.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const current = hourBankCfg.consumedByWorkTypeIds ?? [];
                              const next = current.includes(w.id)
                                ? current.filter((id) => id !== w.id)
                                : [...current, w.id];
                              updateHourBank({ consumedByWorkTypeIds: next });
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
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
                        value={hourBankCfg.hoursConsumed ?? 0}
                        readOnly
                        disabled
                        className="bg-slate-50 text-slate-700 cursor-not-allowed"
                      />
                      <p className="text-[10.5px] text-slate-500 leading-snug">
                        Calculé automatiquement par le moteur de facturation à chaque saisie de temps. Pour ajuster manuellement, contactez l'administrateur.
                      </p>
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

      {/* ==== Onglet: Forfait FTIG ==== */}
      {subTab === "ftig" && !showFtig && (
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="p-6 text-center">
            <Wallet className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-[13.5px] font-medium text-slate-700">Forfait FTIG désactivé</p>
            <p className="mt-1 text-[12px] text-slate-500">
              Active ce mode dans l&apos;onglet <strong>Général</strong> → <em>Types de facturation</em> pour configurer le forfait mensuel et les inclusions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* FTIG — config complète, visible quand le mode est activé ET qu'on est sur cet onglet */}
      {subTab === "ftig" && showFtig && (() => {
        const autoMonthly =
          ftigCfg.unitCount !== undefined && ftigCfg.unitPrice !== undefined
            ? Math.round(ftigCfg.unitCount * ftigCfg.unitPrice * 100) / 100
            : undefined;
        // Taux effectifs utilisés pour calculer le coût des inclusions :
        //   - taux horaire sur place = override client > profil de base
        //   - forfait par déplacement = idem
        // Les heures de soir sont comptées au même taux horaire onsite (pas
        // de taux de soir distinct dans le modèle actuel).
        const effOnsiteRate =
          overrideState.onsiteRate ?? baseProfile.onsiteRate ?? 0;
        const effTravelFlat =
          overrideState.travelFlatFee ?? baseProfile.travelFlatFee ?? 0;
        const autoInclusionCost = (() => {
          const h =
            (ftigCfg.includedOnsiteHours ?? 0) +
            (ftigCfg.includedEveningHours ?? 0);
          const t = ftigCfg.includedTravelCount ?? 0;
          const v = h * effOnsiteRate + t * effTravelFlat;
          return v > 0 ? Math.round(v * 100) / 100 : undefined;
        })();
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
            {/* Période du forfait (contrat FTIG) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Date de début du forfait
                </label>
                <Input
                  type="date"
                  value={ftigCfg.startDate ?? ""}
                  onChange={(e) => updateFtig({ startDate: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700">
                  Date de fin du forfait
                </label>
                <Input
                  type="date"
                  value={ftigCfg.endDate ?? ""}
                  onChange={(e) => updateFtig({ endDate: e.target.value || undefined })}
                />
              </div>
            </div>

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

            {/* Coût des inclusions (revenu potentiel équivalent) + marge. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-700 flex items-center justify-between gap-2">
                  <span>Coût des inclusions ($/mois)</span>
                  {autoInclusionCost !== undefined && (
                    <span className="text-[10.5px] font-normal text-slate-400">
                      auto = {autoInclusionCost.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} $
                    </span>
                  )}
                </label>
                <Input
                  type="number"
                  min={0}
                  step={10}
                  placeholder={autoInclusionCost !== undefined
                    ? `Auto : ${autoInclusionCost}`
                    : "Ex : 650"}
                  value={ftigCfg.baseCost ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    updateFtig({ baseCost: v });
                  }}
                />
                <p className="text-[10.5px] text-slate-400 leading-snug">
                  Revenu potentiel équivalent : heures incluses × taux horaire
                  onsite ({effOnsiteRate} $) + déplacements × forfait ({effTravelFlat} $).
                  Recalculé automatiquement à chaque changement d&apos;inclusion ; tu peux
                  écraser manuellement.
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
              {/* Note : chaque champ ci-dessous recalcule immédiatement
                  le "Coût des inclusions" (baseCost) en $ = heures
                  incluses × taux horaire onsite + déplacements × forfait.
                  L'admin peut toujours écraser manuellement dans le champ
                  "Coût des inclusions" plus bas. */}
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
                      const h =
                        (ftigCfg.includedOnsiteHours ?? 0) +
                        (ftigCfg.includedEveningHours ?? 0);
                      const t = v ?? 0;
                      const sum = h * effOnsiteRate + t * effTravelFlat;
                      const auto = sum > 0 ? Math.round(sum * 100) / 100 : undefined;
                      updateFtig({ includedTravelCount: v, baseCost: auto });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Heures de jour / mois
                    <span className="ml-1 text-[10.5px] font-normal text-slate-400">(sur place ou à distance)</span>
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="0 = aucune"
                    value={ftigCfg.includedOnsiteHours ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      const h = (v ?? 0) + (ftigCfg.includedEveningHours ?? 0);
                      const t = ftigCfg.includedTravelCount ?? 0;
                      const sum = h * effOnsiteRate + t * effTravelFlat;
                      const auto = sum > 0 ? Math.round(sum * 100) / 100 : undefined;
                      updateFtig({ includedOnsiteHours: v, baseCost: auto });
                    }}
                  />
                  <p className="text-[10.5px] text-slate-500 leading-snug">
                    Quota partagé : sur place et à distance combinés, heures normales seulement (pas le soir ni le weekend).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Heures de soir / mois
                    <span className="ml-1 text-[10.5px] font-normal text-slate-400">(à distance)</span>
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="0 = aucune"
                    value={ftigCfg.includedEveningHours ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      const h = (ftigCfg.includedOnsiteHours ?? 0) + (v ?? 0);
                      const t = ftigCfg.includedTravelCount ?? 0;
                      const sum = h * effOnsiteRate + t * effTravelFlat;
                      const auto = sum > 0 ? Math.round(sum * 100) / 100 : undefined;
                      updateFtig({ includedEveningHours: v, baseCost: auto });
                    }}
                  />
                  <p className="text-[10.5px] text-slate-500 leading-snug">
                    Quota soir applicable uniquement au télétravail. Une intervention sur place le soir reste facturable.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Heures weekend / mois
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="0 = toujours facturable"
                    value={ftigCfg.includedWeekendHours ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateFtig({ includedWeekendHours: v });
                    }}
                  />
                  <p className="text-[10.5px] text-slate-500 leading-snug">
                    0 = toute saisie le weekend tombe en facturable au taux palier × multiplicateur weekend.
                  </p>
                </div>
                {/* Toggle eveningCarryOver retiré — n'a jamais été
                    implémenté côté engine FTIG (logique de rollover de
                    fin de période non câblée). Évite la fausse promesse UI. */}
              </div>
            </div>

            {/* Types de travail étiquetés « hors contrat » — sémantique
                COSMÉTIQUE depuis la refonte : la cascade FTIG s'applique
                normalement (consomme les quotas), mais le rapport affiche
                « hors contrat » sur les lignes facturables pour rendre
                visible la nature commerciale (ex: « Sur place » pour SADB). */}
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Types de travail étiquetés « hors contrat »
              </h4>
              {workTypes.length === 0 ? (
                <p className="text-[11.5px] italic text-slate-400">
                  Aucun type de travail configuré. Ajoute-en dans la carte &laquo;&nbsp;Types de travail&nbsp;&raquo;.
                </p>
              ) : (
                <>
                  <p className="text-[11.5px] text-slate-500 mb-2">
                    Coche les types <strong>étiquetés « hors contrat »</strong> dans le rapport. La cascade FTIG s&apos;applique normalement (les saisies consomment les quotas et le dépassement utilise le taux hors forfait), mais l&apos;étiquette « hors contrat » s&apos;affiche sur les lignes facturables — utile pour rendre visible la nature commerciale.
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {workTypes.map((w) => {
                      const list = ftigCfg.excludedWorkTypeIds ?? [];
                      const checked = list.includes(w.id);
                      return (
                        <label
                          key={w.id}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-1.5 cursor-pointer transition-colors",
                            checked
                              ? "border-rose-300 bg-rose-50/50"
                              : "border-slate-200 hover:bg-slate-50",
                          )}
                        >
                          <span className="text-[12.5px] text-slate-700 truncate">
                            {w.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const current = ftigCfg.excludedWorkTypeIds ?? [];
                              const next = current.includes(w.id)
                                ? current.filter((id) => id !== w.id)
                                : [...current, w.id];
                              updateFtig({ excludedWorkTypeIds: next });
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Sections legacy `includedWorkTypeIds` / `onsiteWorkTypeIds`
                retirées : champs persistés mais jamais consommés par le
                moteur. La cascade FTIG actuelle utilise SEULEMENT
                `excludedWorkTypeIds` (étiquette cosmétique « hors contrat »).
                Les autres listes étaient des reliquats v1 qui créaient de
                la confusion UX. */}

            {/* Travail sur place non inclus au forfait — taux horaire utilisé
                pour les projets ou les heures régulières qui débordent
                des inclusions (ou hors période). */}
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Hors forfait
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">
                    Taux horaire sur place (hors FTIG)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex : 145"
                    value={ftigCfg.extraOnsiteHourlyRate ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      updateFtig({ extraOnsiteHourlyRate: v });
                    }}
                  />
                  <p className="text-[10.5px] text-slate-400 leading-snug">
                    Appliqué aux projets et aux heures sur place qui dépassent les inclusions mensuelles.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}

      {/* ==== Onglet: Services connexes ==== */}
      {subTab === "addons" && (
        <OrgAddonsSection organizationId={organizationId} />
      )}

      {/* ==== Onglet: Déplacements ==== */}
      {subTab === "travel" && (
      <div className="space-y-4">
        {/* Carte kilométrage : flux de sauvegarde indépendant (PUT direct
            sur l'endpoint dédié), donc on la sort de la dépendance au
            mode "édition" du gros fieldset parent. Nested fieldset avec
            disabled=false réactive les inputs pour ce bloc uniquement. */}
        <fieldset disabled={false} className="contents">
          <OrgMileageRateCard organizationId={organizationId} />
        </fieldset>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <Car className="h-4 w-4 text-blue-600" />
              Forfaits (legacy)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RateField
                label="Frais fixes par déplacement"
                field="travelFlatFee"
                value={overrideState.travelFlatFee}
                inheritedValue={baseProfile.travelFlatFee}
                unit="amount"
                onChange={updateField}
              />
              <RateField
                label="Taux au kilomètre (facultatif)"
                field="ratePerKm"
                value={overrideState.ratePerKm}
                inheritedValue={baseProfile.ratePerKm}
                unit="perKm"
                onChange={updateField}
              />
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              Ces champs servent pour les anciens forfaits manuels. Pour la
              configuration effective du kilométrage agent, utilise la carte
              ci-dessus (« Barème kilométrage par client »).
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      </fieldset>
    </div>
  );
}

// ===========================================================================
// OrgMileageRateCard — config effective du kilométrage agent pour un client.
// Edite OrgMileageRate (kmRoundTrip, billToClient) via
// PUT /api/v1/organizations/[id]/mileage-rate. `billToClient=false` change
// le comportement du bouton rapide « Ajouter un déplacement » dans Mon
// espace : l'ajout se fait en un clic comme dépense non refacturée au
// client (pas de ticket demandé).
// ===========================================================================
function OrgMileageRateCard({ organizationId }: { organizationId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [kmRoundTrip, setKmRoundTrip] = useState<string>("");
  const [billToClient, setBillToClient] = useState(true);
  // Mode de facturation : "km" (km A/R × taux global) ou "flat" (forfait fixe $).
  const [mode, setMode] = useState<"km" | "flat">("km");
  const [flatFee, setFlatFee] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/v1/organizations/${organizationId}/mileage-rate`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((d) => {
        if (d?.data) {
          setKmRoundTrip(String(d.data.kmRoundTrip ?? ""));
          setBillToClient(d.data.billToClient !== false);
          if (d.data.flatFee != null) {
            setFlatFee(String(d.data.flatFee));
            setMode("flat");
          } else {
            setFlatFee("");
            setMode("km");
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [organizationId]);

  async function save() {
    const km = Number(kmRoundTrip);
    if (!Number.isFinite(km) || km < 0) {
      setMsg({ kind: "err", text: "Km A/R invalide." });
      return;
    }
    let flatFeeValue: number | null = null;
    if (mode === "flat") {
      const f = Number(flatFee);
      if (!Number.isFinite(f) || f < 0) {
        setMsg({ kind: "err", text: "Forfait invalide." });
        return;
      }
      flatFeeValue = f;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/v1/organizations/${organizationId}/mileage-rate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kmRoundTrip: km,
          billToClient,
          // null = effacer le forfait (mode km), number = forfait actif
          flatFee: flatFeeValue,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setMsg({ kind: "err", text: d.error ?? `Erreur HTTP ${r.status}` });
        return;
      }
      setMsg({ kind: "ok", text: "Enregistré." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Car className="h-4 w-4 text-blue-600" />
          Barème kilométrage par client
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loaded ? (
          <div className="h-16 rounded-md bg-slate-50 animate-pulse" />
        ) : (
          <>
            {/* Mode de facturation : km A/R × taux ou forfait fixe. */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Mode de facturation au client
              </label>
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("km")}
                  className={cn(
                    "px-3 py-1.5 text-[12.5px] font-medium rounded transition-colors",
                    mode === "km" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  Au kilomètre
                </button>
                <button
                  type="button"
                  onClick={() => setMode("flat")}
                  className={cn(
                    "px-3 py-1.5 text-[12.5px] font-medium rounded transition-colors",
                    mode === "flat" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  Forfait fixe par déplacement
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Distance aller-retour (km)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={kmRoundTrip}
                  onChange={(e) => setKmRoundTrip(e.target.value)}
                  placeholder="Ex : 85"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {mode === "km"
                    ? "Le taux $/km est global (Paramètres → Allocations & kilométrage). Montant client = km A/R × taux global."
                    : "Utilisé uniquement pour rembourser l'agent (km A/R × taux global). La facturation au client utilise le forfait ci-contre."}
                </p>
              </div>
              {mode === "flat" ? (
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Forfait facturé au client ($)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={flatFee}
                    onChange={(e) => setFlatFee(e.target.value)}
                    placeholder="Ex : 75"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Chaque déplacement au ticket facture ce montant fixe au client,
                    indépendamment de la distance. L&apos;agent reste remboursé au
                    kilomètre selon le taux global.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <Switch
                    checked={billToClient}
                    onCheckedChange={setBillToClient}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-900">
                      Facturer le déplacement au client
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-600 leading-relaxed">
                      {billToClient
                        ? "Chaque déplacement est refacturé au client selon le barème ci-dessus."
                        : "Déplacement absorbé par Cetix (inclus au contrat, courtoisie, etc.). L'agent reste remboursé — le bouton rapide « Ajouter à mes dépenses » dans Mon espace ajoute alors le déplacement en un clic, sans ticket requis."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {mode === "flat" && (
              <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <Switch
                  checked={billToClient}
                  onCheckedChange={setBillToClient}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-900">
                    Facturer le déplacement au client
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-slate-600 leading-relaxed">
                    {billToClient
                      ? "Chaque déplacement facture le forfait ci-dessus au client."
                      : "Déplacement absorbé par Cetix. L'agent reste remboursé au kilomètre."}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button variant="primary" size="sm" onClick={save} disabled={saving || !kmRoundTrip}>
                <Save className="h-4 w-4" />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
              {msg && (
                <span
                  className={cn(
                    "text-[12px]",
                    msg.kind === "ok" ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {msg.text}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ClientBillingOverridesSection;
