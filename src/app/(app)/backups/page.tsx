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
import { BackupKanban } from "@/components/backups/backup-kanban";
import { UnmatchedDomainsSection } from "@/components/backups/unmatched-domains";
import { OrgLogo } from "@/components/organizations/org-logo";
import { LayoutGrid } from "lucide-react";

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

// --- Types du résumé des échecs 24h ---------------------------------------
// Correspond à la réponse de GET /api/v1/veeam/summary (structured JSON,
// plus de HTML côté serveur — on rend en React avec OrgLogo + rowSpan).
interface FailedJobRow {
  job: string;
  server: string;
  subject: string;
}
interface FailedOrg {
  orgId: string | null;
  orgName: string;
  logo: string | null;
  jobs: FailedJobRow[];
}
interface FailuresSummary {
  orgs: FailedOrg[];
  generatedAt: string;
  alertCount: number;
  failed: number;
  warning: number;
  success: number;
}

// Current view: overview, drilled into org/status, or the failures Kanban.
// L'onglet Kanban est une vue à part entière sur la même page — on garde
// la même navigation `view` pour ne pas fragmenter le state.
interface ViewState {
  type: "overview" | "org" | "status" | "kanban";
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

// Intervalle d'auto-refresh pour toutes les sections de la page (alertes,
// résumé 24h, orphelins, templates). Raisonnable pour une page de
// monitoring : visible en < 1 minute après réception d'une nouvelle alerte,
// sans marteler l'API avec trop de requêtes.
const AUTO_REFRESH_INTERVAL_MS = 30_000;

export default function BackupsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [summary, setSummary] = useState<FailuresSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [expiry, setExpiry] = useState<ExpiryInfo | null>(null);
  const [autoSync, setAutoSync] = useState<{
    enabled: boolean;
    lastRun: string | null;
    intervalMs: number | null;
    healthy: boolean;
  } | null>(null);
  const [view, setView] = useState<ViewState>({ type: "overview" });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);
  // Bump pour invalider les sous-composants (BackupKanban, UnmatchedDomains)
  // qui gèrent leurs propres fetchs — incrémenté à chaque refresh global
  // ou auto-tick.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetch("/api/v1/settings/veeam")
      .then((r) => r.json())
      .then((d) => {
        if (d?.expiry) setExpiry(d.expiry);
      })
      .catch(() => {});
  }, []);

  // Sync auto en arrière-plan : on poll le statut toutes les 60s pour
  // afficher "Dernière synchro auto : il y a Xs" dans le header. Donne
  // de la confiance à l'utilisateur que la sync tourne sans qu'il ait à
  // cliquer Synchroniser.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch("/api/v1/veeam/job-status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setAutoSync(d);
        })
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // `load` charge les données de la page en parallèle sans bloquer — utilisé
  // au mount, par le bouton "Synchroniser" (après sync) et par l'auto-refresh.
  // `opts.silent = true` ne touche pas au spinner (utilisé par l'auto-refresh
  // pour ne pas faire clignoter l'UI toutes les 30 secondes).
  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      const alertsP = fetch(`/api/v1/veeam/alerts?days=${days}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: DashboardData | null) => {
          if (d) setData(d);
        })
        .catch(() => {});
      const summaryP = fetch("/api/v1/veeam/summary")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: FailuresSummary | null) => {
          if (d) setSummary(d);
        })
        .catch(() => {});
      Promise.all([alertsP, summaryP]).finally(() => {
        if (!opts?.silent) setLoading(false);
        // Incrémente le tick pour que les sous-composants re-fetchent.
        setRefreshTick((t) => t + 1);
      });
    },
    [days],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh : toutes les 30s, on re-pull silencieusement les données.
  // Pause quand l'onglet est caché (document.hidden) pour économiser les
  // ressources — redémarre au focus. Évite de marteler l'API quand
  // personne ne regarde.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      load({ silent: true });
    };
    const id = window.setInterval(tick, AUTO_REFRESH_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      // 1. Pull Veeam (Graph → DB) puis 2. refresh summary (refresh=1 bypass
      // cache de 15 min), 3. reload la page complète. Enchaînement serial :
      // on veut que le summary reflète les nouvelles alertes ingérées.
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
      // Force le recalcul du summary (bypass cache 15 min) puis reload.
      await fetch("/api/v1/veeam/summary?refresh=1").catch(() => {});
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
              {view.type === "kanban" && (
                <>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                  <span className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
                    Kanban
                  </span>
                </>
              )}
              {(view.type === "org" || view.type === "status") && (
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
                : view.type === "kanban"
                  ? "Templates de ticket pour les tâches en échec"
                  : view.type === "org"
                    ? `${filteredAlerts.length} alertes pour ce client`
                    : `${filteredAlerts.length} alertes avec ce statut`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {view.type !== "kanban" && (
            <>
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
                variant="outline"
                size="sm"
                onClick={() => setView({ type: "kanban" })}
                title="Suivi des échecs de sauvegarde"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </Button>
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
            </>
          )}
        </div>
      </div>

      {/* Indicateur de sync auto en arrière-plan. Le job tourne toutes les
          5 min via le scheduler in-process — ça donne à l'utilisateur la
          confirmation visuelle que c'est actif. Caché si scheduler off. */}
      {autoSync && autoSync.enabled && view.type !== "kanban" && (
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-[11.5px] flex items-center gap-2",
            autoSync.healthy
              ? "bg-emerald-50/60 text-emerald-800 ring-1 ring-inset ring-emerald-200/60"
              : "bg-amber-50/60 text-amber-900 ring-1 ring-inset ring-amber-200/60",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              autoSync.healthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500",
            )}
          />
          <span className="font-medium">
            {autoSync.healthy ? "Sync auto active" : "Sync auto en attente"}
          </span>
          {autoSync.lastRun && (
            <span className="text-slate-500">
              · dernière vérification {timeAgo(autoSync.lastRun)}
            </span>
          )}
          {autoSync.intervalMs && (
            <span className="text-slate-400 ml-auto">
              toutes les {Math.round(autoSync.intervalMs / 60_000)} min
            </span>
          )}
        </div>
      )}

      {/* Kanban view — short-circuit le reste de la page */}
      {view.type === "kanban" && <BackupKanban />}

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

      {/* Dashboard classique — masqué quand on est sur la vue Kanban. */}
      {view.type !== "kanban" && (<>
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
      {/* Résumé des échecs 24h (tableau déterministe par client)          */}
      {/* ================================================================ */}
      {view.type === "overview" && <FailuresSection summary={summary} />}

      {/* ================================================================ */}
      {/* Mappage manuel des alertes orphelines                            */}
      {/* Ne s'affiche que si au moins un domaine n'a pas pu être matché   */}
      {/* automatiquement. Silencieux sinon.                                */}
      {/* ================================================================ */}
      {view.type === "overview" && (
        <UnmatchedDomainsSection onChange={load} refreshTick={refreshTick} />
      )}

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
                        <td className="px-4 py-3 text-[12.5px] text-left">
                          {a.organizationName ? (
                            <button
                              type="button"
                              onClick={() =>
                                drillOrg(
                                  a.organizationId,
                                  a.organizationName!,
                                )
                              }
                              className="text-left text-slate-700 font-medium hover:text-blue-600 transition-colors"
                            >
                              {a.organizationName}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                drillOrg(null, "Non associé")
                              }
                              className="text-left text-slate-400 italic hover:text-slate-600 transition-colors"
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
      </>)}
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

// ---------------------------------------------------------------------------
// FailuresSection — section « Échecs des dernières 24 heures »
//
// Données fournies par le parent (auto-refresh + bouton unique en haut) →
// plus de bouton « Actualiser » local, plus d'énoncé « X tâches en échec »
// dupliqué. Tableau rendu en React (plus de HTML serveur), avec :
//   - logo de l'organisation au-dessus du nom gras dans la 1re colonne
//   - rowSpan sur la colonne Client (groupe les lignes d'une même org)
//   - rowSpan sur la colonne Serveur (groupe les tâches d'un même serveur
//     au sein d'une org)
//   - pas d'encadré externe autour du tableau pour alléger la présentation
// ---------------------------------------------------------------------------
function FailuresSection({ summary }: { summary: FailuresSummary | null }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!summary) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/60">
              <XCircle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Échecs des dernières 24 heures
              </h3>
              <p className="text-[11px] text-slate-400">Chargement…</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 ring-1 ring-inset ring-red-200/60">
              <XCircle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Échecs des dernières 24 heures
              </h3>
              <p className="text-[11px] text-slate-400">
                Mis à jour {fmtDate(summary.generatedAt)}
              </p>
            </div>
          </div>
          {summary.orgs.length > 0 && (
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
        </div>

        {summary.orgs.length === 0 && summary.alertCount === 0 && (
          <p className="mt-4 text-[12.5px] text-slate-500">
            Aucune alerte de sauvegarde reçue dans les dernières 24 heures.
          </p>
        )}
        {summary.orgs.length === 0 && summary.alertCount > 0 && (
          <p className="mt-4 text-[12.5px] text-slate-500">
            Aucun échec de sauvegarde dans les dernières 24 heures
            ({summary.alertCount} alerte{summary.alertCount > 1 ? "s" : ""} reçues).
          </p>
        )}

        {summary.orgs.length > 0 && !collapsed && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-semibold">Client</th>
                  <th className="py-2.5 px-3 font-semibold">Serveur</th>
                  <th className="py-2.5 px-3 font-semibold">Tâche</th>
                  <th className="py-2.5 px-3 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {summary.orgs.flatMap((org) => {
                  // Groupement par serveur au sein de l'org — permet le
                  // rowSpan sur la 2e colonne. Ordre d'apparition préservé
                  // (trié côté serveur).
                  const serverGroups = new Map<string, FailedJobRow[]>();
                  for (const j of org.jobs) {
                    if (!serverGroups.has(j.server)) {
                      serverGroups.set(j.server, []);
                    }
                    serverGroups.get(j.server)!.push(j);
                  }
                  const rows: React.ReactElement[] = [];
                  let orgRowsEmitted = 0;
                  for (const [server, jobs] of serverGroups) {
                    jobs.forEach((j, idx) => {
                      const isFirstOfOrg = orgRowsEmitted === 0;
                      const isFirstOfServer = idx === 0;
                      rows.push(
                        <tr
                          key={`${org.orgId ?? org.orgName}-${server}-${j.job}`}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
                        >
                          {isFirstOfOrg && (
                            <td
                              rowSpan={org.jobs.length}
                              className="align-top py-3 px-3 bg-slate-50/60 border-r border-slate-200"
                            >
                              <div className="flex flex-col items-start gap-1.5">
                                <OrgLogo
                                  name={org.orgName}
                                  logo={org.logo}
                                  size={28}
                                  rounded="md"
                                />
                                <span className="font-semibold text-slate-900 text-[12.5px]">
                                  {org.orgName}
                                </span>
                              </div>
                            </td>
                          )}
                          {isFirstOfServer && (
                            <td
                              rowSpan={jobs.length}
                              className="align-top py-3 px-3 font-mono text-[11.5px] text-indigo-600 font-medium bg-slate-50/40 border-r border-slate-200"
                            >
                              {server}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-slate-700">{j.job}</td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-700 ring-1 ring-inset ring-red-200/60">
                              Échec
                            </span>
                          </td>
                        </tr>,
                      );
                      orgRowsEmitted++;
                    });
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
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
