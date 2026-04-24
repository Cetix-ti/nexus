"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Loader2,
  Ticket,
  Clock,
  CircleDot,
  Hourglass,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_MAP,
  PORTAL_STATUS_GROUPS,
  PORTAL_PRIORITIES,
  PRIORITY_MAP,
  getGroupForStatus,
  type PortalStatusGroup,
} from "@/lib/portal/ticket-status-config";
import { useLocaleStore } from "@/stores/locale-store";

// ── Types ──────────────────────────────────────────────────────────────────

interface PortalTicket {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  organizationName: string;
  requesterName: string;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  isOverdue: boolean;
  slaBreached: boolean;
}

interface TicketStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  slaBreached: number;
  overdue: number;
}

type TabKey = "active" | "open" | "in_progress" | "waiting" | "resolved";

// ── Tab config (derived from status groups) ────────────────────────────────

const TABS: { key: TabKey; labelKey: string; groupKeys: string[] }[] = [
  { key: "active",      labelKey: "portal.tickets.tab.active",      groupKeys: ["open", "in_progress", "waiting"] },
  { key: "open",        labelKey: "portal.tickets.tab.open",        groupKeys: ["open"] },
  { key: "in_progress", labelKey: "portal.tickets.tab.in_progress", groupKeys: ["in_progress"] },
  { key: "waiting",     labelKey: "portal.tickets.tab.waiting",     groupKeys: ["waiting"] },
  { key: "resolved",    labelKey: "portal.tickets.tab.resolved",    groupKeys: ["resolved"] },
];

function statusMatchesTab(status: string, tabKey: TabKey): boolean {
  const tab = TABS.find((t) => t.key === tabKey)!;
  const groupStatuses = tab.groupKeys.flatMap(
    (k) => PORTAL_STATUS_GROUPS.find((g) => g.key === k)?.statuses ?? [],
  );
  return groupStatuses.includes(status);
}

