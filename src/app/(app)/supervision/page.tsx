"use client";

// ============================================================================
// SUPERVISION — vue 360° des agents supervisés.
//
// Affiche pour chaque agent supervisé par le user connecté :
//   - Heures facturées (client / interne / total) sur la plage
//   - Tickets avec saisie de temps vs ouverts sans saisie
//   - Tickets pris en charge / résolus
//   - Déplacements (CalendarEvent WORK_LOCATION)
//   - Conformité SLA (breached / total)
//
// Date range : Aujourd'hui (défaut) · Cette semaine · Semaine dernière ·
// Ce mois · Mois dernier · Plage personnalisée.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  Ticket,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Briefcase,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketRef {
  id: string;
  number: number;
  subject: string;
  organization?: { id: string; name: string; clientCode: string | null } | null;
  status?: string;
  priority?: string;
  isInternal?: boolean | null;
  minutes?: number;
  createdAt?: string;
  resolvedAt?: string;
  slaBreached?: boolean;
}

interface Visit {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  organization: { id: string; name: string; clientCode: string | null } | null;
  linkedTickets: { id: string; number: number; subject: string }[];
}

interface AgentStats {
  totalMinutes: number;
  clientMinutes: number;
  internalMinutes: number;
  ticketsWorked: TicketRef[];
  ticketsOpenNoTime: TicketRef[];
  ticketsTakenCount: number;
  ticketsTaken: TicketRef[];
  ticketsResolvedCount: number;
  ticketsResolved: TicketRef[];
  slaBreachedCount: number;
  slaCompliantCount: number;
  slaTotal: number;
  onsiteVisits: Visit[];
}

interface AgentData {
  agent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    role: string;
  };
  stats: AgentStats;
}

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------

type RangeKey = "today" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

function rangeLabel(k: RangeKey): string {
  const labels: Record<RangeKey, string> = {
    today: "Aujourd'hui",
    this_week: "Cette semaine",
    last_week: "Semaine dernière",
    this_month: "Ce mois",
    last_month: "Mois dernier",
    custom: "Personnalisé",
  };
  return labels[k];
}

