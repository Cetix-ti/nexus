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

interface CloseAuditRow {
  invocationId: string;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
  orgName: string;
  closedAt: string | null;
  verdict: "needs_improvement" | "blocked";
  readinessScore: number;
  warnings: string[];
  missingFields: string[];
  agent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
  } | null;
}

interface CloseAuditBucket {
  agent: CloseAuditRow["agent"];
  needsImprovement: number;
  blocked: number;
  items: CloseAuditRow[];
}

export default function SupervisionPage() {
  const [data, setData] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [closeAudits, setCloseAudits] = useState<CloseAuditBucket[]>([]);
  const [closeAuditsLoading, setCloseAuditsLoading] = useState(false);

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

  // Audits IA des notes de résolution — charge en parallèle du dashboard
  // principal. On garde les listes verticales courtes : si un ticket a été
  // audité plusieurs fois, seul le dernier verdict compte (agrégé côté API).
  useEffect(() => {
    let cancelled = false;
    setCloseAuditsLoading(true);
    const { from, to } = resolveRange(range, customFrom, customTo);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    fetch(`/api/v1/supervision/close-audits?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => { if (!cancelled) setCloseAudits(d.agents ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCloseAuditsLoading(false); });
    return () => { cancelled = true; };
  }, [range, customFrom, customTo]);

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

      {/* Audits IA des notes de résolution — superviseur uniquement.
          Liste les tickets fermés sans note jugée suffisante. */}
      <CloseAuditsSection buckets={closeAudits} loading={closeAuditsLoading} />

      {/* Audit déplacements : détection manqués/doublons basés sur les
          events calendrier WORK_LOCATION vs les saisies de temps onsite. */}
      <TravelAuditSection
        from={resolveRange(range, customFrom, customTo).from.toISOString()}
        to={resolveRange(range, customFrom, customTo).to.toISOString()}
      />

      {/* Dépenses soumises par les agents sur la plage (total, sans reçu,
          détail). Aide à repérer les patterns inhabituels. */}
      <AgentExpensesSection
        from={resolveRange(range, customFrom, customTo).from.toISOString()}
        to={resolveRange(range, customFrom, customTo).to.toISOString()}
      />

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
// Agent expenses — vue agrégée des dépenses soumises par les agents sur la
// plage courante. Permet au superviseur de voir qui dépense quoi et de
// repérer les entrées sans pièce jointe (à chasser).
// ---------------------------------------------------------------------------
interface AgentExpensesBucket {
  agent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
  };
  total: number;
  billable: number;
  entryCount: number;
  withoutReceiptCount: number;
  entries: Array<{
    id: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    vendor: string | null;
    isBillable: boolean;
    hasReceipt: boolean;
    organizationName: string | null;
    reportId: string;
    reportTitle: string;
    reportStatus: string;
  }>;
}

function AgentExpensesSection({ from, to }: { from: string; to: string }) {
  const [buckets, setBuckets] = useState<AgentExpensesBucket[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [withoutReceipt, setWithoutReceipt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    fetch(`/api/v1/supervision/expenses?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setBuckets(d.agents ?? []);
        setGrandTotal(d.totals?.grandTotal ?? 0);
        setWithoutReceipt(d.totals?.withoutReceipt ?? 0);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  if (!loading && buckets.length === 0) return null;

  const fmtMoneyCa = (v: number) =>
    v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
          <Briefcase className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-slate-900">
            Dépenses soumises par les agents
            {grandTotal > 0 && (
              <span className="ml-2 text-[12.5px] font-normal text-slate-500 tabular-nums">
                · {fmtMoneyCa(grandTotal)}
              </span>
            )}
          </p>
          <p className="text-[12px] text-slate-500">
            Toutes les entrées créées sur la plage, regroupées par agent.
            {withoutReceipt > 0 && (
              <span className="ml-1 text-amber-700">
                · {withoutReceipt} sans pièce jointe
              </span>
            )}
          </p>
        </div>
      </div>
      {loading ? (
        <div className="px-5 py-6 text-[13px] text-slate-400">Chargement…</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {buckets.map((b) => {
            const isOpen = expanded.has(b.agent.id);
            return (
              <li key={b.agent.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((s) => {
                      const next = new Set(s);
                      if (next.has(b.agent.id)) next.delete(b.agent.id);
                      else next.add(b.agent.id);
                      return next;
                    })
                  }
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-slate-900 truncate">
                      {b.agent.firstName} {b.agent.lastName}
                    </p>
                    <p className="text-[11.5px] text-slate-500 truncate">
                      {b.entryCount} entrée{b.entryCount > 1 ? "s" : ""}
                      {b.billable > 0 && (
                        <>
                          {" · "}
                          Facturable : <span className="tabular-nums">{fmtMoneyCa(b.billable)}</span>
                        </>
                      )}
                      {b.withoutReceiptCount > 0 && (
                        <span className="text-amber-700">
                          {" · "}
                          {b.withoutReceiptCount} sans facture
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[13px] font-bold text-slate-800 tabular-nums">
                    {fmtMoneyCa(b.total)}
                  </span>
                </button>
                {isOpen && (
                  <ul className="divide-y divide-slate-100 bg-slate-50/40">
                    {b.entries.map((e) => (
                      <li key={e.id} className="px-5 py-2.5 pl-12">
                        <div className="flex items-center gap-3 text-[12.5px]">
                          <span className="text-slate-500 tabular-nums w-20 shrink-0">
                            {new Date(e.date).toLocaleDateString("fr-CA", { day: "2-digit", month: "short" })}
                          </span>
                          <span className="text-slate-400 shrink-0 min-w-[90px]">{e.category}</span>
                          <span className="flex-1 text-slate-700 truncate">
                            {e.description || <span className="italic text-slate-400">(sans description)</span>}
                          </span>
                          {e.organizationName && (
                            <span className="text-[11px] text-slate-500 shrink-0">{e.organizationName}</span>
                          )}
                          {e.isBillable && (
                            <span className="text-[10.5px] font-semibold text-violet-700 bg-violet-50 ring-1 ring-violet-200 rounded px-1.5 py-0.5 shrink-0">
                              Fact.
                            </span>
                          )}
                          {!e.hasReceipt && (
                            <span
                              className="text-[10.5px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-1.5 py-0.5 shrink-0"
                              title="Aucune pièce jointe (facture)"
                            >
                              Pas de facture
                            </span>
                          )}
                          <span className="font-bold tabular-nums text-slate-800 w-20 text-right shrink-0">
                            {fmtMoneyCa(e.amount)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Travel audit — events WORK_LOCATION (Outlook) vs saisies de temps onsite.
// Détecte : (1) aucun agent n'a facturé de déplacement alors qu'une visite
// a eu lieu, (2) plusieurs agents ont facturé le même déplacement en
// doublon. Les clients dont OrgMileageRate.billToClient=false sont ignorés.
// ---------------------------------------------------------------------------
interface TravelAuditRow {
  eventId: string;
  title: string;
  rawTitle: string | null;
  startsAt: string;
  organizationId: string;
  organizationName: string;
  source: "db" | "decoded";
  expectedAgents: Array<{ id: string; name: string }>;
  billedEntries: Array<{
    timeEntryId: string;
    agentId: string;
    agentName: string;
    ticketId: string;
    ticketNumber: number;
    ticketSubject: string;
  }>;
  status: "missing" | "duplicated" | "ok" | "not_billable";
}

function TravelAuditSection({ from, to }: { from: string; to: string }) {
  const [missing, setMissing] = useState<TravelAuditRow[]>([]);
  const [duplicated, setDuplicated] = useState<TravelAuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    fetch(`/api/v1/supervision/travel-audit?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { missing: [], duplicated: [] }))
      .then((d) => {
        if (cancelled) return;
        setMissing(d.missing ?? []);
        setDuplicated(d.duplicated ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  if (!loading && missing.length === 0 && duplicated.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
          <MapPin className="h-5 w-5 text-orange-600" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-slate-900">
            Audit des déplacements
            <span className="ml-2 inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-orange-100 px-2 text-[11px] font-bold text-orange-700 tabular-nums">
              {missing.length + duplicated.length}
            </span>
          </p>
          <p className="text-[12px] text-slate-500">
            Events calendrier (Outlook « Localisation ») croisés avec les saisies de temps
            onsite. Vérifie que chaque déplacement est facturé exactement une fois.
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {missing.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> Aucun déplacement facturé ({missing.length})
            </p>
            <ul className="space-y-2">
              {missing.map((r) => (
                <TravelRow key={r.eventId} row={r} variant="missing" />
              ))}
            </ul>
          </div>
        )}
        {duplicated.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> Facturé par plusieurs agents ({duplicated.length})
            </p>
            <ul className="space-y-2">
              {duplicated.map((r) => (
                <TravelRow key={r.eventId} row={r} variant="duplicated" />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function TravelRow({ row, variant }: { row: TravelAuditRow; variant: "missing" | "duplicated" }) {
  const dateStr = new Date(row.startsAt).toLocaleDateString("fr-CA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <li className={cn(
      "rounded-lg border px-3 py-2",
      variant === "missing"
        ? "border-rose-100 bg-rose-50/40"
        : "border-amber-100 bg-amber-50/40",
    )}>
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="font-medium text-slate-800 truncate">{row.organizationName}</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">{dateStr}</span>
        {row.rawTitle && (
          <>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-[11px] text-slate-500">{row.rawTitle}</span>
          </>
        )}
        {row.source === "decoded" && (
          <span
            className="text-[10px] font-semibold text-blue-600 bg-blue-50 ring-1 ring-blue-200 rounded px-1.5 py-0.5"
            title="Client/agents résolus depuis le titre — vérifier si calendarAliases manque"
          >
            décodé
          </span>
        )}
      </div>
      {row.expectedAgents.length > 0 && (
        <p className="mt-1 text-[11.5px] text-slate-500">
          Agents attendus : {row.expectedAgents.map((a) => a.name).join(", ")}
        </p>
      )}
      {row.billedEntries.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {row.billedEntries.map((e) => (
            <li key={e.timeEntryId} className="text-[11.5px] text-slate-600 flex items-center gap-1.5">
              <span className="font-mono text-[10.5px] text-slate-400">TK-{e.ticketNumber}</span>
              <span className="text-slate-400">·</span>
              <span>{e.agentName}</span>
              <Link
                href={`/tickets/${e.ticketId}`}
                className="text-blue-600 hover:text-blue-700 ml-auto"
              >
                Voir ticket →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Close audits — tickets fermés/résolus avec documentation insuffisante
// selon l'IA. Regroupés par agent pour que le superviseur identifie les
// techs qui ont tendance à fermer trop vite sans documenter.
// ---------------------------------------------------------------------------
function CloseAuditsSection({
  buckets,
  loading,
}: {
  buckets: CloseAuditBucket[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const total = buckets.reduce((s, b) => s + b.blocked + b.needsImprovement, 0);

  if (!loading && total === 0) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-slate-900">Notes de résolution conformes</p>
            <p className="text-[12.5px] text-slate-500">
              Aucune fermeture récente n&apos;a été signalée par l&apos;IA comme ayant une
              documentation insuffisante.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-slate-900">
            Notes de résolution à revoir
            <span className="ml-2 inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-700 tabular-nums">
              {total}
            </span>
          </p>
          <p className="text-[12px] text-slate-500">
            Tickets fermés sans note jugée suffisante par l&apos;IA (verdict « à améliorer » ou « insuffisant »).
          </p>
        </div>
      </div>
      {loading ? (
        <div className="px-5 py-6 text-[13px] text-slate-400">Chargement…</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {buckets.map((b) => {
            const key = b.agent?.id ?? "__unassigned__";
            const isOpen = expanded.has(key);
            const name = b.agent
              ? `${b.agent.firstName} ${b.agent.lastName}`.trim()
              : "(ticket non assigné)";
            const subtotal = b.blocked + b.needsImprovement;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((s) => {
                      const next = new Set(s);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-slate-900 truncate">{name}</p>
                    {b.agent?.email && (
                      <p className="text-[11.5px] text-slate-500 truncate">{b.agent.email}</p>
                    )}
                  </div>
                  {b.blocked > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                      {b.blocked} insuffisant{b.blocked > 1 ? "s" : ""}
                    </span>
                  )}
                  {b.needsImprovement > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      {b.needsImprovement} à améliorer
                    </span>
                  )}
                  <span className="text-[11.5px] text-slate-400 tabular-nums w-10 text-right">
                    {subtotal}
                  </span>
                </button>
                {isOpen && (
                  <ul className="divide-y divide-slate-100 bg-slate-50/40">
                    {b.items.map((r) => (
                      <li key={r.invocationId} className="px-5 py-3 pl-12">
                        <Link
                          href={`/tickets/${r.ticketId}`}
                          className="group flex items-start gap-3"
                        >
                          <span className="font-mono text-[11px] text-slate-400 tabular-nums w-14 pt-0.5 shrink-0">
                            TK-{r.ticketNumber}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-slate-900 truncate group-hover:text-blue-600">
                              {r.ticketSubject}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
                              <span>{r.orgName}</span>
                              {r.closedAt && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span>Fermé {new Date(r.closedAt).toLocaleDateString("fr-CA")}</span>
                                </>
                              )}
                              <span className="text-slate-300">·</span>
                              <span>Score {Math.round((r.readinessScore ?? 0) * 100)}%</span>
                            </div>
                            {r.warnings.length > 0 && (
                              <p className="mt-1 text-[12px] text-amber-700">
                                {r.warnings[0]}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1",
                              r.verdict === "blocked"
                                ? "bg-red-50 text-red-700 ring-red-200"
                                : "bg-amber-50 text-amber-700 ring-amber-200",
                            )}
                          >
                            {r.verdict === "blocked" ? "Insuffisant" : "À améliorer"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
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
