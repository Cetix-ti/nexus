"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Ticket,
  Plus,
  Monitor,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalUser } from "@/lib/portal/use-portal-user";
import { useLocaleStore } from "@/stores/locale-store";

interface DashboardData {
  stats: {
    totalTickets: number;
    openTickets: number;
    resolvedTickets: number;
    assetCount: number;
  };
  recentTickets: {
    id: string;
    number: string;
    subject: string;
    status: string;
    priority: string;
    updatedAt: string;
    createdAt: string;
    /** Champs nécessaires pour l'overlay statut "En attente d'approbation". */
    requiresApproval?: boolean;
    approvalStatus?: string;
    approvalLockOverride?: boolean;
  }[];
  userName: string;
  organizationName: string;
  portalRole: string;
}

const STATUS_STYLES: Record<string, { labelKey: string; bg: string; text: string }> = {
  new: { labelKey: "portal.status.new", bg: "bg-blue-50", text: "text-blue-700" },
  open: { labelKey: "portal.status.open", bg: "bg-sky-50", text: "text-sky-700" },
  in_progress: { labelKey: "portal.status.in_progress", bg: "bg-amber-50", text: "text-amber-700" },
  waiting_client: { labelKey: "portal.status.waiting_client", bg: "bg-violet-50", text: "text-violet-700" },
  on_site: { labelKey: "portal.status.on_site", bg: "bg-cyan-50", text: "text-cyan-700" },
  resolved: { labelKey: "portal.status.resolved", bg: "bg-emerald-50", text: "text-emerald-700" },
  closed: { labelKey: "portal.status.closed", bg: "bg-slate-100", text: "text-slate-600" },
};

function useTimeAgo() {
  const t = useLocaleStore((s) => s.t);
  return (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("portal.home.timeNow");
    if (mins < 60) return t("portal.home.timeMinsAgo", { mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("portal.home.timeHoursAgo", { hours });
    return t("portal.home.timeDaysAgo", { days: Math.floor(hours / 24) });
  };
}

export default function PortalHomePage() {
  const { user, organizationName } = usePortalUser();
  const t = useLocaleStore((s) => s.t);
  const timeAgo = useTimeAgo();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/v1/portal/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch pending approvals
    fetch("/api/v1/portal/approvals")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setPendingApprovals((d.data || []).filter((a: any) => a.status === "PENDING")))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const greeting = user?.firstName
    ? t("portal.home.greetingNamed", { name: user.firstName })
    : t("portal.home.greetingDefault");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{greeting}</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          {t("portal.home.subtitle", { org: organizationName || t("portal.home.orgPlaceholder") })}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/portal/tickets/new"
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-slate-900">
              {t("portal.home.submitTicket")}
            </p>
            <p className="text-[12px] text-slate-500">
              {t("portal.home.submitTicketSubtitle")}
            </p>
          </div>
        </Link>
        <Link
          href="/portal/tickets"
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="h-11 w-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 group-hover:bg-violet-100 transition-colors">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-slate-900">
              {t("portal.home.myTickets")}
            </p>
            <p className="text-[12px] text-slate-500">
              {t("portal.home.myTicketsSubtitle")}
            </p>
          </div>
        </Link>
        <Link
          href="/portal/assets"
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-slate-900">
              {t("portal.home.myAssets")}
            </p>
            <p className="text-[12px] text-slate-500">
              {t("portal.home.myAssetsSubtitle")}
            </p>
          </div>
        </Link>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label={t("portal.home.openTickets")}
            value={data.stats.openTickets}
            icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
            bg="bg-amber-50"
          />
          <StatCard
            label={t("portal.home.totalTickets")}
            value={data.stats.totalTickets}
            icon={<Ticket className="h-5 w-5 text-blue-600" />}
            bg="bg-blue-50"
          />
          <StatCard
            label={t("portal.home.resolved")}
            value={data.stats.resolvedTickets}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            bg="bg-emerald-50"
          />
          <StatCard
            label={t("portal.home.assets")}
            value={data.stats.assetCount}
            icon={<Monitor className="h-5 w-5 text-violet-600" />}
            bg="bg-violet-50"
          />
        </div>
      )}

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <h2 className="text-[16px] font-semibold text-slate-900">
              {t("portal.home.pendingApprovals")}
            </h2>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">
              {pendingApprovals.length}
            </span>
          </div>
          <div className="space-y-3">
            {pendingApprovals.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono text-slate-400">
                        {a.ticket?.displayNumber}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-700">
                        {t("portal.home.pendingApprovalBadge")}
                      </span>
                    </div>
                    <p className="text-[14px] font-medium text-slate-900 mb-1">
                      {a.ticket?.subject}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {t("portal.home.requester")} : {a.ticket?.requesterName} — {a.ticket?.organizationName}
                    </p>
                    {a.ticket?.description && (
                      <p className="text-[12px] text-slate-400 mt-1 line-clamp-2">
                        {a.ticket.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        const res = await fetch("/api/v1/portal/approvals", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ approvalId: a.id, decision: "APPROVED" }),
                        });
                        if (res.ok) setPendingApprovals((prev) => prev.filter((x) => x.id !== a.id));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {t("portal.home.approve")}
                    </button>
                    <button
                      onClick={async () => {
                        const reason = prompt(t("portal.home.rejectReasonPrompt"));
                        const res = await fetch("/api/v1/portal/approvals", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ approvalId: a.id, decision: "REJECTED", comment: reason }),
                        });
                        if (res.ok) setPendingApprovals((prev) => prev.filter((x) => x.id !== a.id));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      {t("portal.home.reject")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent tickets */}
      {data && data.recentTickets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-semibold text-slate-900">
              {t("portal.home.recentTickets")}
            </h2>
            <Link
              href="/portal/tickets"
              className="text-[13px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              {t("portal.home.seeAll")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {data.recentTickets.map((ticket) => {
                // Overlay statut "En attente d'approbation" (cohérent
                // avec /portal/tickets et /portal/tickets/[id]).
                const isPending =
                  !!ticket.requiresApproval &&
                  String(ticket.approvalStatus ?? "").toLowerCase() === "pending" &&
                  !ticket.approvalLockOverride;
                const st = isPending
                  ? {
                      labelKey: "",
                      label: "En attente d'approbation",
                      bg: "bg-amber-100",
                      text: "text-amber-900",
                    }
                  : STATUS_STYLES[ticket.status] ?? STATUS_STYLES.open;
                return (
                  <Link
                    key={ticket.id}
                    href={`/portal/tickets/${ticket.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono text-slate-400">
                          {ticket.number}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-medium",
                            st.bg,
                            st.text,
                          )}
                        >
                          {st.labelKey ? t(st.labelKey) : (st as { label?: string }).label ?? ""}
                        </span>
                      </div>
                      <p className="text-[14px] font-medium text-slate-900 truncate">
                        {ticket.subject}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(ticket.updatedAt)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {data && data.recentTickets.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Ticket className="h-10 w-10 mx-auto mb-3 text-slate-300" strokeWidth={1.5} />
          <p className="text-[14px] text-slate-500">
            {t("portal.home.noTickets")}
          </p>
          <Link
            href="/portal/tickets/new"
            className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("portal.home.submitFirstTicket")}
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center",
            bg,
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-[22px] font-bold text-slate-900 tabular-nums">
            {value}
          </p>
          <p className="text-[12px] text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
