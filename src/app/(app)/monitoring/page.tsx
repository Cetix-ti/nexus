"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Search,
  RefreshCw,
  Settings as SettingsIcon,
  Filter,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------------------------
// Types — alignés avec /api/v1/monitoring/alerts
// ----------------------------------------------------------------------------

type Stage =
  | "TRIAGE"
  | "INVESTIGATING"
  | "WAITING_PARTS"
  | "WAITING_VENDOR"
  | "WAITING_MAINTENANCE"
  | "RESOLVED"
  | "IGNORED";

interface Alert {
  id: string;
  number: number;
  subject: string;
  organizationName: string;
  organizationId: string;
  requesterEmail: string | null;
  sourceId: string | null;
  sourceLabel: string | null;
  sourceColor: string | null;
  stage: Stage;
  priority: string;
  createdAt: string;
  updatedAt: string;
  assigneeName: string | null;
  notes: string | null;
}

interface Source {
  id: string;
  emailOrPattern: string;
  label: string;
  color: string;
  isActive: boolean;
}

const STAGE_LABELS: Record<Stage, string> = {
  TRIAGE: "À trier",
  INVESTIGATING: "En investigation",
  WAITING_PARTS: "Attente de pièce",
  WAITING_VENDOR: "Attente fournisseur",
  WAITING_MAINTENANCE: "Fenêtre maintenance",
  RESOLVED: "Traité",
  IGNORED: "Ignoré",
};

const STAGE_ORDER: Stage[] = [
  "TRIAGE",
  "INVESTIGATING",
  "WAITING_PARTS",
  "WAITING_VENDOR",
  "WAITING_MAINTENANCE",
  "RESOLVED",
  "IGNORED",
];

const STAGE_COLORS: Record<
  Stage,
  { bg: string; border: string; text: string; dot: string; soft: string }
