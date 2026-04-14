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
  X,
  Save,
  ExternalLink,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useOrgLogosStore } from "@/stores/org-logos-store";
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
  // Extended fields from ticket-sourced alerts
  isTicket?: boolean;
  ticketNumber?: number;
  ticketStatus?: string;
  assigneeName?: string | null;
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

/**
 * Extract the hostname/endpoint name from an alert.
 * Priority: alertGroupKey (server-parsed) → subject patterns.
 */
function extractHostname(alert: MonAlert): string | null {
  // Try alertGroupKey first (format "source:host:desc" from email-sync)
  if (alert.alertGroupKey) {
    const parts = alert.alertGroupKey.split(":");
    if (parts.length >= 3 && parts[1] && parts[1] !== "unknown") {
      return parts[1].toUpperCase();
    }
  }
  const subject = alert.subject || "";
  // Zabbix: "Problem: X on HOSTNAME"
  const onMatch = subject.match(/\bon\s+([A-Za-z0-9][A-Za-z0-9_\-\.]{2,})/i);
  if (onMatch) return onMatch[1].toUpperCase();
  // Atera: "HOSTNAME is offline" / "[Atera] HOSTNAME ..."
  const ateraMatch = subject.match(/^\s*(?:\[[^\]]+\]\s*)?([A-Z][A-Z0-9][A-Z0-9_\-]+)/);
  if (ateraMatch) return ateraMatch[1];
  // Generic: any prefix-hostname token
  const prefixMatch = subject.match(/\b([A-Z]{2,6}[-_][A-Z0-9_\-]{2,})\b/);
  if (prefixMatch) return prefixMatch[1];
  return null;
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
  const [openedAlert, setOpenedAlert] = useState<MonAlert | null>(null);

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
          <div className="hidden sm:flex items-center border border-slate-200 rounded-lg overflow-hidden">
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

      {/* Kanban view — with drag & drop */}
      {/* Kanban — desktop only */}
      {viewMode === "kanban" && (
        <div className="hidden sm:block">
        <MonitoringKanban
          alerts={filtered}
          onStageChange={updateStage}
          onCreateTicket={createTicket}
          onOpenDetail={(a) => setOpenedAlert(a)}
        />
        </div>
      )}

      {/* Table view — always shown on mobile, toggle on desktop */}
      {(viewMode === "table" || true) && (
        <div className={viewMode === "kanban" ? "sm:hidden" : ""}>
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
        </div>
      )}

      {/* Alert detail modal */}
      {openedAlert && (
        <AlertDetailModal
          alert={openedAlert}
          onClose={() => setOpenedAlert(null)}
          onCreateTicket={createTicket}
          onUpdated={(updated) => {
            setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setOpenedAlert(updated);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monitoring Kanban with Drag & Drop
// ---------------------------------------------------------------------------

function DraggableAlertCard({
  alert,
  children,
}: {
  alert: MonAlert;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: alert.id,
    data: { alert },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      {children}
    </div>
  );
}

function DroppableColumn({
  stageId,
  children,
}: {
  stageId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 overflow-y-auto px-2.5 py-2.5 transition-colors min-h-[200px]",
        isOver && "bg-blue-50/40",
      )}
    >
      {children}
    </div>
  );
}

function MonitoringKanban({
  alerts,
  onStageChange,
  onCreateTicket,
  onOpenDetail,
}: {
  alerts: MonAlert[];
  onStageChange: (id: string, stage: string) => void;
  onCreateTicket: (id: string) => void;
  onOpenDetail: (a: MonAlert) => void;
}) {
  const [localAlerts, setLocalAlerts] = useState(alerts);
  const [dragging, setDragging] = useState<MonAlert | null>(null);
  const orgLogos = useOrgLogosStore((s) => s.logos);
  const loadOrgLogos = useOrgLogosStore((s) => s.load);

  useEffect(() => { loadOrgLogos(); }, [loadOrgLogos]);
  useEffect(() => { setLocalAlerts(alerts); }, [alerts]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    const a = localAlerts.find((x) => x.id === e.active.id);
    if (a) setDragging(a);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;
    const alertId = active.id as string;
    const newStage = over.id as string;
    const old = localAlerts.find((a) => a.id === alertId);
    if (!old || old.stage === newStage) return;

    // Optimistic update
    setLocalAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, stage: newStage } : a)),
    );
    onStageChange(alertId, newStage);
  }

  const visibleStages = STAGES.filter((s) => s !== "RESOLVED" && s !== "IGNORED");

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 380px)" }}>
        {visibleStages.map((stage) => {
          const cfg = STAGE_CONFIG[stage];
          const stageAlerts = localAlerts.filter((a) => a.stage === stage);
          return (
            <div
              key={stage}
              className="flex-shrink-0 w-[270px] sm:w-[300px] flex flex-col rounded-xl border border-slate-200/80 bg-slate-50/40"
            >
              {/* Column header */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/80 rounded-t-xl">
                <span className={cn("h-2.5 w-2.5 rounded-full", cfg.color.replace("text-", "bg-"))} />
                <span className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-700 flex-1">
                  {cfg.label}
                </span>
                <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-slate-700 tabular-nums shadow-sm ring-1 ring-inset ring-slate-200/60">
                  {stageAlerts.length}
                </span>
              </div>

              <DroppableColumn stageId={stage}>
                <div className="space-y-2.5">
                  {stageAlerts.slice(0, 30).map((a) => {
                    const sev = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.WARNING;
                    const SrcIcon = SOURCE_ICONS[a.sourceType] ?? Bell;
                    const logo = a.organizationName ? orgLogos[a.organizationName] : null;
                    const hostname = extractHostname(a);

                    return (
                      <DraggableAlertCard key={a.id} alert={a}>
                        <div
                          onClick={() => onOpenDetail(a)}
                          className="rounded-[14px] bg-white border border-slate-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.1)] hover:-translate-y-[2px] transition-all duration-200 ease-out cursor-pointer">
                          {/* Severity accent */}
                          <div
                            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                            style={{ backgroundColor: sev.variant === "danger" ? "#EF4444" : sev.variant === "warning" ? "#F59E0B" : "#3B82F6" }}
                          />
                          <div className="relative pl-4 pr-3.5 py-3">
                            {/* Row 1: source + severity */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5">
                                <SrcIcon className={cn("h-3 w-3", cfg.color)} strokeWidth={2.5} />
                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                  {a.sourceType}
                                </span>
                              </div>
                              <Badge variant={sev.variant} className="text-[9px]">{sev.label}</Badge>
                            </div>

                            {/* Row 2: hostname + org logo/name (merged for compactness) */}
                            <div className="flex items-center gap-2 mb-2">
                              {logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt="" className="h-[22px] w-[22px] rounded object-contain bg-white ring-1 ring-slate-200/80 shrink-0" />
                              ) : a.organizationName ? (
                                <div className="h-[22px] w-[22px] rounded bg-slate-100 ring-1 ring-slate-200/80 flex items-center justify-center shrink-0">
                                  <span className="text-[8px] font-bold text-slate-500">
                                    {a.organizationName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              ) : (
                                <div className="h-[22px] w-[22px] rounded bg-slate-100 ring-1 ring-slate-200/80 flex items-center justify-center shrink-0">
                                  <Server className="h-3 w-3 text-slate-400" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                {hostname ? (
                                  <p className="text-[13px] font-semibold text-slate-900 font-mono tracking-tight truncate leading-tight">
                                    {hostname}
                                  </p>
                                ) : (
                                  <p className="text-[12.5px] font-semibold text-slate-900 truncate leading-tight">
                                    {a.organizationName ?? "Endpoint inconnu"}
                                  </p>
                                )}
                                {hostname && a.organizationName && (
                                  <p className="text-[10.5px] text-slate-500 truncate mt-0.5">
                                    {a.organizationName}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Row 3: subject */}
                            <p className="text-[11.5px] text-slate-600 line-clamp-2 mb-2">
                              {a.subject}
                            </p>

                            {/* Row 4: footer */}
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400">{timeAgo(a.receivedAt)}</span>
                              <div className="flex items-center gap-1">
                                {a.ticketId ? (
                                  <Badge variant="primary" className="text-[8px]">Ticket</Badge>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onCreateTicket(a.id); }}
                                    className="h-5 px-1.5 rounded text-[9px] text-blue-600 hover:bg-blue-50 font-medium"
                                  >
                                    + Ticket
                                  </button>
                                )}
                                {a.assigneeName && (
                                  <span className="text-[10px] text-slate-500">{a.assigneeName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </DraggableAlertCard>
                    );
                  })}
                  {stageAlerts.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/40 py-10 px-3 text-center">
                      <p className="text-[11.5px] font-medium text-slate-400">Aucune alerte</p>
                      <p className="mt-0.5 text-[10.5px] text-slate-300">Glissez une alerte ici</p>
                    </div>
                  )}
                </div>
              </DroppableColumn>
            </div>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="rotate-2 cursor-grabbing scale-105 shadow-2xl rounded-xl bg-white border border-slate-200 p-3 w-[270px]">
            <p className="text-[12px] font-semibold text-slate-900 line-clamp-2">{dragging.subject}</p>
            <p className="text-[10px] text-slate-400 mt-1">{dragging.organizationName}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Alert Detail Modal — lets user add notes, see/create linked ticket
// ---------------------------------------------------------------------------

function AlertDetailModal({
  alert,
  onClose,
  onCreateTicket,
  onUpdated,
}: {
  alert: MonAlert;
  onClose: () => void;
  onCreateTicket: (id: string) => void;
  onUpdated: (a: MonAlert) => void;
}) {
  const [notes, setNotes] = useState(alert.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/v1/monitoring/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        onUpdated({ ...alert, notes });
      }
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleCreateTicket() {
    setCreatingTicket(true);
    try {
      await onCreateTicket(alert.id);
    } finally {
      setCreatingTicket(false);
    }
  }

  const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.WARNING;
  const stage = STAGE_CONFIG[alert.stage] ?? STAGE_CONFIG.TRIAGE;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={sev.variant} className="text-[10px]">{sev.label}</Badge>
              <span className={cn("text-[10.5px] px-2 py-0.5 rounded-md", stage.bg, stage.color)}>
                {stage.label}
              </span>
              <span className="text-[11px] text-slate-400 uppercase tracking-wide">
                {alert.sourceType}
              </span>
            </div>
            <h2 className="text-[16px] font-semibold text-slate-900 leading-snug">
              {alert.subject}
            </h2>
            {alert.organizationName && (
              <p className="text-[12.5px] text-slate-500 mt-1">{alert.organizationName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[calc(100vh-250px)] overflow-y-auto">
          {/* Body preview */}
          {alert.body && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Détails
              </h3>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-[13px] text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {alert.body.slice(0, 2000)}
              </div>
            </div>
          )}

          {/* Source + timing */}
          <div className="grid grid-cols-2 gap-4 text-[12.5px]">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Expéditeur</p>
              <p className="text-slate-700 mt-1">{alert.senderEmail}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Reçu</p>
              <p className="text-slate-700 mt-1">
                {new Date(alert.receivedAt).toLocaleString("fr-CA")}
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Notes
              </h3>
              {notes !== (alert.notes ?? "") && (
                <Button variant="primary" size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                  {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Enregistrer
                </Button>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Ajoutez des notes sur cette alerte…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
            />
          </div>

          {/* Ticket link or creation */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Ticket lié
            </h3>
            {alert.ticketId ? (
              <a
                href={`/tickets/${alert.ticketId}`}
                className="group flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Ticket className="h-4 w-4 text-blue-600" />
                  <span className="text-[13px] font-medium text-slate-900 group-hover:text-blue-700">
                    Ouvrir le ticket lié pour ajouter du temps
                  </span>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600" />
              </a>
            ) : (
              <Button variant="outline" size="sm" onClick={handleCreateTicket} disabled={creatingTicket}>
                {creatingTicket ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ticket className="h-3.5 w-3.5" />}
                Créer un ticket à partir de cette alerte
              </Button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}
