"use client";

// ============================================================================
// Widget « Bons de travail » — liste détaillée des saisies de temps avec
// description, ticket, technicien, durée, couverture, montant.
//
// Contrairement aux widgets agrégés (KPI, bar, pie, etc.) qui retournent
// une liste {label, value}, ce widget montre les entrées brutes : un
// « bon de travail » par ligne, avec la description du travail effectué.
//
// Supporte :
//   - Filtre période (days, customFrom/customTo)
//   - Filtre organisation (orgContextId, optionnel)
//   - Filtre technicien (agentId, optionnel)
//   - Tri par colonne
//   - Export CSV
//   - Export PDF (via le bouton global Exporter du dashboard)
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock, Loader2, Download, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TIME_TYPE_LABELS, type TimeType } from "@/lib/billing/types";

interface WorkOrderRow {
  id: string;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
  agentId: string;
  agentName: string;
  timeType: string;
  startedAt: string;
  durationMinutes: number;
  description: string;
  coverageStatus: string;
  hourlyRate: number | null;
  amount: number | null;
  isOnsite: boolean;
  hasTravelBilled: boolean;
  travelDurationMinutes: number | null;
  approvalStatus: string;
}

type SortKey = "date" | "ticket" | "agent" | "duration" | "amount";
type SortDir = "asc" | "desc";

interface Props {
  /** Jours glissants. > 0 = [now - N, now]. 0 = pas d'override (customFrom/To). */
  dashboardDays?: number;
  /** Range custom (ISO yyyy-mm-dd). Pris en compte si dashboardDays === 0. */
  customFrom?: string;
  customTo?: string;
  /** Filtre organisation. Null = toutes. */
  orgContextId?: string | null;
  /** Filtre agent (id). */
  agentId?: string | null;
}

