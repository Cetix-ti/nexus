"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  X,
  ExternalLink,
  Clock,
  User,
  Calendar,
  Plus,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  ACTIVE_TICKET_STATUSES,
  type Ticket,
  type TicketStatus,
} from "@/lib/mock-data";
import {
  TIME_TYPE_LABELS,
  TIME_TYPE_ICONS,
  COVERAGE_LABELS,
  type TimeEntry,
  type TimeType,
} from "@/lib/billing/types";

interface ProjectKanbanQuickViewProps {
  ticket: Ticket | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (id: string, status: TicketStatus) => void;
}

const STATUS_LABELS_FR: Record<TicketStatus, string> = {
  new: "Nouveau",
  open: "Ouvert",
  in_progress: "En cours",
  on_site: "Sur place",
  pending: "En attente",
  waiting_client: "Attente client",
  waiting_vendor: "Attente fournisseur",
  scheduled: "Planifié",
  resolved: "Résolu",
  closed: "Fermé",
  cancelled: "Annulé",
  deleted: "Supprimé",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-700",
    "from-violet-500 to-violet-700",
    "from-emerald-500 to-emerald-700",
    "from-amber-500 to-amber-700",
    "from-rose-500 to-rose-700",
    "from-cyan-500 to-cyan-700",
  ];
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

