"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  RefreshCw,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Ticket,
  LayoutGrid,
  List,
  ChevronRight,
  Clock,
  Shield,
  Zap,
  Server,
  Monitor,
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

interface MonAlert {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  sourceType: string;
  severity: string;
  stage: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderDomain: string;
  receivedAt: string;
  isResolved: boolean;
  resolvedAt: string | null;
  ticketId: string | null;
  notes: string | null;
  alertGroupKey: string | null;
}

const STAGES = ["TRIAGE", "INVESTIGATING", "WAITING_PARTS", "WAITING_VENDOR", "WAITING_MAINTENANCE", "RESOLVED", "IGNORED"] as const;

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  TRIAGE: { label: "Triage", color: "text-red-600", bg: "bg-red-50" },
  INVESTIGATING: { label: "Investigation", color: "text-amber-600", bg: "bg-amber-50" },
  WAITING_PARTS: { label: "Attente pièces", color: "text-orange-600", bg: "bg-orange-50" },
  WAITING_VENDOR: { label: "Attente fournisseur", color: "text-violet-600", bg: "bg-violet-50" },
  WAITING_MAINTENANCE: { label: "Planifié", color: "text-blue-600", bg: "bg-blue-50" },
  RESOLVED: { label: "Résolu", color: "text-emerald-600", bg: "bg-emerald-50" },
  IGNORED: { label: "Ignoré", color: "text-slate-400", bg: "bg-slate-50" },
};

const SEVERITY_CONFIG: Record<string, { label: string; variant: "danger" | "warning" | "primary" | "default" }> = {
  CRITICAL: { label: "Critique", variant: "danger" },
  HIGH: { label: "Élevée", variant: "warning" },
  WARNING: { label: "Avertissement", variant: "primary" },
  INFO: { label: "Info", variant: "default" },
};

