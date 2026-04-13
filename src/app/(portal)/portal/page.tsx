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
  }[];
  userName: string;
  organizationName: string;
  portalRole: string;
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: "Nouveau", bg: "bg-blue-50", text: "text-blue-700" },
  open: { label: "Ouvert", bg: "bg-sky-50", text: "text-sky-700" },
  in_progress: { label: "En cours", bg: "bg-amber-50", text: "text-amber-700" },
  waiting_client: { label: "En attente", bg: "bg-violet-50", text: "text-violet-700" },
  on_site: { label: "Sur place", bg: "bg-cyan-50", text: "text-cyan-700" },
  resolved: { label: "Résolu", bg: "bg-emerald-50", text: "text-emerald-700" },
  closed: { label: "Fermé", bg: "bg-slate-100", text: "text-slate-600" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${Math.floor(hours / 24)}j`;
}

export default function PortalHomePage() {
  const { user, organizationName } = usePortalUser();
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
    ? `Bonjour, ${user.firstName}`
    : "Bienvenue";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{greeting}</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          Portail client — {organizationName || "Votre organisation"}
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
              Soumettre un billet
            </p>
            <p className="text-[12px] text-slate-500">
              Créer une nouvelle demande
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
              Mes billets
            </p>
            <p className="text-[12px] text-slate-500">
              Suivre l&apos;avancement
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
              Mes actifs
            </p>
            <p className="text-[12px] text-slate-500">
              Équipements assignés
            </p>
          </div>
        </Link>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Billets ouverts"
            value={data.stats.openTickets}
            icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
            bg="bg-amber-50"
          />
          <StatCard
            label="Total billets"
            value={data.stats.totalTickets}
            icon={<Ticket className="h-5 w-5 text-blue-600" />}
            bg="bg-blue-50"
          />
          <StatCard
            label="Résolus"
            value={data.stats.resolvedTickets}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            bg="bg-emerald-50"
          />
          <StatCard
            label="Actifs"
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
              Approbations en attente
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
                        En attente d&apos;approbation
                      </span>
                    </div>
                    <p className="text-[14px] font-medium text-slate-900 mb-1">
                      {a.ticket?.subject}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      Demandeur : {a.ticket?.requesterName} — {a.ticket?.organizationName}
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
                      Approuver
                    </button>
                    <button
                      onClick={async () => {
                        const reason = prompt("Raison du refus (optionnel) :");
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
                      Refuser
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
              Billets récents
            </h2>
            <Link
              href="/portal/tickets"
              className="text-[13px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              Voir tout
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {data.recentTickets.map((t) => {
                const st = STATUS_STYLES[t.status] ?? STATUS_STYLES.open;
                return (
                  <Link
                    key={t.id}
                    href={`/portal/tickets/${t.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
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
                          {st.label}
                        </span>
                      </div>
                      <p className="text-[14px] font-medium text-slate-900 truncate">
                        {t.subject}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(t.updatedAt)}
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
            Aucun billet pour le moment.
          </p>
          <Link
            href="/portal/tickets/new"
            className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Soumettre votre premier billet
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