export function ProjectKanbanQuickView({
  ticket,
  open,
  onClose,
  onStatusChange,
}: ProjectKanbanQuickViewProps) {
  const [localStatus, setLocalStatus] = useState<TicketStatus | undefined>(
    ticket?.status
  );
  const [localEntries, setLocalEntries] = useState<TimeEntry[]>([]);
  const [apiEntries, setApiEntries] = useState<TimeEntry[]>([]);
  const [currentUserName, setCurrentUserName] = useState("—");
  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.firstName) setCurrentUserName(`${d.firstName} ${d.lastName}`);
    }).catch(() => {});
  }, []);
  const [timeType, setTimeType] = useState<TimeType>("remote_work");
  const [duration, setDuration] = useState<string>("30");
  const [timeDate, setTimeDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [timeStart, setTimeStart] = useState(() => {
    const d = new Date();
    const m = Math.floor(d.getMinutes() / 15) * 15;
    return `${String(d.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
  const [description, setDescription] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalStatus(ticket?.status);
    setLocalEntries([]);
    setApiEntries([]);
    setTimeType("remote_work");
    setDuration("30");
    setDescription("");
    // Fetch time entries for this ticket
    if (ticket?.id) {
      fetch(`/api/v1/time-entries?ticketId=${ticket.id}`)
        .then((r) => r.ok ? r.json() : [])
        .then((d) => setApiEntries(Array.isArray(d) ? d : []))
        .catch(() => setApiEntries([]));
    }
  }, [ticket?.id, ticket?.status]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const ticketEntries = useMemo(() => {
    if (!ticket) return [];
    return [...apiEntries, ...localEntries].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }, [ticket, apiEntries, localEntries]);

  const totals = useMemo(() => {
    const total = ticketEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const billable = ticketEntries
      .filter((e) =>
        ["billable", "hour_bank_overage", "msp_overage", "travel_billable"].includes(
          e.coverageStatus
        )
      )
      .reduce((s, e) => s + e.durationMinutes, 0);
    const included = ticketEntries
      .filter((e) =>
        ["included_in_contract", "deducted_from_hour_bank"].includes(e.coverageStatus)
      )
      .reduce((s, e) => s + e.durationMinutes, 0);
    return { total, billable, included };
  }, [ticketEntries]);

  if (!open || !ticket) return null;

  const status = localStatus || ticket.status;
  const statusCfg = STATUS_CONFIG[status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];

  function handleStatusChange(s: TicketStatus) {
    setLocalStatus(s);
    onStatusChange?.(ticket!.id, s);
  }

  async function handleSaveTime() {
    const mins = parseInt(duration, 10);
    if (!mins || mins <= 0 || saving || !ticket) return;
    // organizationId vient du ticket ; sans lui on ne peut pas persister.
    const orgId = (ticket as unknown as { organizationId?: string }).organizationId;
    if (!orgId) {
      alert(
        "Organisation introuvable pour ce ticket — impossible d'enregistrer la saisie.",
      );
      return;
    }
    setSaving(true);
    try {
      const startedAt = new Date(`${timeDate}T${timeStart}:00`);
      const endedAt = new Date(startedAt.getTime() + mins * 60_000);
      const res = await fetch("/api/v1/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          organizationId: orgId,
          timeType,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMinutes: mins,
          description: description || TIME_TYPE_LABELS[timeType],
          isOnsite: timeType === "onsite_work",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Échec : ${err.error || res.status}`);
        return;
      }
      // Recharge les entries depuis l'API pour refléter la persistance DB
      // (évite un état local qui diverge du serveur).
      const refreshed = await fetch(
        `/api/v1/time-entries?ticketId=${ticket.id}`,
      );
      if (refreshed.ok) {
        const rows = await refreshed.json();
        setApiEntries(Array.isArray(rows) ? rows : []);
      }
      setLocalEntries([]);
      setDescription("");
      setDuration("30");
    } catch (e) {
      alert(`Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[11px] font-semibold text-slate-400 tabular-nums">
                #{ticket.number}
              </span>
              <span className="text-[11px] text-slate-300">•</span>
              <span className="text-[11.5px] text-slate-500 truncate">
                {ticket.organizationName}
              </span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900 leading-tight pr-4">
              {ticket.subject}
            </h2>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                  statusCfg.bgClass,
                  statusCfg.textClass
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} />
                {STATUS_LABELS_FR[status]}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                  priorityCfg.bgClass,
                  priorityCfg.textClass
                )}
              >
                {priorityCfg.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href={`/tickets/${ticket.id}`} onClick={onClose}>
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5" />
                Page complète
              </Button>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-x divide-slate-100">
            {/* Left */}
            <div className="p-6 space-y-5 min-w-0">
              {/* Time stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-blue-50/60 to-white p-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                    Total
                  </p>
                  <p className="mt-1 text-[18px] font-semibold tabular-nums text-slate-900">
                    {formatHours(totals.total)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-emerald-50/60 to-white p-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                    Inclus
                  </p>
                  <p className="mt-1 text-[18px] font-semibold tabular-nums text-emerald-700">
                    {formatHours(totals.included)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-amber-50/60 to-white p-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                    Facturable
                  </p>
                  <p className="mt-1 text-[18px] font-semibold tabular-nums text-amber-700">
                    {formatHours(totals.billable)}
                  </p>
                </div>
              </div>

              {/* Saisir du temps */}
              <div className="rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50/40 to-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
                    <Timer className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-[13px] font-semibold text-slate-900">
                    Saisir du temps
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2 mb-2">
                  <Select value={timeType} onValueChange={(v) => setTimeType(v as TimeType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIME_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {TIME_TYPE_ICONS[k as TimeType]} {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="date"
                    value={timeDate}
                    onChange={(e) => setTimeDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <select
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  >
                    {Array.from({ length: 65 }, (_, i) => {
                      const h = Math.floor((i * 15 + 6 * 60) / 60);
                      const m = (i * 15 + 6 * 60) % 60;
                      if (h > 22) return null;
                      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      return <option key={val} value={val}>{val}</option>;
                    })}
                  </select>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      step={5}
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 pr-10 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-medium">
                      min
                    </span>
                  </div>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optionnel)"
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-slate-500">
                    Inclus au contrat par défaut
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveTime}
                    loading={saving}
                    disabled={!parseInt(duration, 10)}
                  >
                    <Plus className="h-3 w-3" />
                    Ajouter
                  </Button>
                </div>
              </div>

              {/* Existing entries */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Saisies de temps ({ticketEntries.length})
                </h3>
                {ticketEntries.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center">
                    <p className="text-[12px] text-slate-400">
                      Aucune saisie pour ce ticket
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ticketEntries.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <div
                          className={cn(
                            "h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold shrink-0",
                            getAvatarGradient(e.agentName)
                          )}
                        >
                          {getInitials(e.agentName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12.5px] font-semibold text-slate-900">
                              {e.agentName}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {TIME_TYPE_ICONS[e.timeType]} {TIME_TYPE_LABELS[e.timeType]}
                            </span>
                            <span className="ml-auto text-[12px] font-semibold tabular-nums text-blue-700">
                              {formatHours(e.durationMinutes)}
                            </span>
                          </div>
                          {e.description && (
                            <p className="mt-0.5 text-[12px] text-slate-600 line-clamp-2">
                              {e.description}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-slate-400">
                            <span>
                              {formatDistanceToNow(new Date(e.startedAt), {
                                addSuffix: true,
                                locale: fr,
                              })}
                            </span>
                            <span>•</span>
                            <span>{COVERAGE_LABELS[e.coverageStatus]}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-4">
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Description du ticket
                </h3>
                <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </p>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="p-5 space-y-4 bg-slate-50/40 min-w-0">
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Statut
                </h3>
                <Select
                  value={status}
                  onValueChange={(v) => handleStatusChange(v as TicketStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVE_TICKET_STATUSES.map((k) => (
                      <SelectItem key={k} value={k}>
                        {STATUS_LABELS_FR[k]}
                      </SelectItem>
                    ))}
                    {!ACTIVE_TICKET_STATUSES.includes(status) &&
                      status !== "deleted" && (
                        <SelectItem value={status}>
                          {STATUS_LABELS_FR[status]} (legacy)
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Assigné à
                </h3>
                {ticket.assigneeName ? (
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold",
                        getAvatarGradient(ticket.assigneeName)
                      )}
                    >
                      {getInitials(ticket.assigneeName)}
                    </div>
                    <span className="text-[12.5px] text-slate-700 truncate">
                      {ticket.assigneeName}
                    </span>
                  </div>
                ) : (
                  <span className="text-[12px] italic text-slate-400">Non assigné</span>
                )}
              </div>

              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Demandeur
                </h3>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-slate-700 truncate">
                      {ticket.requesterName}
                    </p>
                    <p className="text-[10.5px] text-slate-400 truncate">
                      {ticket.requesterEmail}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-[11.5px]">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-500">Créé</span>
                  <span className="ml-auto text-slate-700 tabular-nums">
                    {format(new Date(ticket.createdAt), "d MMM, HH:mm", { locale: fr })}
                  </span>
                </div>
                {ticket.dueAt && (
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span className="text-slate-500">Échéance</span>
                    <span
                      className={cn(
                        "ml-auto tabular-nums",
                        ticket.isOverdue ? "text-red-600 font-semibold" : "text-slate-700"
                      )}
                    >
                      {format(new Date(ticket.dueAt), "d MMM, HH:mm", { locale: fr })}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>Catégorie : {ticket.categoryName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