const SOURCE_ICONS: Record<string, any> = {
  zabbix: Zap,
  atera: Monitor,
  fortigate: Shield,
  wazuh: Shield,
  bitdefender: Shield,
  other: Bell,
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ViewMode = "table" | "kanban";

export default function MonitoringPage() {
  const [alerts, setAlerts] = useState<MonAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/monitoring/alerts?days=${days}`)
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/v1/monitoring/sync", { method: "POST" }).catch(() => {});
    setSyncing(false);
    load();
  }

  async function updateStage(alertId: string, stage: string) {
    await fetch(`/api/v1/monitoring/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, isResolved: stage === "RESOLVED" || stage === "IGNORED" }),
    });
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? { ...a, stage, isResolved: stage === "RESOLVED" || stage === "IGNORED" }
          : a,
      ),
    );
  }

  async function createTicket(alertId: string) {
    const res = await fetch(`/api/v1/monitoring/alerts/${alertId}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, ticketId: data.ticketId, stage: "INVESTIGATING" } : a)),
      );
    }
  }

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (stageFilter !== "all" && a.stage !== stageFilter) return false;
      if (sourceFilter !== "all" && a.sourceType !== sourceFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (![a.subject, a.organizationName, a.senderEmail, a.sourceType].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [alerts, stageFilter, sourceFilter, search]);

  const sourceTypes = useMemo(() => [...new Set(alerts.map((a) => a.sourceType))].sort(), [alerts]);

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of filtered) m[a.stage] = (m[a.stage] || 0) + 1;
    return m;
  }, [filtered]);

  if (loading && alerts.length === 0) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Alertes monitoring</h1>
          <p className="mt-1 text-[12px] sm:text-[13px] text-slate-500">Triage et suivi — {days} derniers jours</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("kanban")} className={cn("px-2.5 py-1.5", viewMode === "kanban" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("table")} className={cn("px-2.5 py-1.5", viewMode === "table" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50")}>
              <List className="h-4 w-4" />
            </button>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">24h</SelectItem>
              <SelectItem value="3">3 jours</SelectItem>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="14">14 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Synchroniser
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(0); }} iconLeft={<Search className="h-3.5 w-3.5" />} className="w-full sm:w-56" />
        <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setCurrentPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Étape" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les étapes</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_CONFIG[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setCurrentPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sources</SelectItem>
            {sourceTypes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[12px] text-slate-400 ml-auto">{filtered.length} alerte{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {STAGES.filter((s) => s !== "RESOLVED" && s !== "IGNORED").map((s) => {
          const cfg = STAGE_CONFIG[s];
          const count = stageCounts[s] || 0;
          return (
            <button key={s} onClick={() => setStageFilter(stageFilter === s ? "all" : s)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium ring-1 ring-inset transition-colors",
                stageFilter === s ? `${cfg.bg} ${cfg.color} ring-current/20` : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              )}>
              <span className={cn("h-2 w-2 rounded-full", cfg.bg, cfg.color.replace("text-", "bg-"))} />
              {cfg.label} <span className="tabular-nums font-bold">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Kanban view */}
      {viewMode === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.filter((s) => s !== "RESOLVED" && s !== "IGNORED").map((stage) => {
            const cfg = STAGE_CONFIG[stage];
            const stageAlerts = filtered.filter((a) => a.stage === stage);
            return (
              <div key={stage} className="flex-shrink-0 w-72">
                <div className={cn("flex items-center gap-2 mb-3 px-2")}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", cfg.color.replace("text-", "bg-"))} />
                  <span className="text-[13px] font-semibold text-slate-900">{cfg.label}</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">{stageAlerts.length}</span>
                </div>
                <div className="space-y-2">
                  {stageAlerts.slice(0, 20).map((a) => {
                    const sev = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.WARNING;
                    const SrcIcon = SOURCE_ICONS[a.sourceType] ?? Bell;
                    return (
                      <Card key={a.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <SrcIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", cfg.color)} />
                            <p className="text-[12px] font-medium text-slate-900 line-clamp-2">{a.subject}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={sev.variant} className="text-[9px]">{sev.label}</Badge>
                            <span className="text-[10px] text-slate-400">{a.sourceType}</span>
                            {a.organizationName && <span className="text-[10px] text-slate-500 font-medium">{a.organizationName}</span>}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">{timeAgo(a.receivedAt)}</span>
                            <div className="flex items-center gap-1">
                              {!a.ticketId && (
                                <button onClick={() => createTicket(a.id)} className="h-6 px-1.5 rounded text-[10px] text-blue-600 hover:bg-blue-50 font-medium" title="Créer un ticket">
                                  <Ticket className="h-3 w-3" />
                                </button>
                              )}
                              {a.ticketId && <Badge variant="primary" className="text-[9px]">Ticket lié</Badge>}
                              <Select value={a.stage} onValueChange={(v) => updateStage(a.id, v)}>
                                <SelectTrigger className="h-6 w-6 p-0 border-0 shadow-none [&>svg]:hidden">
                                  <ChevronRight className="h-3 w-3 text-slate-400" />
                                </SelectTrigger>
                                <SelectContent>
                                  {STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_CONFIG[s].label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {stageAlerts.length === 0 && (
                    <div className="py-8 text-center text-[12px] text-slate-300">Aucune alerte</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">Source</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Sévérité</th>
                  <th className="px-4 py-3 font-medium text-slate-500 min-w-[300px]">Sujet</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Étape</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Reçu</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((a) => {
                  const sev = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.WARNING;
                  const stageCfg = STAGE_CONFIG[a.stage] ?? STAGE_CONFIG.TRIAGE;
                  const SrcIcon = SOURCE_ICONS[a.sourceType] ?? Bell;
                  return (
                    <tr key={a.id} className={cn("hover:bg-slate-50/80 transition-colors", a.isResolved && "opacity-50")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <SrcIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[12px] text-slate-600">{a.sourceType}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={sev.variant} className="text-[10px]">{sev.label}</Badge></td>
                      <td className="px-4 py-3">
                        <p className="text-[12.5px] font-medium text-slate-900 truncate max-w-[400px]">{a.subject}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{a.senderEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-600">{a.organizationName ?? <span className="text-slate-400 italic">—</span>}</td>
                      <td className="px-4 py-3">
                        <Select value={a.stage} onValueChange={(v) => updateStage(a.id, v)}>
                          <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_CONFIG[s].label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">{fmtDate(a.receivedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {!a.ticketId ? (
                          <Button variant="outline" size="sm" onClick={() => createTicket(a.id)} className="text-[11px]">
                            <Ticket className="h-3 w-3" /> Créer ticket
                          </Button>
                        ) : (
                          <Badge variant="primary" className="text-[10px]">Ticket lié</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-[13px] text-slate-400">
                      <Bell className="h-10 w-10 mx-auto mb-2" strokeWidth={1.5} />
                      Aucune alerte. Configurez les dossiers à surveiller dans Paramètres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <span className="text-[12px] text-slate-500">
                {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filtered.length)} sur {filtered.length}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="h-7 px-2 rounded border border-slate-200 text-[12px] disabled:opacity-40">Précédent</button>
                <button onClick={() => setCurrentPage((p) => p + 1)} disabled={(currentPage + 1) * pageSize >= filtered.length} className="h-7 px-2 rounded border border-slate-200 text-[12px] disabled:opacity-40">Suivant</button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
