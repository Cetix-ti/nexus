"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bug, Filter, Check } from "lucide-react";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type BugStatus = "NEW" | "TRIAGED" | "APPROVED_FOR_FIX" | "FIX_IN_PROGRESS" | "FIX_PROPOSED" | "FIXED" | "REJECTED" | "DUPLICATE";

interface BugRow {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: BugStatus;
  contextUrl: string | null;
  createdAt: string;
  reporter: { firstName: string; lastName: string } | null;
  assignedTo: { firstName: string; lastName: string } | null;
  _count: { comments: number; fixAttempts: number };
}

const SEVERITY_COLORS: Record<Severity, string> = {
  LOW: "bg-slate-100 text-slate-700 ring-slate-200",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-200",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
  CRITICAL: "bg-red-50 text-red-700 ring-red-200",
};
const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Mineur", MEDIUM: "Moyen", HIGH: "Majeur", CRITICAL: "Critique" };

const STATUS_COLORS: Record<BugStatus, string> = {
  NEW: "bg-violet-50 text-violet-700 ring-violet-200",
  TRIAGED: "bg-slate-100 text-slate-700 ring-slate-200",
  APPROVED_FOR_FIX: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FIX_IN_PROGRESS: "bg-blue-50 text-blue-700 ring-blue-200",
  FIX_PROPOSED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  FIXED: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
  DUPLICATE: "bg-slate-50 text-slate-500 ring-slate-200",
};
const STATUS_LABEL: Record<BugStatus, string> = {
  NEW: "Nouveau",
  TRIAGED: "Trié",
  APPROVED_FOR_FIX: "Approuvé",
  FIX_IN_PROGRESS: "Fix en cours",
  FIX_PROPOSED: "PR proposée",
  FIXED: "Fixé",
  REJECTED: "Rejeté",
  DUPLICATE: "Doublon",
};

export default function BugsAdminPage() {
  const [bugs, setBugs] = useState<BugRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<BugStatus | "">("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "">("");
  const [approvingAll, setApprovingAll] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (severityFilter) params.set("severity", severityFilter);
    const r = await fetch(`/api/v1/bugs?${params.toString()}`);
    if (r.ok) setBugs(await r.json());
    else setBugs([]);
  }

  useEffect(() => { void load(); }, [statusFilter, severityFilter]);

  const pendingApprovalCount = useMemo(
    () => (bugs ?? []).filter((b) => b.status === "NEW" || b.status === "TRIAGED" || b.status === "REJECTED").length,
    [bugs],
  );

  async function approveAll() {
    if (pendingApprovalCount === 0) return;
    if (!confirm(`Approuver ${pendingApprovalCount} bug(s) en attente pour auto-fix ?\nCela inclut tous les bugs Nouveau, Trié et Rejeté (réapprouvés).`)) return;
    setApprovingAll(true);
    try {
      const r = await fetch(`/api/v1/bugs/approve-all`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(`Erreur : ${err.error ?? `HTTP ${r.status}`}`);
        return;
      }
      await load();
    } finally {
      setApprovingAll(false);
    }
  }

  const counts = useMemo(() => {
    if (!bugs) return null;
    const c = { NEW: 0, APPROVED_FOR_FIX: 0, FIX_PROPOSED: 0 };
    for (const b of bugs) {
      if (b.status === "NEW") c.NEW++;
      if (b.status === "APPROVED_FOR_FIX") c.APPROVED_FOR_FIX++;
      if (b.status === "FIX_PROPOSED") c.FIX_PROPOSED++;
    }
    return c;
  }, [bugs]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900 inline-flex items-center gap-2">
            <Bug className="h-5 w-5 text-amber-600" /> Bug reports
          </h1>
          <p className="text-[12.5px] text-slate-500">
            Signalements in-app avec workflow d&apos;auto-fix nocturne par Claude.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {counts && (
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              <span className="rounded bg-violet-50 text-violet-700 px-2 py-1">{counts.NEW} nouveau(x)</span>
              <span className="rounded bg-emerald-50 text-emerald-700 px-2 py-1">{counts.APPROVED_FOR_FIX} en attente</span>
              <span className="rounded bg-indigo-50 text-indigo-700 px-2 py-1">{counts.FIX_PROPOSED} PR à merger</span>
            </div>
          )}
          {pendingApprovalCount > 0 && (
            <button
              type="button"
              onClick={approveAll}
              disabled={approvingAll}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[12px] font-medium px-3 py-1.5 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              {approvingAll ? "Approbation…" : `Approuver tous (${pendingApprovalCount})`}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BugStatus | "")}
          className="rounded border border-slate-300 px-2 py-1 text-[13px]"
        >
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_LABEL) as BugStatus[]).map((s) =>
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          )}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | "")}
          className="rounded border border-slate-300 px-2 py-1 text-[13px]"
        >
          <option value="">Toutes sévérités</option>
          {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) =>
            <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
          )}
        </select>
      </div>

      {bugs === null ? (
        <div className="p-6 text-sm text-slate-500">Chargement…</div>
      ) : bugs.length === 0 ? (
        <div className="p-6 rounded border border-slate-200 bg-white text-sm text-slate-500 text-center">
          Aucun bug avec ces filtres.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {bugs.map((b) => (
            <Link
              key={b.id}
              href={`/admin/bugs/${b.id}`}
              className="block rounded border border-slate-200 bg-white hover:border-slate-300 transition-colors p-3 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${SEVERITY_COLORS[b.severity]}`}>
                      {SEVERITY_LABEL[b.severity]}
                    </span>
                    <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABEL[b.status]}
                    </span>
                    {b._count.fixAttempts > 0 && (
                      <span className="text-[10.5px] rounded px-1.5 py-0.5 bg-slate-100 text-slate-600">
                        {b._count.fixAttempts} tentative{b._count.fixAttempts > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <h3 className="text-[14px] font-semibold text-slate-900 break-words">{b.title}</h3>
                  <p className="text-[12.5px] text-slate-600 line-clamp-2 mt-0.5 break-words">{b.description}</p>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{b.reporter ? `${b.reporter.firstName} ${b.reporter.lastName}` : "Inconnu"}</span>
                    <span>·</span>
                    <span>{new Date(b.createdAt).toLocaleDateString("fr-CA")}</span>
                    {b.contextUrl && (
                      <>
                        <span>·</span>
                        <span className="font-mono truncate max-w-[240px]">{b.contextUrl}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