function resolveRange(k: RangeKey, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  if (k === "today") {
    const f = new Date(now); f.setHours(0, 0, 0, 0);
    const t = new Date(now); t.setHours(23, 59, 59, 999);
    return { from: f, to: t };
  }
  if (k === "this_week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const f = new Date(now); f.setDate(f.getDate() - diff); f.setHours(0, 0, 0, 0);
    const t = new Date(f); t.setDate(t.getDate() + 6); t.setHours(23, 59, 59, 999);
    return { from: f, to: t };
  }
  if (k === "last_week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const f = new Date(now); f.setDate(f.getDate() - diff - 7); f.setHours(0, 0, 0, 0);
    const t = new Date(f); t.setDate(t.getDate() + 6); t.setHours(23, 59, 59, 999);
    return { from: f, to: t };
  }
  if (k === "this_month") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    const t = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: f, to: t };
  }
  if (k === "last_month") {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: f, to: t };
  }
  // custom
  const f = customFrom ? new Date(customFrom) : new Date(now);
  f.setHours(0, 0, 0, 0);
  const t = customTo ? new Date(customTo) : new Date(now);
  t.setHours(23, 59, 59, 999);
  return { from: f, to: t };
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SupervisionPage() {
  const [data, setData] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = resolveRange(range, customFrom, customTo);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await fetch(`/api/v1/supervision/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d.agents || []);
      // Auto-expand all agents
      setExpandedAgents(new Set((d.agents || []).map((a: AgentData) => a.agent.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[13px] text-slate-400">Chargement…</p>
      </div>
    );
  }

  if (data.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Users className="h-8 w-8 text-slate-300" />
        <p className="text-[14px] text-slate-500">
          Aucun agent sous votre supervision.
        </p>
        <p className="text-[12px] text-slate-400">
          Demandez à un super-admin de configurer vos agents dans Paramètres → Supervision.
        </p>
      </div>
    );
  }

  function toggleAgent(id: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Supervision
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Vue 360° de vos agents · {data.length} agent{data.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/supervision/coaching"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          Coaching IA
        </Link>
      </div>

      {/* Date range selector */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
            {(["today", "this_week", "last_week", "this_month", "last_month", "custom"] as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                  range === k
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {rangeLabel(k)}
              </button>
            ))}
            {range === "custom" && (
              <div className="flex items-center gap-2 ml-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] focus:border-blue-500 focus:outline-none"
                />
                <span className="text-[12px] text-slate-400">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] focus:border-blue-500 focus:outline-none"
                />
                <Button size="sm" variant="outline" onClick={load}>Appliquer</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* Agent cards */}
      <div className="space-y-4">
        {data.map((d) => (
          <AgentCard
            key={d.agent.id}
            data={d}
            expanded={expandedAgents.has(d.agent.id)}
            onToggle={() => toggleAgent(d.agent.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

function AgentCard({
  data,
  expanded,
  onToggle,
}: {
  data: AgentData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { agent, stats } = data;
  const slaRate = stats.slaTotal > 0
    ? Math.round((stats.slaCompliantCount / stats.slaTotal) * 100)
    : null;
  const [section, setSection] = useState<string>("worked");

  return (
    <Card className="overflow-hidden">
      {/* Header — clickable to expand/collapse */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        {agent.avatar ? (
          <img src={agent.avatar} className="h-10 w-10 rounded-full object-cover ring-2 ring-white" alt="" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[14px] font-bold ring-2 ring-white">
            {agent.firstName[0]}{agent.lastName[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-slate-900">
            {agent.firstName} {agent.lastName}
          </p>
          <p className="text-[12px] text-slate-500">{agent.email}</p>
        </div>
        {/* Quick stats — inline sur desktop, grille compacte mobile */}
        <div className="hidden sm:flex items-center gap-4 text-[12px]">
          <Stat icon={Clock} label="Heures" value={fmtDuration(stats.totalMinutes)} color="text-blue-600" />
          <Stat icon={Ticket} label="Résolus" value={String(stats.ticketsResolvedCount)} color="text-emerald-600" />
          <Stat icon={MapPin} label="Visites" value={String(stats.onsiteVisits.length)} color="text-amber-600" />
          {slaRate !== null && (
            <Stat
              icon={slaRate >= 90 ? CheckCircle2 : AlertTriangle}
              label="SLA"
              value={`${slaRate}%`}
              color={slaRate >= 90 ? "text-emerald-600" : slaRate >= 70 ? "text-amber-600" : "text-red-600"}
            />
          )}
        </div>
        <span className="text-slate-400 shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {/* Mobile quick stats (visible <sm only) */}
      {!expanded && (
        <div className="sm:hidden flex items-center gap-3 px-5 pb-3 -mt-1 text-[11.5px] flex-wrap">
          <Stat icon={Clock} label="" value={fmtDuration(stats.totalMinutes)} color="text-blue-600" />
          <Stat icon={Ticket} label="" value={`${stats.ticketsResolvedCount} rés.`} color="text-emerald-600" />
          <Stat icon={MapPin} label="" value={`${stats.onsiteVisits.length} vis.`} color="text-amber-600" />
          {slaRate !== null && (
            <Stat
              icon={slaRate >= 90 ? CheckCircle2 : AlertTriangle}
              label="SLA"
              value={`${slaRate}%`}
              color={slaRate >= 90 ? "text-emerald-600" : "text-red-600"}
            />
          )}
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-200">
          {/* Sub-tabs — scrollable horizontalement sur mobile */}
          <div className="flex items-center gap-1 px-5 border-b border-slate-100 bg-slate-50/30 overflow-x-auto scrollbar-hide">
            {[
              { k: "worked", label: "Tickets travaillés", count: stats.ticketsWorked.length },
              { k: "notime", label: "Sans saisie", count: stats.ticketsOpenNoTime.length },
              { k: "taken", label: "Pris en charge", count: stats.ticketsTakenCount },
              { k: "resolved", label: "Résolus", count: stats.ticketsResolvedCount },
              { k: "visits", label: "Déplacements", count: stats.onsiteVisits.length },
              { k: "hours", label: "Heures détaillées", count: null },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setSection(t.k)}
                className={cn(
                  "px-3 py-2 text-[11.5px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  section === t.k
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {t.label}
                {t.count !== null && (
                  <span className={cn("ml-1.5", section === t.k ? "text-indigo-400" : "text-slate-400")}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-5">
            {section === "hours" && <HoursDetail stats={stats} />}
            {section === "worked" && <TicketList tickets={stats.ticketsWorked} showMinutes />}
            {section === "notime" && <TicketList tickets={stats.ticketsOpenNoTime} showSla />}
            {section === "taken" && <TicketList tickets={stats.ticketsTaken} />}
            {section === "resolved" && <TicketList tickets={stats.ticketsResolved} showResolved />}
            {section === "visits" && <VisitList visits={stats.onsiteVisits} />}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-semibold", color)}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function HoursDetail({ stats }: { stats: AgentStats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard
        label="Heures clients"
        value={fmtDuration(stats.clientMinutes)}
        sub={`${stats.ticketsWorked.filter((t) => !t.isInternal).length} tickets`}
        accent="bg-blue-50 text-blue-700 ring-blue-200"
        icon={Briefcase}
      />
      <MetricCard
        label="Heures internes"
        value={fmtDuration(stats.internalMinutes)}
        sub={`${stats.ticketsWorked.filter((t) => t.isInternal).length} tickets`}
        accent="bg-violet-50 text-violet-700 ring-violet-200"
        icon={Users}
      />
      <MetricCard
        label="Total combiné"
        value={fmtDuration(stats.totalMinutes)}
        sub={`${stats.ticketsWorked.length} tickets · SLA ${stats.slaTotal > 0 ? Math.round((stats.slaCompliantCount / stats.slaTotal) * 100) : "—"}%`}
        accent="bg-emerald-50 text-emerald-700 ring-emerald-200"
        icon={Clock}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  icon: typeof Clock;
}) {
  return (
    <div className={cn("rounded-xl p-4 ring-1", accent)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 opacity-70" />
        <span className="text-[12px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="text-[24px] font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-[11.5px] opacity-70">{sub}</p>
    </div>
  );
}

function TicketList({
  tickets,
  showMinutes,
  showSla,
  showResolved,
}: {
  tickets: TicketRef[];
  showMinutes?: boolean;
  showSla?: boolean;
  showResolved?: boolean;
}) {
  if (tickets.length === 0) {
    return <p className="text-[12.5px] text-slate-400 italic py-4 text-center">Aucun ticket.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-[12.5px] min-w-[500px]">
        <thead className="bg-slate-50">
          <tr className="text-left text-slate-500">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Sujet</th>
            <th className="px-3 py-2 font-medium">Client</th>
            {showMinutes && <th className="px-3 py-2 font-medium">Temps</th>}
            {showSla && <th className="px-3 py-2 font-medium">SLA</th>}
            {showResolved && <th className="px-3 py-2 font-medium">Résolu le</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50/50">
              <td className="px-3 py-2 font-mono text-slate-500">
                <Link href={`/tickets/${t.id}`} className="hover:text-blue-600">{t.number}</Link>
              </td>
              <td className="px-3 py-2 text-slate-800 truncate max-w-[300px]">
                <Link href={`/tickets/${t.id}`} className="hover:text-blue-600">{t.subject}</Link>
              </td>
              <td className="px-3 py-2 text-slate-600">
                {t.organization?.name || <span className="text-slate-400">—</span>}
              </td>
              {showMinutes && (
                <td className="px-3 py-2 font-semibold text-blue-700">{fmtDuration(t.minutes ?? 0)}</td>
              )}
              {showSla && (
                <td className="px-3 py-2">
                  {t.slaBreached ? (
                    <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                      <AlertTriangle className="h-3 w-3" /> Dépassé
                    </span>
                  ) : (
                    <span className="text-emerald-600">OK</span>
                  )}
                </td>
              )}
              {showResolved && (
                <td className="px-3 py-2 text-slate-500">{t.resolvedAt ? fmtDate(t.resolvedAt) : "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisitList({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) {
    return <p className="text-[12.5px] text-slate-400 italic py-4 text-center">Aucun déplacement.</p>;
  }
  return (
    <div className="space-y-2">
      {visits.map((v) => (
        <div key={v.id} className="rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50/50 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-[13px] font-semibold text-slate-900 truncate">{v.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11.5px] text-slate-500">
                <CalendarDays className="h-3 w-3" />
                {fmtDate(v.startsAt)} · {fmtTime(v.startsAt)} – {fmtTime(v.endsAt)}
              </div>
              {v.organization && (
                <p className="text-[12px] text-slate-600 mt-1">{v.organization.name}</p>
              )}
            </div>
          </div>
          {v.linkedTickets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {v.linkedTickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
                >
                  <Ticket className="h-3 w-3" />#{t.number}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