// ── Group icons ────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, any> = {
  open: CircleDot,
  in_progress: Wrench,
  waiting: Hourglass,
  resolved: CheckCircle2,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function useTimeAgo() {
  const tr = useLocaleStore((s) => s.t);
  const locale = useLocaleStore((s) => s.locale);
  return (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tr("portal.home.timeNow");
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}${locale === "fr" ? "j" : "d"}`;
  };
}

function countForGroup(
  stats: TicketStats | null,
  group: PortalStatusGroup,
): number {
  if (!stats) return 0;
  return group.statuses.reduce((sum, s) => {
    const found = stats.byStatus.find((b) => b.status === s);
    return sum + (found?.count ?? 0);
  }, 0);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PortalTicketsPage() {
  const tr = useLocaleStore((s) => s.t);
  const timeAgo = useTimeAgo();
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("active");

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/portal/tickets").then((r) =>
        r.ok ? r.json() : { data: [] },
      ),
      fetch("/api/v1/portal/tickets/stats").then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([ticketRes, statsRes]) => {
        setTickets(ticketRes.data ?? []);
        setStats(statsRes);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Active ticket groups (excluding resolved/closed/cancelled)
  const activeGroups = PORTAL_STATUS_GROUPS.filter(
    (g) => g.key !== "resolved",
  );
  const resolvedGroup = PORTAL_STATUS_GROUPS.find(
    (g) => g.key === "resolved",
  )!;

  // Filtered tickets
  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (!statusMatchesTab(t.status, activeTab)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !t.subject.toLowerCase().includes(q) &&
          !t.number.toLowerCase().includes(q) &&
          !(t.requesterName ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [tickets, activeTab, search]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const tab of TABS) {
      c[tab.key] = tickets.filter((t) => statusMatchesTab(t.status, tab.key)).length;
    }
    return c;
  }, [tickets]);

  // Active total (everything except resolved group)
  const activeTotal = activeGroups.reduce(
    (sum, g) => sum + countForGroup(stats, g),
    0,
  );

  // Status bar segments (active only)
  const statusBarSegments = useMemo(() => {
    if (!stats || activeTotal === 0) return [];
    return activeGroups.map((g) => ({
      group: g,
      count: countForGroup(stats, g),
      pct: (countForGroup(stats, g) / activeTotal) * 100,
    })).filter((s) => s.count > 0);
  }, [stats, activeGroups, activeTotal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{tr("portal.tickets.heading")}</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {tr("portal.tickets.subtitle")}
          </p>
        </div>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-2 h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          {tr("portal.tickets.newButton")}
        </Link>
      </div>

      {/* KPI Cards — active groups prominent, resolved subtle */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {activeGroups.map((group) => {
          const Icon = GROUP_ICONS[group.key] ?? CircleDot;
          const count = countForGroup(stats, group);
          return (
            <button
              key={group.key}
              onClick={() => {
                setActiveTab(group.key as TabKey);
                setSearch("");
              }}
              className={cn(
                "rounded-xl border p-4 text-left transition-all hover:shadow-md",
                activeTab === group.key
                  ? "border-2 shadow-md"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
              style={
                activeTab === group.key
                  ? { borderColor: group.color, backgroundColor: `${group.color}08` }
                  : undefined
              }
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center",
                    group.iconBgClass,
                  )}
                >
                  <Icon className={cn("h-4 w-4", group.textClass)} />
                </div>
                <span className="text-2xl font-bold text-slate-900">
                  {count}
                </span>
              </div>
              <p className={cn("text-[12px] font-medium", group.textClass)}>
                {tr(group.labelKey)}
              </p>
            </button>
          );
        })}
        {/* Resolved — muted card */}
        <button
          onClick={() => {
            setActiveTab("resolved");
            setSearch("");
          }}
          className={cn(
            "rounded-xl border p-4 text-left transition-all",
            activeTab === "resolved"
              ? "border-2 border-slate-300 bg-slate-50 shadow-sm"
              : "border-dashed border-slate-200 bg-slate-50/50 hover:border-slate-300",
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-slate-100">
              <CheckCircle2 className="h-4 w-4 text-slate-400" />
            </div>
            <span className="text-2xl font-bold text-slate-400">
              {countForGroup(stats, resolvedGroup)}
            </span>
          </div>
          <p className="text-[12px] font-medium text-slate-400">
            {tr("portal.tickets.resolvedClosed")}
          </p>
        </button>
      </div>

      {/* Status distribution bar */}
      {statusBarSegments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{tr("portal.tickets.activeDistribution")}</span>
            <span>{tr(activeTotal > 1 ? "portal.tickets.activeCountMany" : "portal.tickets.activeCountSingle", { count: activeTotal })}</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
            {statusBarSegments.map((seg) => (
              <div
                key={seg.group.key}
                className="transition-all duration-500"
                style={{
                  width: `${seg.pct}%`,
                  backgroundColor: seg.group.color,
                  minWidth: seg.count > 0 ? "8px" : 0,
                }}
                title={`${seg.group.label}: ${seg.count}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {statusBarSegments.map((seg) => (
              <div
                key={seg.group.key}
                className="flex items-center gap-1.5 text-[11px] text-slate-500"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: seg.group.color }}
                />
                {tr(seg.group.labelKey)}: {seg.count}
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Priority breakdown (inline, subtle) */}
      {stats && stats.byPriority.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            {tr("portal.tickets.byPriority")}
          </span>
          {PORTAL_PRIORITIES.map((p) => {
            const count =
              stats.byPriority.find((b) => b.priority === p.value)?.count ?? 0;
            if (count === 0) return null;
            return (
              <span
                key={p.value}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
                  p.bgClass,
                  p.textClass,
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {tr(p.labelKey)}: {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Ticket list with tabs */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("portal.tickets.searchPlaceholder")}
              className="h-10 w-full pl-10 pr-4 rounded-lg border border-slate-200 bg-white text-[13px] placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
                tab.key === "resolved" && activeTab !== "resolved" && "text-slate-400",
              )}
            >
              {tr(tab.labelKey)}
              <span className="ml-1.5 text-[11px] tabular-nums text-slate-400">
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Ticket rows */}
      {filtered.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100">
          {filtered.map((t) => {
            const st = STATUS_MAP[t.status] ?? {
              label: t.status,
              labelKey: "",
              bg: "bg-slate-50",
              text: "text-slate-600",
              color: "#94A3B8",
              value: t.status,
            };
            const pr = PRIORITY_MAP[t.priority];
            const isResolved = ["resolved", "closed", "cancelled"].includes(
              t.status,
            );
            return (
              <Link
                key={t.id}
                href={`/portal/tickets/${t.id}`}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 transition-colors",
                  isResolved
                    ? "hover:bg-slate-50/60 opacity-60"
                    : "hover:bg-slate-50/80",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[11px] font-mono text-slate-400">
                      {t.number}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium",
                        st.bg,
                        st.text,
                      )}
                    >
                      {st.labelKey ? tr(st.labelKey) : st.label}
                    </span>
                    {pr && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          pr.bgClass,
                          pr.textClass,
                        )}
                      >
                        {tr(pr.labelKey)}
                      </span>
                    )}
                    {t.assigneeName && (
                      <span className="text-[11px] text-slate-400">
                        → {t.assigneeName}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] font-medium text-slate-900 truncate">
                    {t.subject}
                  </p>
                </div>
                <div className="text-right shrink-0 text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo(t.updatedAt)}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Ticket
            className="h-10 w-10 mx-auto mb-3 text-slate-300"
            strokeWidth={1.5}
          />
          <p className="text-[14px] text-slate-500">
            {tickets.length === 0
              ? tr("portal.tickets.noneYet")
              : tr("portal.tickets.noResults")}
          </p>
        </div>
      )}
    </div>
  );
}