> = {
  TRIAGE: {
    bg: "bg-rose-50/80",
    border: "border-rose-200",
    text: "text-rose-700",
    dot: "bg-rose-500",
    soft: "bg-rose-100/60",
  },
  INVESTIGATING: {
    bg: "bg-amber-50/80",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
    soft: "bg-amber-100/60",
  },
  WAITING_PARTS: {
    bg: "bg-violet-50/80",
    border: "border-violet-200",
    text: "text-violet-700",
    dot: "bg-violet-500",
    soft: "bg-violet-100/60",
  },
  WAITING_VENDOR: {
    bg: "bg-indigo-50/80",
    border: "border-indigo-200",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    soft: "bg-indigo-100/60",
  },
  WAITING_MAINTENANCE: {
    bg: "bg-cyan-50/80",
    border: "border-cyan-200",
    text: "text-cyan-700",
    dot: "bg-cyan-500",
    soft: "bg-cyan-100/60",
  },
  RESOLVED: {
    bg: "bg-emerald-50/80",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    soft: "bg-emerald-100/60",
  },
  IGNORED: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-600",
    dot: "bg-slate-400",
    soft: "bg-slate-100",
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 ring-red-200",
  HIGH: "bg-orange-100 text-orange-700 ring-orange-200",
  MEDIUM: "bg-blue-100 text-blue-700 ring-blue-200",
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-CA");
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function MonitoringPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<Record<Stage, number> | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [reloadKey, setReloadKey] = useState(0);

  // Charge alertes + counts
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ counts: "true" });
    if (sourceFilter !== "all") params.set("sourceId", sourceFilter);
    if (orgFilter !== "all") params.set("organizationId", orgFilter);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/v1/monitoring/alerts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setAlerts(data.alerts || []);
        if (data.counts) setCounts(data.counts);
      })
      .catch((e) => console.error("alerts load failed", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceFilter, orgFilter, search, reloadKey]);

  // Charge sources
  useEffect(() => {
    fetch("/api/v1/monitoring/sources")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSources(data);
      })
      .catch((e) => console.error("sources load failed", e));
  }, [reloadKey]);

  const orgOptions = useMemo(
    () =>
      Array.from(
        new Map(alerts.map((a) => [a.organizationId, a.organizationName]))
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [alerts]
  );

  const grouped = useMemo(() => {
    const out: Record<Stage, Alert[]> = {
      TRIAGE: [],
      INVESTIGATING: [],
      WAITING_PARTS: [],
      WAITING_VENDOR: [],
      WAITING_MAINTENANCE: [],
      RESOLVED: [],
      IGNORED: [],
    };
    for (const a of alerts) out[a.stage].push(a);
    return out;
  }, [alerts]);

  async function moveAlert(id: string, newStage: Stage) {
    const prev = alerts;
    setAlerts((p) =>
      p.map((a) => (a.id === id ? { ...a, stage: newStage } : a))
    );
    const res = await fetch("/api/v1/monitoring/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stage: newStage }),
    });
    if (!res.ok) {
      setAlerts(prev);
      alert("Échec de la mise à jour");
    } else {
      // refresh counts
      setReloadKey((k) => k + 1);
    }
  }

  // ------- UI -------

  const totalActive =
    (counts?.TRIAGE ?? 0) +
    (counts?.INVESTIGATING ?? 0) +
    (counts?.WAITING_PARTS ?? 0) +
    (counts?.WAITING_VENDOR ?? 0) +
    (counts?.WAITING_MAINTENANCE ?? 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200/60">
            <Bell className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Alertes monitoring
            </h1>
            <p className="text-[13px] text-slate-500">
              Suivi des alertes provenant des systèmes de surveillance
              {sources.length > 0 ? (
                <>
                  {" "}— {sources.filter((s) => s.isActive).length} source
                  {sources.filter((s) => s.isActive).length > 1 ? "s" : ""} active
                  {sources.filter((s) => s.isActive).length > 1 ? "s" : ""}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Rafraîchir"
          >
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </Button>
          <Link href="/settings?tab=monitoring">
            <Button variant="outline" size="sm">
              <SettingsIcon className="h-4 w-4" />
              Sources
            </Button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <KpiCard
          label="Actives"
          value={totalActive}
          accent="rose"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        {STAGE_ORDER.map((s) => (
          <KpiCard
            key={s}
            label={STAGE_LABELS[s]}
            value={counts?.[s] ?? 0}
            accent={s === "RESOLVED" ? "emerald" : s === "IGNORED" ? "slate" : "blue"}
            stage={s}
          />
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher dans le sujet ou la description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les organisations</SelectItem>
            {orgOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "rounded-md px-3 py-1 text-[12px] font-medium transition-all",
              view === "kanban"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                : "text-slate-500"
            )}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "rounded-md px-3 py-1 text-[12px] font-medium transition-all",
              view === "list"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                : "text-slate-500"
            )}
          >
            Liste
          </button>
        </div>
      </div>

      {/* Loader */}
      {loading ? (
        <PageLoader variant="cards" />
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Bell className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-[14px] font-medium text-slate-700">
            Aucune alerte de monitoring
          </p>
          <p className="mt-1 max-w-md text-[12.5px] text-slate-500">
            Aucun ticket existant ne correspond aux sources configurées.
            Ajoute une source d'alerte (ex. <code>zabbix@cetix.ca</code>,{" "}
            <code>noreply@atera.com</code>) dans{" "}
            <Link href="/settings?tab=monitoring" className="text-blue-600 hover:underline">
              Paramètres → Sources monitoring
            </Link>{" "}
            pour commencer.
          </p>
        </div>
      ) : view === "kanban" ? (
        <KanbanView grouped={grouped} onMove={moveAlert} />
      ) : (
        <ListView alerts={alerts} onMove={moveAlert} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  accent,
  icon,
  stage,
}: {
  label: string;
  value: number;
  accent: "rose" | "emerald" | "slate" | "blue";
  icon?: React.ReactNode;
  stage?: Stage;
}) {
  const accentClasses = {
    rose: "from-rose-500 to-rose-600",
    emerald: "from-emerald-500 to-emerald-600",
    slate: "from-slate-400 to-slate-500",
    blue: "from-blue-500 to-indigo-600",
  }[accent];
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        {stage ? (
          <span className={cn("h-2 w-2 rounded-full", STAGE_COLORS[stage].dot)} />
        ) : (
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br text-white",
              accentClasses
            )}
          >
            {icon}
          </span>
        )}
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function KanbanView({
  grouped,
  onMove,
}: {
  grouped: Record<Stage, Alert[]>;
  onMove: (id: string, stage: Stage) => void;
}) {
  // Ne montre que les colonnes "actives" en Kanban (pas IGNORED par défaut)
  const visibleStages = STAGE_ORDER.filter((s) => s !== "IGNORED");
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {visibleStages.map((stage) => {
        const colors = STAGE_COLORS[stage];
        const items = grouped[stage];
        return (
          <div
            key={stage}
            className={cn(
              "rounded-xl border bg-white",
              colors.border
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between rounded-t-xl border-b px-3 py-2.5",
                colors.bg,
                colors.border
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                <h3 className={cn("text-[12.5px] font-semibold", colors.text)}>
                  {STAGE_LABELS[stage]}
                </h3>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset",
                  colors.soft,
                  colors.text,
                  colors.border
                )}
              >
                {items.length}
              </span>
            </div>
            <div className="flex max-h-[600px] flex-col gap-2 overflow-y-auto p-2">
              {items.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11.5px] text-slate-400">
                  Aucun
                </p>
              ) : (
                items.map((a) => (
                  <AlertCard key={a.id} alert={a} onMove={onMove} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlertCard({
  alert,
  onMove,
}: {
  alert: Alert;
  onMove: (id: string, stage: Stage) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/tickets/${alert.id}`}
          className="flex-1 group"
        >
          <p className="font-mono text-[10.5px] text-slate-400">
            #{alert.number}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12.5px] font-medium text-slate-900 group-hover:text-blue-700">
            {alert.subject}
          </p>
        </Link>
        {alert.priority && PRIORITY_COLORS[alert.priority] ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase ring-1 ring-inset",
              PRIORITY_COLORS[alert.priority]
            )}
          >
            {alert.priority}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
        {alert.sourceColor ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: alert.sourceColor }}
          />
        ) : null}
        <span className="truncate">{alert.sourceLabel ?? "—"}</span>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="truncate">{alert.organizationName}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{relativeTime(alert.createdAt)}</span>
        {alert.assigneeName ? (
          <span className="truncate">{alert.assigneeName}</span>
        ) : (
          <span className="italic text-slate-300">non assigné</span>
        )}
      </div>
      <div className="mt-2 border-t border-slate-100 pt-1.5">
        <select
          value={alert.stage}
          onChange={(e) => onMove(alert.id, e.target.value as Stage)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
        >
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              → {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ListView({
  alerts,
  onMove,
}: {
  alerts: Alert[];
  onMove: (id: string, stage: Stage) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50/70">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2.5">#</th>
            <th className="px-3 py-2.5">Sujet</th>
            <th className="px-3 py-2.5">Source</th>
            <th className="px-3 py-2.5">Organisation</th>
            <th className="px-3 py-2.5">Étape</th>
            <th className="px-3 py-2.5">Priorité</th>
            <th className="px-3 py-2.5">Assigné à</th>
            <th className="px-3 py-2.5">Reçu</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {alerts.map((a) => {
            const colors = STAGE_COLORS[a.stage];
            return (
              <tr key={a.id} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">
                  #{a.number}
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/tickets/${a.id}`}
                    className="line-clamp-1 font-medium text-slate-900 hover:text-blue-700"
                  >
                    {a.subject}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {a.sourceColor ? (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: a.sourceColor }}
                      />
                    ) : null}
                    <span className="text-slate-600">{a.sourceLabel ?? "—"}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {a.organizationName}
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={a.stage}
                    onChange={(e) => onMove(a.id, e.target.value as Stage)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] font-medium ring-1 ring-inset focus:outline-none",
                      colors.bg,
                      colors.text,
                      colors.border
                    )}
                  >
                    {STAGE_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  {PRIORITY_COLORS[a.priority] ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset",
                        PRIORITY_COLORS[a.priority]
                      )}
                    >
                      {a.priority}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {a.assigneeName ?? (
                    <span className="italic text-slate-300">non assigné</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-500">
                  {relativeTime(a.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
