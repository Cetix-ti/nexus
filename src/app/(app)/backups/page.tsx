"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  HardDrive,
  Building2,
  Clock,
  Search,
  Settings,
  ArrowLeft,
  ChevronRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VeeamAlert {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  jobName: string;
  status: "SUCCESS" | "WARNING" | "FAILED";
  senderEmail: string;
  senderName: string | null;
  senderDomain: string;
  subject: string;
  bodySnippet: string;
  receivedAt: string;
}

interface StatusCount {
  status: string;
  _count: number;
}

interface OrgStatusCount {
  organizationId: string | null;
  organizationName: string | null;
  status: string;
  _count: number;
  logo: string | null;
}

interface DashboardData {
  alerts: VeeamAlert[];
  stats: StatusCount[];
  orgStats: OrgStatusCount[];
  since: string;
}

interface ExpiryInfo {
  expiryDate: string | null;
  daysLeft: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

interface OrgSummaryItem {
  orgId: string | null;
  orgName: string;
  logo: string | null;
  SUCCESS: number;
  WARNING: number;
  FAILED: number;
  total: number;
  lastAlert: string;
}

// Current view: overview or drilled into a specific org/status
interface ViewState {
  type: "overview" | "org" | "status";
  orgId?: string | null;
  orgName?: string;
  status?: "SUCCESS" | "WARNING" | "FAILED";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CONFIG = {
  SUCCESS: {
    label: "Succès",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200/60",
    badge: "success" as const,
  },
  WARNING: {
    label: "Avertissement",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    ring: "ring-amber-200/60",
    badge: "warning" as const,
  },
  FAILED: {
    label: "Échec",
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    ring: "ring-red-200/60",
    badge: "danger" as const,
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BackupsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [expiry, setExpiry] = useState<ExpiryInfo | null>(null);
  const [view, setView] = useState<ViewState>({ type: "overview" });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    fetch("/api/v1/settings/veeam")
      .then((r) => r.json())
      .then((d) => {
        if (d?.expiry) setExpiry(d.expiry);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/veeam/alerts?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/v1/veeam/sync", { method: "POST" });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const result = await res.json();
      if (result.errors?.length) {
        setSyncError(result.errors.join("; "));
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
      load();
    }
  }

  // Navigate into a specific org or status
  function drillOrg(orgId: string | null, orgName: string) {
    setView({ type: "org", orgId, orgName });
    setSearch("");
    setStatusFilter("all");
    setOrgFilter("all");
    setCurrentPage(0);
  }

  function drillStatus(status: "SUCCESS" | "WARNING" | "FAILED") {
    setView({ type: "status", status });
    setSearch("");
    setStatusFilter(status);
    setOrgFilter("all");
    setCurrentPage(0);
  }

  function goBack() {
    setView({ type: "overview" });
    setSearch("");
    setStatusFilter("all");
    setOrgFilter("all");
    setCurrentPage(0);
  }

  // ---- Derived data ----
  const statCounts = useMemo(() => {
    if (!data) return { SUCCESS: 0, WARNING: 0, FAILED: 0, total: 0 };
    const m = { SUCCESS: 0, WARNING: 0, FAILED: 0 };
    for (const s of data.stats) {
      if (s.status in m) m[s.status as keyof typeof m] = s._count;
    }
    return { ...m, total: m.SUCCESS + m.WARNING + m.FAILED };
  }, [data]);

  const orgSummary = useMemo((): OrgSummaryItem[] => {
    if (!data) return [];
    const map = new Map<string, OrgSummaryItem>();
    for (const row of data.orgStats) {
      const key = row.organizationId ?? "_unmatched";
      if (!map.has(key)) {
        map.set(key, {
          orgId: row.organizationId,
          orgName: row.organizationName ?? "Non associé",
          logo: row.logo ?? null,
          SUCCESS: 0,
          WARNING: 0,
          FAILED: 0,
          total: 0,
          lastAlert: "",
        });
      }
      const entry = map.get(key)!;
      entry[row.status as "SUCCESS" | "WARNING" | "FAILED"] += row._count;
      entry.total += row._count;
    }
    for (const alert of data.alerts) {
      const key = alert.organizationId ?? "_unmatched";
      const entry = map.get(key);
      if (entry && (!entry.lastAlert || alert.receivedAt > entry.lastAlert)) {
        entry.lastAlert = alert.receivedAt;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.FAILED !== b.FAILED) return b.FAILED - a.FAILED;
      if (a.WARNING !== b.WARNING) return b.WARNING - a.WARNING;
      return a.orgName.localeCompare(b.orgName, "fr");
    });
  }, [data]);

  // Filtered alerts based on current view + search + status filter
  // Unique org names for the filter dropdown
  const orgNames = useMemo(() => {
    if (!data) return [];
    const names = new Set<string>();
    for (const a of data.alerts) {
      names.add(a.organizationName ?? "Non associé");
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "fr"));
  }, [data]);

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    return data.alerts.filter((a) => {
      // View filter
      if (view.type === "org") {
        if (view.orgId === null) {
          if (a.organizationId !== null) return false;
        } else if (a.organizationId !== view.orgId) return false;
      }
      if (view.type === "status" && a.status !== view.status) return false;

      // Status dropdown filter
      if (statusFilter !== "all" && a.status !== statusFilter) return false;

      // Org dropdown filter
      if (orgFilter !== "all") {
        const alertOrgName = a.organizationName ?? "Non associé";
        if (alertOrgName !== orgFilter) return false;
      }

      // Search
      if (search) {
        const q = search.toLowerCase();
        const hay = [a.jobName, a.organizationName, a.senderEmail, a.senderName, a.subject]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, view, statusFilter, orgFilter, search]);

  // Current org detail (when drilled in)
  const currentOrg = useMemo(() => {
    if (view.type !== "org") return null;
    return (
      orgSummary.find(
        (o) =>
          (view.orgId === null && o.orgId === null) ||
          o.orgId === view.orgId,
      ) ?? null
    );
  }, [view, orgSummary]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ================================================================ */}
      {/* Header                                                           */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {view.type !== "overview" && (
            <button
              onClick={goBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
                Sauvegardes
              </h1>
              {view.type !== "overview" && (
                <>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                  <span className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
                    {view.type === "org"
                      ? view.orgName
                      : STATUS_CONFIG[view.status!].label}
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              {view.type === "overview"
                ? `État des tâches Veeam — derniers ${days} jours`
                : view.type === "org"
                  ? `${filteredAlerts.length} alertes pour ce client`
                  : `${filteredAlerts.length} alertes avec ce statut`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={String(days)}
            onValueChange={(v) => setDays(Number(v))}
          >
            <SelectTrigger className="w-32">
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
          <Button
            variant="primary"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Synchroniser
          </Button>
        </div>
      </div>

      {/* Banners */}
      {expiry?.isExpired && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 flex items-center gap-2 text-[12px] text-red-900">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Secret Azure expiré</strong> le {expiry.expiryDate}.
            Renouvelez-le dans Entra ID.
          </span>
        </div>
      )}
      {expiry?.isExpiringSoon && !expiry.isExpired && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-2 text-[12px] text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Le secret Azure expire le {expiry.expiryDate} ({expiry.daysLeft}{" "}
            jours).
          </span>
        </div>
      )}
      {syncError && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-[12px] text-red-900 flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {/* ================================================================ */}
      {/* Stat cards — clickable to filter by status                       */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total alertes"
          value={statCounts.total}
          icon={<HardDrive className="h-4 w-4 text-slate-600" />}
          bgClass="bg-slate-50"
          active={view.type === "overview"}
          onClick={goBack}
        />
        {(["SUCCESS", "WARNING", "FAILED"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <StatCard
              key={s}
              label={cfg.label}
              value={statCounts[s]}
              icon={<Icon className={cn("h-4 w-4", cfg.color)} />}
              bgClass={cfg.bg}
              active={view.type === "status" && view.status === s}
              onClick={() => drillStatus(s)}
            />
          );
        })}
      </div>

      {/* ================================================================ */}
      {/* AI daily summary                                                 */}
      {/* ================================================================ */}
      {view.type === "overview" && <AiDailySummary />}

      {/* ================================================================ */}
      {/* Org detail header (when drilled into a client)                   */}
      {/* ================================================================ */}
      {view.type === "org" && currentOrg && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <OrgAvatar
                logo={currentOrg.logo}
                name={currentOrg.orgName}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-[17px] font-semibold text-slate-900">
                  {currentOrg.orgName}
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {currentOrg.total} alerte
                  {currentOrg.total > 1 ? "s" : ""} sur les {days} derniers
                  jours
                </p>
              </div>
              <div className="flex items-center gap-3 sm:gap-6">
                {(["SUCCESS", "WARNING", "FAILED"] as const).map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  const count = currentOrg[s];
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setStatusFilter(statusFilter === s ? "all" : s)
                      }
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition-colors",
                        statusFilter === s
                          ? `${cfg.bg} ring-1 ring-inset ${cfg.ring}`
                          : "hover:bg-slate-50",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", cfg.color)} />
                      <span
                        className={cn(
                          "text-[16px] font-bold tabular-nums",
                          cfg.color,
                        )}
                      >
                        {count}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================ */}
      {/* Per-org tiles — only on overview                                 */}
      {/* ================================================================ */}
      {view.type === "overview" && (
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            État par client
          </h2>
          {orgSummary.length === 0 ? (
            <Card>
              <CardContent className="py-12 flex flex-col items-center gap-3 text-[13px] text-slate-400">
                <HardDrive className="h-10 w-10" strokeWidth={1.5} />
                <p>Aucune alerte Veeam trouvée.</p>
                <Link
                  href="/settings?section=veeam"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Configurer la connexion dans Paramètres
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {orgSummary.map((org) => {
                const worst: "FAILED" | "WARNING" | "SUCCESS" =
                  org.FAILED > 0
                    ? "FAILED"
                    : org.WARNING > 0
                      ? "WARNING"
                      : "SUCCESS";
                const cfg = STATUS_CONFIG[worst];
                return (
                  <Card
                    key={org.orgId ?? "_unmatched"}
                    className={cn(
                      "transition-all cursor-pointer hover:shadow-md",
                      worst === "FAILED" && "ring-1 ring-red-200/80",
                      worst === "WARNING" && "ring-1 ring-amber-200/80",
                    )}
                    onClick={() => drillOrg(org.orgId, org.orgName)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <OrgAvatar
                          logo={org.logo}
                          name={org.orgName}
                          size="sm"
                        />
                        <h3 className="text-[13px] font-semibold text-slate-900 truncate flex-1">
                          {org.orgName}
                        </h3>
                        <Badge variant={cfg.badge} className="text-[10px] shrink-0">
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-[12px]">
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {org.SUCCESS}
                        </span>
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {org.WARNING}
                        </span>
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="h-3 w-3" />
                          {org.FAILED}
                        </span>
                        {org.lastAlert && (
                          <span className="ml-auto text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(org.lastAlert)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Alert table — always visible, filtered by view                   */}
      {/* ================================================================ */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            {view.type === "overview"
              ? "Historique des alertes"
              : "Alertes"}
          </h2>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              iconLeft={<Search className="h-3.5 w-3.5" />}
              className="w-48"
            />
            {view.type !== "org" && (
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clients</SelectItem>
                  {orgNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {view.type !== "status" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="SUCCESS">Succès</SelectItem>
                  <SelectItem value="WARNING">Avertissement</SelectItem>
                  <SelectItem value="FAILED">Échec</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Statut
                  </th>
                  {view.type !== "org" && (
                    <th className="px-4 py-3 font-medium text-slate-500">
                      Client
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Expéditeur
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-500 min-w-[350px]">
                    Tâche Veeam
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Reçu
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAlerts.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((a) => {
                  const cfg = STATUS_CONFIG[a.status];
                  const Icon = cfg.icon;
                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset",
                              cfg.bg,
                              cfg.ring,
                              cfg.color,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <Badge
                            variant={cfg.badge}
                            className="text-[10.5px]"
                          >
                            {cfg.label}
                          </Badge>
                        </div>
                      </td>
                      {view.type !== "org" && (
                        <td className="px-4 py-3 text-[12.5px]">
                          {a.organizationName ? (
                            <button
                              onClick={() =>
                                drillOrg(
                                  a.organizationId,
                                  a.organizationName!,
                                )
                              }
                              className="text-slate-700 font-medium hover:text-blue-600 transition-colors"
                            >
                              {a.organizationName}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                drillOrg(null, "Non associé")
                              }
                              className="text-slate-400 italic hover:text-slate-600 transition-colors"
                            >
                              Non associé
                            </button>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-[12.5px]">
                        {a.senderName ? (
                          <>
                            <p className="font-medium text-slate-700 truncate max-w-[220px]">
                              {a.senderName}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 truncate max-w-[220px]">
                              {a.senderEmail}
                            </p>
                          </>
                        ) : (
                          <p className="font-mono text-[12px] text-slate-500 truncate max-w-[220px]">
                            {a.senderEmail}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-slate-900 truncate max-w-[500px]">
                          {a.jobName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[500px]">
                          {a.subject}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">
                        {fmtDate(a.receivedAt)}
                      </td>
                    </tr>
                  );
                })}
                {filteredAlerts.length === 0 && (
                  <tr>
                    <td
                      colSpan={view.type === "org" ? 4 : 5}
                      className="px-4 py-16 text-center text-[13px] text-slate-400"
                    >
                      <HardDrive
                        className="h-10 w-10 mx-auto mb-2"
                        strokeWidth={1.5}
                      />
                      {data?.alerts.length === 0
                        ? "Aucune alerte Veeam. Synchronisez la boîte mail depuis Paramètres."
                        : "Aucun résultat pour ce filtre."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredAlerts.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <div className="flex items-center gap-2 text-[12px] text-slate-500">
                <span>
                  {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filteredAlerts.length)} sur {filteredAlerts.length}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
                  className="h-7 rounded border border-slate-200 bg-white px-1.5 text-[12px] text-slate-600"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="h-7 px-2 rounded border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={(currentPage + 1) * pageSize >= filteredAlerts.length}
                  className="h-7 px-2 rounded border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
          {filteredAlerts.length > 0 && filteredAlerts.length <= pageSize && (
            <div className="px-4 py-2 border-t border-slate-200 text-[11px] text-slate-400">
              {filteredAlerts.length} résultat{filteredAlerts.length > 1 ? "s" : ""}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OrgAvatar({
  logo,
  name,
  size = "sm",
}: {
  logo: string | null;
  name: string;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  const textSize = size === "lg" ? "text-[16px]" : "text-[12px]";
  const rounding = size === "lg" ? "rounded-xl" : "rounded-lg";

  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className={cn(
          dim,
          rounding,
          "shrink-0 object-contain bg-white ring-1 ring-slate-200",
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        rounding,
        textSize,
        "shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-slate-500 to-slate-700",
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function AiDailySummary() {
  const [data, setData] = useState<{
    html: string;
    generatedAt: string;
    alertCount: number;
    failed: number;
    warning: number;
    success: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Auto-load cached summary on mount
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    fetch("/api/v1/veeam/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.html) setData(d);
      })
      .catch(() => {});
  }, [loaded]);

  function loadSummary() {
    setLoading(true);
    setError(null);
    fetch("/api/v1/veeam/summary?refresh=1")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setCollapsed(false);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Rapport matinal IA
              </h3>
              {data?.generatedAt && (
                <p className="text-[11px] text-slate-400">
                  Généré {fmtDate(data.generatedAt)} — {data.failed} échec
                  {data.failed > 1 ? "s" : ""}, {data.warning} avert.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title={collapsed ? "Afficher" : "Masquer"}
              >
                {collapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadSummary}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {loading
                ? "Analyse..."
                : data
                  ? "Rafraîchir"
                  : "Générer le rapport"}
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[12px] text-red-600">{error}</p>
        )}

        {data && !collapsed && (
          <div className="mt-4">
            {/* Quick stat pills */}
            {data.failed > 0 && (
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-700 ring-1 ring-inset ring-red-200/60">
                  <XCircle className="h-3 w-3" />
                  {data.failed} échec{data.failed > 1 ? "s" : ""}
                </span>
                {data.warning > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/60">
                    <AlertTriangle className="h-3 w-3" />
                    {data.warning} avert.
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  sur {data.alertCount} alertes totales
                </span>
              </div>
            )}

            {/* Rich HTML content from AI */}
            <div
              className="ai-summary-content rounded-xl border border-slate-200/80 bg-white p-4 overflow-x-auto max-w-full [&_table]:text-[11px] [&_table]:w-full [&_pre]:overflow-x-auto [&_pre]:text-[11px] [&_img]:max-w-full"
              dangerouslySetInnerHTML={{ __html: data.html }}
            />
          </div>
        )}

        {!data && !loading && (
          <p className="mt-3 text-[12px] text-slate-400">
            Cliquez sur « Générer le rapport » pour une analyse IA des
            échecs et avertissements des dernières 24 heures.
          </p>
        )}
      </CardContent>

      {/* Scoped styles for AI-generated HTML */}
      <style jsx global>{`
        .ai-summary-content p.summary,
        .ai-summary-content > p:first-child {
          font-size: 13px;
          line-height: 1.7;
          color: #334155;
          margin-bottom: 14px;
        }
        .ai-summary-content p.recommendation {
          font-size: 12.5px;
          line-height: 1.6;
          color: #1e40af;
          background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
          border: 1px solid #bfdbfe;
          border-left: 3px solid #3b82f6;
          border-radius: 8px;
          padding: 12px 16px;
          margin-top: 14px;
        }
        .ai-summary-content table {
          width: 100%;
          font-size: 12.5px;
          border-collapse: separate;
          border-spacing: 0;
          margin: 10px 0;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
        }
        .ai-summary-content thead th {
          text-align: left;
          padding: 10px 14px;
          font-weight: 600;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
        }
        .ai-summary-content tbody td {
          padding: 10px 14px;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .ai-summary-content tbody td[rowspan],
        .ai-summary-content tbody td.client-cell {
          font-weight: 600;
          color: #0f172a;
          background: #f8fafc;
          border-right: 1px solid #e2e8f0;
        }
        .ai-summary-content tbody td.server-cell {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11.5px;
          color: #6366f1;
          font-weight: 500;
        }
        .ai-summary-content tbody tr:last-child td {
          border-bottom: none;
        }
        .ai-summary-content tbody tr:hover td {
          background: #f8fafc;
        }
        .ai-summary-content tbody tr:hover td[rowspan] {
          background: #f1f5f9;
        }
        .ai-summary-content td.status-failed,
        .ai-summary-content .status-failed {
          color: #dc2626;
          font-weight: 700;
          background: #fef2f2;
          border-radius: 0;
        }
        .ai-summary-content td.status-warning,
        .ai-summary-content .status-warning {
          color: #d97706;
          font-weight: 700;
          background: #fffbeb;
        }
        .ai-summary-content td.failed,
        .ai-summary-content .failed {
          color: #dc2626;
          font-weight: 700;
          background: #fef2f2;
        }
        .ai-summary-content td.warning,
        .ai-summary-content .warning {
          color: #d97706;
          font-weight: 700;
          background: #fffbeb;
        }
        .ai-summary-content td.success,
        .ai-summary-content .success {
          color: #059669;
          font-weight: 600;
        }

        /* Section "Avertissements à surveiller" — discrète, moins prominente
           que le tableau d'échecs. Ton sur ton ambre pâle, typo plus petite. */
        .ai-summary-content .warnings-section {
          margin-top: 14px;
          padding: 10px 14px;
          background: #fffbeb;
          border-left: 3px solid #f59e0b;
          border-radius: 0 6px 6px 0;
        }
        .ai-summary-content .warnings-title {
          margin: 0 0 6px 0;
          font-size: 11.5px;
          font-weight: 600;
          color: #92400e;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ai-summary-content .warnings-list {
          margin: 0;
          padding-left: 18px;
          font-size: 12px;
          color: #78350f;
          list-style: disc;
        }
        .ai-summary-content .warnings-list li {
          margin-bottom: 3px;
          line-height: 1.5;
        }
        .ai-summary-content .warn-client {
          font-weight: 600;
          color: #78350f;
        }
        .ai-summary-content .warn-job {
          color: #92400e;
          font-size: 11.5px;
        }
        .ai-summary-content ul,
        .ai-summary-content ol {
          font-size: 12.5px;
          color: #334155;
          padding-left: 20px;
          margin: 8px 0;
        }
        .ai-summary-content li {
          margin-bottom: 5px;
          line-height: 1.5;
        }
        .ai-summary-content strong {
          font-weight: 600;
          color: #0f172a;
        }
        .ai-summary-content h3,
        .ai-summary-content h4 {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          margin: 14px 0 6px;
        }
      `}</style>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon,
  bgClass,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bgClass: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-all cursor-pointer hover:shadow-md",
        active && "ring-2 ring-blue-500/40",
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            bgClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11.5px] text-slate-500 truncate">{label}</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
