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
}

interface DashboardData {
  alerts: VeeamAlert[];
  stats: StatusCount[];
  orgStats: OrgStatusCount[];
  since: string;
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
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
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

  // ---- Derived data ----
  const statCounts = useMemo(() => {
    if (!data) return { SUCCESS: 0, WARNING: 0, FAILED: 0, total: 0 };
    const m = { SUCCESS: 0, WARNING: 0, FAILED: 0 };
    for (const s of data.stats) {
      if (s.status in m) m[s.status as keyof typeof m] = s._count;
    }
    return { ...m, total: m.SUCCESS + m.WARNING + m.FAILED };
  }, [data]);

  // Build per-org summary
  const orgSummary = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { orgId: string | null; orgName: string; SUCCESS: number; WARNING: number; FAILED: number; lastAlert: string }
    >();
    for (const row of data.orgStats) {
      const key = row.organizationId ?? "_unmatched";
      if (!map.has(key)) {
        map.set(key, {
          orgId: row.organizationId,
          orgName: row.organizationName ?? "Non associé",
          SUCCESS: 0,
          WARNING: 0,
          FAILED: 0,
          lastAlert: "",
        });
      }
      map.get(key)![row.status as "SUCCESS" | "WARNING" | "FAILED"] += row._count;
    }
    // Find last alert date per org
    for (const alert of data.alerts) {
      const key = alert.organizationId ?? "_unmatched";
      const entry = map.get(key);
      if (entry && (!entry.lastAlert || alert.receivedAt > entry.lastAlert)) {
        entry.lastAlert = alert.receivedAt;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // Failed first, then warning, then by name
      if (a.FAILED !== b.FAILED) return b.FAILED - a.FAILED;
      if (a.WARNING !== b.WARNING) return b.WARNING - a.WARNING;
      return a.orgName.localeCompare(b.orgName, "fr");
    });
  }, [data]);

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    return data.alerts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [a.jobName, a.organizationName, a.senderEmail, a.subject]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, statusFilter, search]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
            Sauvegardes
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            État des tâches Veeam de vos clients — derniers {days} jours
          </p>
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

      {/* Sync error banner */}
      {syncError && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-[12px] text-red-900 flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total alertes"
          value={statCounts.total}
          icon={<HardDrive className="h-4 w-4 text-slate-600" />}
          bgClass="bg-slate-50"
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
            />
          );
        })}
      </div>

      {/* Per-org summary */}
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
                href="/settings"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
              >
                <Settings className="h-3.5 w-3.5" />
                Configurer la connexion IMAP dans Paramètres
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
                    "transition-colors",
                    worst === "FAILED" && "ring-1 ring-red-200/80",
                    worst === "WARNING" && "ring-1 ring-amber-200/80",
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[13px] font-semibold text-slate-900 truncate">
                        {org.orgName}
                      </h3>
                      <Badge variant={cfg.badge} className="text-[10px]">
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

      {/* Alert list */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            Historique des alertes
          </h2>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              iconLeft={<Search className="h-3.5 w-3.5" />}
              className="w-56"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="SUCCESS">Succès</SelectItem>
                <SelectItem value="WARNING">Avertissement</SelectItem>
                <SelectItem value="FAILED">Échec</SelectItem>
              </SelectContent>
            </Select>
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
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Tâche
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Client
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Expéditeur
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-500">
                    Reçu
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAlerts.map((a) => {
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
                          <Badge variant={cfg.badge} className="text-[10.5px]">
                            {cfg.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-slate-900 truncate max-w-[250px]">
                          {a.jobName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[250px]">
                          {a.subject}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[12.5px]">
                        {a.organizationName ? (
                          <span className="text-slate-700 font-medium">
                            {a.organizationName}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            Non associé
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-mono text-slate-500">
                        {a.senderEmail}
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
                      colSpan={5}
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
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  bgClass,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bgClass: string;
}) {
  return (
    <Card>
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
