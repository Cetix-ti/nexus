"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  FileText,
  Wallet,
  Repeat,
  Package,
  Layers,
  Monitor,
  Building2,
  Car,
  Zap,
  MoonStar,
  Eye,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  type Contract,
  type ContractStatus,
  type ContractType,
} from "@/lib/billing/types";
import { ContractModal } from "@/components/settings/contract-modal";

const CONTRACT_TYPE_ICONS: Record<ContractType, React.ComponentType<{ className?: string }>> = {
  msp_monthly: Repeat,
  hour_bank: Wallet,
  time_and_materials: FileText,
  prepaid_block: Package,
  hybrid: Layers,
};

const STATUS_VARIANTS: Record<ContractStatus, "success" | "warning" | "danger" | "default" | "primary"> = {
  active: "success",
  expiring_soon: "warning",
  expired: "danger",
  draft: "default",
  cancelled: "default",
};

function fmt(n: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ContractsSection() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Contract | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/v1/contracts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setContracts(data); })
      .catch((e) => console.error("contracts load failed", e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (
        search &&
        !`${c.name} ${c.organizationName} ${c.contractNumber}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      return true;
    });
  }, [contracts, search, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    return {
      total: contracts.length,
      active: contracts.filter((c) => c.status === "active").length,
      msp: contracts.filter((c) => c.type === "msp_monthly").length,
      bank: contracts.filter((c) => c.type === "hour_bank").length,
      tm: contracts.filter((c) => c.type === "time_and_materials").length,
    };
  }, [contracts]);

  function handleSave(c: Contract) {
    setContracts((prev) => {
      const exists = prev.some((x) => x.id === c.id);
      return exists ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c];
    });
    setEditing(null);
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Contrats clients
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Gérez les contrats et ententes de service
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nouveau contrat
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            placeholder="Rechercher un contrat, une organisation..."
            iconLeft={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="expiring_soon">Expire bientôt</SelectItem>
            <SelectItem value="expired">Expiré</SelectItem>
            <SelectItem value="cancelled">Annulé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total contrats" value={stats.total} />
        <StatCard label="Actifs" value={stats.active} accent="green" />
        <StatCard label="MSP mensuels" value={stats.msp} />
        <StatCard label="Banques d'heures" value={stats.bank} />
        <StatCard label="Temps & matériel" value={stats.tm} />
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((c) => (
          <ContractCard
            key={c.id}
            contract={c}
            onEdit={() => setEditing(c)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 py-16 text-center">
            <p className="text-[13px] text-slate-500">Aucun contrat trouvé</p>
          </div>
        )}
      </div>

      {(editing || creating) && (
        <ContractModal
          contract={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "green";
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-[20px] font-semibold tabular-nums ${
          accent === "green" ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ContractCard({
  contract,
  onEdit,
}: {
  contract: Contract;
  onEdit: () => void;
}) {
  const TypeIcon = CONTRACT_TYPE_ICONS[contract.type];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-slate-300/80">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
              {contract.organizationName}
            </h3>
            <span className="text-[12px] text-slate-400">·</span>
            <span className="text-[12.5px] font-mono text-slate-500">
              {contract.contractNumber}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-slate-700">{contract.name}</p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {contract.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <TypeIcon className="h-3 w-3" />
              {CONTRACT_TYPE_LABELS[contract.type]}
            </Badge>
            <Badge variant={STATUS_VARIANTS[contract.status]}>
              {CONTRACT_STATUS_LABELS[contract.status]}
            </Badge>
            <span className="text-[12px] text-slate-500">
              {fmtDate(contract.startDate)} → {fmtDate(contract.endDate)}
            </span>
          </div>

          {/* Hour bank progress */}
          {contract.type === "hour_bank" && contract.hourBank && (
            <HourBankProgress hb={contract.hourBank} />
          )}

          {/* MSP details */}
          {contract.type === "msp_monthly" && contract.mspPlan && (
            <MSPSummary plan={contract.mspPlan} />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm">
            <Eye className="h-4 w-4" />
            Voir détails
          </Button>
          <Button variant="primary" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Modifier
          </Button>
        </div>
      </div>
    </div>
  );
}

function HourBankProgress({
  hb,
}: {
  hb: NonNullable<Contract["hourBank"]>;
}) {
  const pct = Math.min(100, (hb.hoursConsumed / hb.totalHoursPurchased) * 100);
  const remaining = hb.totalHoursPurchased - hb.hoursConsumed;
  const color =
    pct > 95 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/40 p-3">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-medium text-slate-700">
          {hb.hoursConsumed} h / {hb.totalHoursPurchased} h consommées
        </span>
        <span
          className={`font-semibold tabular-nums ${
            remaining < 5 ? "text-red-600" : "text-slate-700"
          }`}
        >
          {remaining.toFixed(1)} h restantes
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-slate-500">
        <span>{pct.toFixed(0)}% utilisé</span>
        <span>
          Dépassement :{" "}
          <span className="font-medium text-slate-700">
            {fmt(hb.overageRate)}/h
          </span>
        </span>
      </div>
    </div>
  );
}

function MSPSummary({
  plan,
}: {
  plan: NonNullable<Contract["mspPlan"]>;
}) {
  const chips: { icon: React.ComponentType<{ className?: string }>; label: string; on: boolean }[] = [
    { icon: Building2, label: "Sur site", on: plan.includesOnsiteSupport },
    { icon: Monitor, label: "À distance", on: plan.includesRemoteSupport },
    { icon: Car, label: "Déplacements", on: plan.includesTravel },
    { icon: Zap, label: "Urgent", on: plan.includesUrgent },
    { icon: MoonStar, label: "Après-heures", on: plan.includesAfterHours },
  ];

  return (
    <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-slate-500">Forfait mensuel</span>
        <span className="text-[16px] font-semibold tabular-nums text-slate-900">
          {fmt(plan.monthlyAmount)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const Icon = c.icon;
          return (
            <span
              key={c.label}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ${
                c.on
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60"
                  : "bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200/60"
              }`}
            >
              <Icon className="h-3 w-3" />
              {c.label}
            </span>
          );
        })}
      </div>
      {plan.hasMonthlyCap && plan.monthlyCapHours && (
        <div className="mt-2 text-[11.5px] text-slate-500">
          Plafond mensuel :{" "}
          <span className="font-medium text-slate-700">
            {plan.monthlyCapHours} h
          </span>
        </div>
      )}
    </div>
  );
}
