"use client";

import { useState } from "react";
import { X, FileText, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  TIME_TYPE_LABELS,
  type Contract,
  type ContractStatus,
  type ContractType,
  type HourBankSettings,
  type MSPPlanSettings,
  type TimeType,
} from "@/lib/billing/types";
import { mockBillingProfiles } from "@/lib/billing/mock-data";

const ORGANIZATIONS = [
  { id: "org_acme", name: "Acme Corp" },
  { id: "org_techstart", name: "TechStart Inc" },
  { id: "org_global", name: "Global Finance" },
  { id: "org_health", name: "HealthCare Plus" },
  { id: "org_media", name: "MédiaCentre QC" },
];

const ALL_TIME_TYPES = Object.keys(TIME_TYPE_LABELS) as TimeType[];

const TABS = [
  { key: "general", label: "Informations générales" },
  { key: "config", label: "Configuration" },
  { key: "preview", label: "Aperçu" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const DEFAULT_HB: HourBankSettings = {
  totalHoursPurchased: 50,
  hoursConsumed: 0,
  eligibleTimeTypes: ["remote_work", "onsite_work", "preparation", "follow_up"],
  carryOverHours: false,
  allowOverage: true,
  overageRate: 145,
  includesTravel: false,
  includesOnsite: true,
  validFrom: new Date().toISOString().slice(0, 10),
  validTo: "",
};

const DEFAULT_MSP: MSPPlanSettings = {
  monthlyAmount: 2500,
  includedTimeTypes: ["remote_work", "onsite_work", "preparation", "follow_up"],
  includesRemoteSupport: true,
  includesOnsiteSupport: true,
  includesTravel: false,
  includesKilometers: false,
  includesUrgent: false,
  includesAfterHours: false,
  includesProjects: false,
  includesRecurringWork: true,
  hasMonthlyCap: false,
  monthlyCapHours: 40,
  excludedCategoryIds: [],
  customExceptions: [],
};

export function ContractModal({
  contract,
  onClose,
  onSave,
}: {
  contract: Contract | null;
  onClose: () => void;
  onSave: (c: Contract) => void;
}) {
  const [tab, setTab] = useState<TabKey>("general");
  const [draft, setDraft] = useState<Contract>(
    contract || {
      id: `contract_new_${Date.now()}`,
      organizationId: "",
      organizationName: "",
      name: "",
      contractNumber: "",
      type: "msp_monthly",
      status: "draft",
      billingProfileId: mockBillingProfiles[0]?.id ?? "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      description: "",
      mspPlan: { ...DEFAULT_MSP },
      autoRenew: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );

  function set<K extends keyof Contract>(k: K, v: Contract[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function setHB<K extends keyof HourBankSettings>(k: K, v: HourBankSettings[K]) {
    setDraft((d) => ({
      ...d,
      hourBank: { ...(d.hourBank || DEFAULT_HB), [k]: v },
    }));
  }

  function setMSP<K extends keyof MSPPlanSettings>(k: K, v: MSPPlanSettings[K]) {
    setDraft((d) => ({
      ...d,
      mspPlan: { ...(d.mspPlan || DEFAULT_MSP), [k]: v },
    }));
  }

  function changeType(t: ContractType) {
    setDraft((d) => {
      const next: Contract = { ...d, type: t };
      if (t === "hour_bank" && !next.hourBank) next.hourBank = { ...DEFAULT_HB };
      if (t === "msp_monthly" && !next.mspPlan) next.mspPlan = { ...DEFAULT_MSP };
      return next;
    });
  }

  function toggleTimeType(
    list: TimeType[],
    t: TimeType,
    setter: (next: TimeType[]) => void
  ) {
    setter(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...draft, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-6">
      <div className="relative my-8 w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <FileText className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {contract ? "Modifier le contrat" : "Nouveau contrat"}
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Configurez les paramètres et inclusions du contrat
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

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative px-3 py-3 text-[13px] font-medium transition-colors",
                tab === t.key
                  ? "text-blue-600"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {tab === "general" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Organisation
                  </label>
                  <Select
                    value={draft.organizationId}
                    onValueChange={(v) => {
                      const org = ORGANIZATIONS.find((o) => o.id === v);
                      setDraft((d) => ({
                        ...d,
                        organizationId: v,
                        organizationName: org?.name ?? "",
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ORGANIZATIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Numéro de contrat"
                  value={draft.contractNumber}
                  onChange={(e) => set("contractNumber", e.target.value)}
                />
              </div>

              <Input
                label="Nom du contrat"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Type de contrat
                  </label>
                  <Select
                    value={draft.type}
                    onValueChange={(v) => changeType(v as ContractType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map(
                        (t) => (
                          <SelectItem key={t} value={t}>
                            {CONTRACT_TYPE_LABELS[t]}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Profil de facturation
                  </label>
                  <Select
                    value={draft.billingProfileId}
                    onValueChange={(v) => set("billingProfileId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {mockBillingProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="Date de début"
                  type="date"
                  value={draft.startDate?.slice(0, 10) ?? ""}
                  onChange={(e) => set("startDate", e.target.value)}
                />
                <Input
                  label="Date de fin"
                  type="date"
                  value={draft.endDate?.slice(0, 10) ?? ""}
                  onChange={(e) => set("endDate", e.target.value)}
                />
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Statut
                  </label>
                  <Select
                    value={draft.status}
                    onValueChange={(v) => set("status", v as ContractStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]
                      ).map((s) => (
                        <SelectItem key={s} value={s}>
                          {CONTRACT_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50/40 px-4 py-3">
                <Switch
                  checked={draft.autoRenew}
                  onCheckedChange={(v) => set("autoRenew", v)}
                />
                <span className="text-[13px] text-slate-700">
                  Auto-renouvellement à l&apos;échéance
                </span>
              </div>
            </div>
          )}

          {tab === "config" && (
            <div className="space-y-5">
              {draft.type === "hour_bank" && (
                <HourBankConfig
                  hb={draft.hourBank || DEFAULT_HB}
                  setHB={setHB}
                  toggleTimeType={(t) =>
                    toggleTimeType(
                      (draft.hourBank || DEFAULT_HB).eligibleTimeTypes,
                      t,
                      (next) => setHB("eligibleTimeTypes", next)
                    )
                  }
                />
              )}
              {draft.type === "msp_monthly" && (
                <MSPConfig
                  plan={draft.mspPlan || DEFAULT_MSP}
                  setMSP={setMSP}
                  toggleTimeType={(t) =>
                    toggleTimeType(
                      (draft.mspPlan || DEFAULT_MSP).includedTimeTypes,
                      t,
                      (next) => setMSP("includedTimeTypes", next)
                    )
                  }
                />
              )}
              {(draft.type === "time_and_materials" ||
                draft.type === "prepaid_block" ||
                draft.type === "hybrid") && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-5 text-[13px] text-slate-600">
                  <h4 className="mb-1 text-[14px] font-semibold text-slate-900">
                    {CONTRACT_TYPE_LABELS[draft.type]}
                  </h4>
                  {draft.type === "time_and_materials" && (
                    <p>
                      Facturation au temps passé selon le profil de
                      facturation sélectionné. Aucune configuration
                      additionnelle requise — chaque entrée de temps approuvée
                      sera facturée au taux applicable.
                    </p>
                  )}
                  {draft.type === "prepaid_block" && (
                    <p>
                      Bloc d&apos;heures ou de montant prépayé. Le suivi de
                      consommation sera disponible dans une prochaine mise à
                      jour.
                    </p>
                  )}
                  {draft.type === "hybrid" && (
                    <p>
                      Combinaison d&apos;un forfait MSP et d&apos;une banque
                      d&apos;heures. Configuration avancée à venir.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "preview" && <Preview contract={draft} />}

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

function HourBankConfig({
  hb,
  setHB,
  toggleTimeType,
}: {
  hb: HourBankSettings;
  setHB: <K extends keyof HourBankSettings>(k: K, v: HourBankSettings[K]) => void;
  toggleTimeType: (t: TimeType) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Heures achetées"
          type="number"
          value={hb.totalHoursPurchased}
          onChange={(e) => setHB("totalHoursPurchased", Number(e.target.value))}
        />
        <Input
          label="Taux de dépassement ($/h)"
          type="number"
          value={hb.overageRate}
          onChange={(e) => setHB("overageRate", Number(e.target.value))}
        />
        <Input
          label="Valide à partir du"
          type="date"
          value={hb.validFrom?.slice(0, 10) ?? ""}
          onChange={(e) => setHB("validFrom", e.target.value)}
        />
        <Input
          label="Valide jusqu'au"
          type="date"
          value={hb.validTo?.slice(0, 10) ?? ""}
          onChange={(e) => setHB("validTo", e.target.value)}
        />
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
          Types de temps déductibles
        </h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_TIME_TYPES.map((t) => {
            const checked = hb.eligibleTimeTypes.includes(t);
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

      <div className="space-y-2">
        <ToggleRow
          label="Reporter les heures non utilisées"
          checked={hb.carryOverHours}
          onChange={(v) => setHB("carryOverHours", v)}
        />
        <ToggleRow
          label="Accepter le dépassement"
          checked={hb.allowOverage}
          onChange={(v) => setHB("allowOverage", v)}
        />
        <ToggleRow
          label="Inclure les déplacements"
          checked={hb.includesTravel}
          onChange={(v) => setHB("includesTravel", v)}
        />
        <ToggleRow
          label="Inclure les interventions sur site"
          checked={hb.includesOnsite}
          onChange={(v) => setHB("includesOnsite", v)}
        />
      </div>
    </div>
  );
}

function MSPConfig({
  plan,
  setMSP,
  toggleTimeType,
}: {
  plan: MSPPlanSettings;
  setMSP: <K extends keyof MSPPlanSettings>(k: K, v: MSPPlanSettings[K]) => void;
  toggleTimeType: (t: TimeType) => void;
}) {
  return (
    <div className="space-y-5">
      <Input
        label="Montant mensuel ($)"
        type="number"
        value={plan.monthlyAmount}
        onChange={(e) => setMSP("monthlyAmount", Number(e.target.value))}
      />

      <div>
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
          Types de temps inclus
        </h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_TIME_TYPES.map((t) => {
            const checked = plan.includedTimeTypes.includes(t);
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

      <div>
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
          Inclusions
        </h4>
        <div className="space-y-2">
          <ToggleRow
            label="Support à distance"
            checked={plan.includesRemoteSupport}
            onChange={(v) => setMSP("includesRemoteSupport", v)}
          />
          <ToggleRow
            label="Support sur site"
            checked={plan.includesOnsiteSupport}
            onChange={(v) => setMSP("includesOnsiteSupport", v)}
          />
          <ToggleRow
            label="Déplacements (heures)"
            checked={plan.includesTravel}
            onChange={(v) => setMSP("includesTravel", v)}
          />
          <ToggleRow
            label="Kilométrage"
            checked={plan.includesKilometers}
            onChange={(v) => setMSP("includesKilometers", v)}
          />
          <ToggleRow
            label="Interventions urgentes"
            checked={plan.includesUrgent}
            onChange={(v) => setMSP("includesUrgent", v)}
          />
          <ToggleRow
            label="Travail après-heures"
            checked={plan.includesAfterHours}
            onChange={(v) => setMSP("includesAfterHours", v)}
          />
          <ToggleRow
            label="Projets"
            checked={plan.includesProjects}
            onChange={(v) => setMSP("includesProjects", v)}
          />
          <ToggleRow
            label="Travail récurrent"
            checked={plan.includesRecurringWork}
            onChange={(v) => setMSP("includesRecurringWork", v)}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
        <ToggleRow
          label="Plafond mensuel d'heures"
          checked={plan.hasMonthlyCap}
          onChange={(v) => setMSP("hasMonthlyCap", v)}
        />
        {plan.hasMonthlyCap && (
          <Input
            label="Plafond (heures/mois)"
            type="number"
            value={plan.monthlyCapHours ?? 0}
            onChange={(e) => setMSP("monthlyCapHours", Number(e.target.value))}
          />
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Exceptions personnalisées
        </label>
        <textarea
          value={plan.customExceptions.join("\n")}
          onChange={(e) =>
            setMSP(
              "customExceptions",
              e.target.value.split("\n").filter((l) => l.trim())
            )
          }
          rows={3}
          placeholder="Une exception par ligne..."
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3.5 py-2.5">
      <span className="text-[13px] text-slate-700">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Preview({ contract }: { contract: Contract }) {
  const covered: string[] = [];
  const notCovered: string[] = [];

  if (contract.type === "msp_monthly" && contract.mspPlan) {
    const p = contract.mspPlan;
    const checks: [boolean, string][] = [
      [p.includesRemoteSupport, "Support à distance"],
      [p.includesOnsiteSupport, "Support sur site"],
      [p.includesTravel, "Déplacements"],
      [p.includesKilometers, "Kilométrage"],
      [p.includesUrgent, "Interventions urgentes"],
      [p.includesAfterHours, "Travail après-heures"],
      [p.includesProjects, "Projets"],
      [p.includesRecurringWork, "Travail récurrent"],
    ];
    checks.forEach(([on, label]) => (on ? covered : notCovered).push(label));
  }

  if (contract.type === "hour_bank" && contract.hourBank) {
    const hb = contract.hourBank;
    if (hb.includesOnsite) covered.push("Interventions sur site");
    else notCovered.push("Interventions sur site");
    if (hb.includesTravel) covered.push("Déplacements");
    else notCovered.push("Déplacements");
    if (hb.allowOverage) covered.push(`Dépassement autorisé (${hb.overageRate} $/h)`);
    if (hb.carryOverHours) covered.push("Report des heures non utilisées");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="mb-3">
          <h4 className="text-[15px] font-semibold tracking-tight text-slate-900">
            {contract.name || "Contrat sans nom"}
          </h4>
          <p className="text-[12.5px] text-slate-500">
            {contract.organizationName || "—"} · {CONTRACT_TYPE_LABELS[contract.type]}
          </p>
        </div>

        {contract.type === "msp_monthly" && contract.mspPlan && (
          <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-blue-700">
              Forfait mensuel
            </div>
            <div className="text-[20px] font-semibold tabular-nums text-blue-900">
              {new Intl.NumberFormat("fr-CA", {
                style: "currency",
                currency: "CAD",
                maximumFractionDigits: 0,
              }).format(contract.mspPlan.monthlyAmount)}
            </div>
          </div>
        )}

        {contract.type === "hour_bank" && contract.hourBank && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
              Banque d&apos;heures
            </div>
            <div className="text-[20px] font-semibold tabular-nums text-emerald-900">
              {contract.hourBank.totalHoursPurchased} h
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h5 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-emerald-700">
              Couvert
            </h5>
            <ul className="space-y-1.5">
              {covered.length === 0 && (
                <li className="text-[12.5px] text-slate-400">—</li>
              )}
              {covered.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2 text-[12.5px] text-slate-700"
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Non couvert
            </h5>
            <ul className="space-y-1.5">
              {notCovered.length === 0 && (
                <li className="text-[12.5px] text-slate-400">—</li>
              )}
              {notCovered.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2 text-[12.5px] text-slate-500"
                >
                  <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {contract.mspPlan?.customExceptions?.length ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h5 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-amber-700">
              Exceptions
            </h5>
            <ul className="space-y-1">
              {contract.mspPlan.customExceptions.map((ex, i) => (
                <li key={i} className="text-[12.5px] text-slate-600">
                  · {ex}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