const COVERAGE_LABELS: Record<string, string> = {
  billable: "Facturable",
  non_billable: "Non facturable",
  included_in_contract: "Inclus contrat",
  deducted_from_hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque",
  excluded_from_billing: "Exclu",
  internal_time: "Interne",
  travel_billable: "Déplacement facturable",
  travel_non_billable: "Déplacement non facturable",
  msp_overage: "Dépassement forfait",
  pending: "En attente",
};
const COVERAGE_COLORS: Record<string, string> = {
  billable:                "bg-emerald-50 text-emerald-700 ring-emerald-200",
  non_billable:            "bg-slate-100 text-slate-600 ring-slate-200",
  included_in_contract:    "bg-blue-50 text-blue-700 ring-blue-200",
  deducted_from_hour_bank: "bg-violet-50 text-violet-700 ring-violet-200",
  hour_bank_overage:       "bg-amber-50 text-amber-700 ring-amber-200",
  excluded_from_billing:   "bg-slate-50 text-slate-500 ring-slate-200",
  internal_time:           "bg-slate-50 text-slate-600 ring-slate-200",
  travel_billable:         "bg-cyan-50 text-cyan-700 ring-cyan-200",
  travel_non_billable:     "bg-slate-100 text-slate-600 ring-slate-200",
  msp_overage:             "bg-orange-50 text-orange-700 ring-orange-200",
  pending:                 "bg-slate-100 text-slate-500 ring-slate-200",
};

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "2-digit" });
  } catch { return iso; }
}
function fmtMoney(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}
function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function WorkOrdersListWidget({
  dashboardDays = 30, customFrom, customTo, orgContextId, agentId,
}: Props) {
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (orgContextId) params.set("organizationId", orgContextId);
    if (agentId) params.set("agentId", agentId);
    if (dashboardDays > 0) {
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - dashboardDays);
      params.set("from", from.toISOString());
      params.set("to", to.toISOString());
    } else if (customFrom && customTo) {
      const fromDate = new Date(customFrom);
      const toDate = new Date(customTo);
      toDate.setHours(23, 59, 59, 999);
      params.set("from", fromDate.toISOString());
      params.set("to", toDate.toISOString());
    }
    try {
      const r = await fetch(`/api/v1/time-entries?${params.toString()}`);
      if (!r.ok) { setRows([]); return; }
      const data = await r.json();
      if (!Array.isArray(data)) { setRows([]); return; }
      setRows(data.map((e: Record<string, unknown>) => ({
        id: String(e.id),
        ticketId: String(e.ticketId),
        ticketNumber: Number(e.ticketNumber ?? 0),
        ticketSubject: String(e.ticketSubject ?? "—"),
        agentId: String(e.agentId),
        agentName: String(e.agentName ?? "—"),
        timeType: String(e.timeType),
        startedAt: String(e.startedAt),
        durationMinutes: Number(e.durationMinutes ?? 0),
        description: String(e.description ?? ""),
        coverageStatus: String(e.coverageStatus ?? "pending"),
        hourlyRate: (e.hourlyRate as number | null) ?? null,
        amount: (e.amount as number | null) ?? null,
        isOnsite: Boolean(e.isOnsite),
        hasTravelBilled: Boolean(e.hasTravelBilled),
        travelDurationMinutes: (e.travelDurationMinutes as number | null) ?? null,
        approvalStatus: String(e.approvalStatus ?? "draft"),
      })));
    } finally { setLoading(false); }
  }, [dashboardDays, customFrom, customTo, orgContextId, agentId]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const out = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      switch (sortKey) {
        case "date":     return (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0) * dir;
        case "ticket":   return (a.ticketNumber - b.ticketNumber) * dir;
        case "agent":    return a.agentName.localeCompare(b.agentName) * dir;
        case "duration": return (a.durationMinutes - b.durationMinutes) * dir;
        case "amount":   return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      }
    });
    return out;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  }

  function exportCsv() {
    const header = ["Date", "Ticket #", "Sujet ticket", "Technicien", "Type", "Durée (min)", "Description", "Couverture", "Montant", "Sur place", "Déplacement facturé", "Trajet (min)"];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of sorted) {
      lines.push([
        fmtDate(r.startedAt),
        `#${r.ticketNumber}`,
        r.ticketSubject,
        r.agentName,
        TIME_TYPE_LABELS[r.timeType as TimeType] ?? r.timeType,
        String(r.durationMinutes),
        r.description,
        COVERAGE_LABELS[r.coverageStatus] ?? r.coverageStatus,
        r.amount != null ? r.amount.toFixed(2) : "",
        r.isOnsite ? "Oui" : "",
        r.hasTravelBilled ? "Oui" : "",
        r.travelDurationMinutes != null ? String(r.travelDurationMinutes) : "",
      ].map(csvEscape).join(","));
    }
    const csv = "﻿" + lines.join("\n"); // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `bons-de-travail-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const totalMinutes = sorted.reduce((s, r) => s + r.durationMinutes, 0);
  const totalAmount = sorted.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Bons de travail
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {loading
                ? "Chargement…"
                : `${sorted.length} entrée${sorted.length > 1 ? "s" : ""} · ${fmtDuration(totalMinutes)} · ${fmtMoney(totalAmount)}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={loading || sorted.length === 0}
            className="print-export-hide"
            title="Export CSV — pour PDF, utilise le bouton Exporter du dashboard."
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-slate-500">
            Aucun bon de travail sur la période sélectionnée.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50/70">
                <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                  <HeaderCell label="Date" sortKey="date" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <HeaderCell label="Ticket" sortKey="ticket" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="px-2.5 py-2">Sujet</th>
                  <th className="px-2.5 py-2">Description</th>
                  <HeaderCell label="Technicien" sortKey="agent" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="px-2.5 py-2">Type</th>
                  <HeaderCell label="Durée" sortKey="duration" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <th className="px-2.5 py-2">Couverture</th>
                  <HeaderCell label="Montant" sortKey="amount" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <th className="px-2.5 py-2 print-export-hide" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {sorted.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors align-top">
                    <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{fmtDate(r.startedAt)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <Link href={`/tickets/${r.ticketId}`} className="text-blue-600 hover:text-blue-700 font-medium tabular-nums">
                        #{r.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-2.5 py-2 text-slate-700 max-w-[240px]">
                      <div className="line-clamp-2">{r.ticketSubject}</div>
                    </td>
                    <td className="px-2.5 py-2 text-slate-600 max-w-[360px]">
                      <div className="line-clamp-3 leading-snug">{r.description || <span className="italic text-slate-400">—</span>}</div>
                      {r.isOnsite || r.hasTravelBilled ? (
                        <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                          {r.isOnsite && <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-1.5 py-0 text-[9.5px]">Sur place</span>}
                          {r.hasTravelBilled && (
                            <span className="inline-flex items-center rounded-full bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 px-1.5 py-0 text-[9.5px]">
                              Déplacement{r.travelDurationMinutes != null ? ` · ${r.travelDurationMinutes} min` : ""}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.agentName}</td>
                    <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">
                      {TIME_TYPE_LABELS[r.timeType as TimeType] ?? r.timeType}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">
                      {fmtDuration(r.durationMinutes)}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0 text-[10px] font-medium ring-1 ring-inset",
                          COVERAGE_COLORS[r.coverageStatus] ?? "bg-slate-100 text-slate-600 ring-slate-200",
                        )}
                      >
                        {COVERAGE_LABELS[r.coverageStatus] ?? r.coverageStatus}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-800 whitespace-nowrap">
                      {fmtMoney(r.amount)}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap print-export-hide">
                      <Link
                        href={`/tickets/${r.ticketId}`}
                        className="text-slate-400 hover:text-blue-600 inline-flex"
                        title="Ouvrir le ticket"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HeaderCell({
  label, sortKey, active, dir, onClick, align,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "right";
}) {
  const isActive = active === sortKey;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn("px-2.5 py-2", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          align === "right" ? "ml-auto" : "",
          isActive ? "text-blue-700" : "text-slate-500 hover:text-slate-800",
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}
