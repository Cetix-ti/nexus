"use client";

// Historique d'activité pour une organisation : saisies de temps + tickets.
// Deux vues, toggle, filtres, pagination. Embedded dans l'onglet Rapports.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Ticket as TicketIcon, Filter, RefreshCw, ExternalLink, Search, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";

type Tab = "time" | "tickets";

interface TimeEntryRow {
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
  isOnsite: boolean;
  hasTravelBilled: boolean;
  isAfterHours: boolean;
  isWeekend: boolean;
  coverageStatus: string;
  hourlyRate: number | null;
  amount: number | null;
  approvalStatus: string;
}

interface TicketRow {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  type: string;
  createdAt: string;
  resolvedAt: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  requester?: { id: string; firstName: string; lastName: string } | null;
}

// --- Helpers de formatage -----------------------------------------------
const STATUS_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  OPEN: "Ouvert",
  IN_PROGRESS: "En cours",
  ON_SITE: "Sur place",
  PENDING: "En attente",
  WAITING_CLIENT: "Attente client",
  WAITING_VENDOR: "Attente fournisseur",
  SCHEDULED: "Planifié",
  RESOLVED: "Résolu",
  CLOSED: "Fermé",
  CANCELLED: "Annulé",
};
const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-violet-50 text-violet-700 ring-violet-200",
  OPEN: "bg-blue-50 text-blue-700 ring-blue-200",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  ON_SITE: "bg-amber-50 text-amber-700 ring-amber-200",
  PENDING: "bg-slate-100 text-slate-600 ring-slate-200",
  WAITING_CLIENT: "bg-slate-100 text-slate-600 ring-slate-200",
  WAITING_VENDOR: "bg-slate-100 text-slate-600 ring-slate-200",
  SCHEDULED: "bg-sky-50 text-sky-700 ring-sky-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-slate-50 text-slate-500 ring-slate-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-200",
};
const PRIORITY_LABEL: Record<string, string> = { LOW: "Faible", MEDIUM: "Moyenne", HIGH: "Haute", CRITICAL: "Critique" };
const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH: "bg-orange-50 text-orange-700",
  CRITICAL: "bg-red-50 text-red-700",
};
const TIME_TYPE_LABEL: Record<string, string> = {
  remote_work: "À distance",
  onsite_work: "Sur place",
  travel: "Déplacement",
  preparation: "Préparation",
  administration: "Administration",
  waiting: "Attente",
  follow_up: "Suivi",
  internal: "Interne",
  other: "Autre",
};
const COVERAGE_LABEL: Record<string, string> = {
  billable: "Facturable",
  non_billable: "Non facturable",
  included_in_contract: "Inclus contrat",
  deducted_from_hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque",
  excluded_from_billing: "Exclu",
  internal_time: "Interne",
  travel_billable: "Déplacement fact.",
  travel_non_billable: "Déplacement n.f.",
  msp_overage: "Hors forfait",
  pending: "En attente",
};

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("fr-CA"); } catch { return iso; }
}
function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
}
function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}` : `${m}min`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  try { return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(n); }
  catch { return `${n.toFixed(2)} $`; }
}

// --- Sort helpers --------------------------------------------------------
type SortDir = "asc" | "desc";
interface SortState<K extends string> { key: K; dir: SortDir }

function applySort<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessor: (row: T, key: K) => unknown,
): T[] {
  const arr = [...rows];
  arr.sort((a, b) => {
    const va = accessor(a, sort.key);
    const vb = accessor(b, sort.key);
    let cmp = 0;
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = -1;
    else if (vb == null) cmp = 1;
    else if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), "fr", { numeric: true });
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return arr;
}

// --- CSV export helpers --------------------------------------------------
function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, headers: Array<{ key: string; label: string }>) {
  const lines = [headers.map((h) => escapeCsv(h.label)).join(";")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h.key])).join(";"));
  }
  const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Date range helpers --------------------------------------------------
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
type DatePreset = "last_30" | "last_90" | "this_month" | "last_month" | "this_quarter" | "this_year" | "all" | "custom";
function rangeForPreset(p: DatePreset): { from: string | null; to: string | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (p) {
    case "last_30": { const s = new Date(today); s.setDate(s.getDate() - 29); return { from: toISODate(s), to: toISODate(today) }; }
    case "last_90": { const s = new Date(today); s.setDate(s.getDate() - 89); return { from: toISODate(s), to: toISODate(today) }; }
    case "this_month": return { from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)), to: toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    case "last_month": { const first = new Date(today.getFullYear(), today.getMonth() - 1, 1); const last = new Date(today.getFullYear(), today.getMonth(), 0); return { from: toISODate(first), to: toISODate(last) }; }
    case "this_quarter": { const q = Math.floor(today.getMonth() / 3); return { from: toISODate(new Date(today.getFullYear(), q * 3, 1)), to: toISODate(new Date(today.getFullYear(), q * 3 + 3, 0)) }; }
    case "this_year": return { from: toISODate(new Date(today.getFullYear(), 0, 1)), to: toISODate(new Date(today.getFullYear(), 11, 31)) };
    case "all": return { from: null, to: null };
    case "custom":
    default: return { from: null, to: null };
  }
}

// ============================================================================
// Main component
// ============================================================================
export function OrgHistorySection({ organizationId }: { organizationId: string }) {
  const [tab, setTab] = useState<Tab>("time");

  return (
    <Card>
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Historique d&apos;activité</h3>
            <p className="text-[12px] text-slate-500">Saisies de temps et demandes du client — filtrables.</p>
          </div>
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-[12px]">
            <button
              onClick={() => setTab("time")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${tab === "time" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Clock className="h-3.5 w-3.5" /> Saisies de temps
            </button>
            <button
              onClick={() => setTab("tickets")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${tab === "tickets" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
            >
              <TicketIcon className="h-3.5 w-3.5" /> Demandes
            </button>
          </div>
        </div>

        {tab === "time" ? (
          <TimeEntriesList organizationId={organizationId} />
        ) : (
          <TicketsList organizationId={organizationId} />
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Time entries list
// ============================================================================
type TimeSortKey = "date" | "agent" | "ticket" | "type" | "duration" | "coverage" | "amount";

function TimeEntriesList({ organizationId }: { organizationId: string }) {
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [coverageFilter, setCoverageFilter] = useState<string>("");
  const [travelOnly, setTravelOnly] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [rows, setRows] = useState<TimeEntryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState<TimeSortKey>>({ key: "date", dir: "desc" });
  const pageSize = 25;

  function toggleSort(key: TimeSortKey) {
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "date" || key === "amount" || key === "duration" ? "desc" : "asc" });
    setPage(0);
  }

  useEffect(() => {
    if (preset !== "custom") {
      const r = rangeForPreset(preset);
      setFrom(r.from ?? "");
      setTo(r.to ?? "");
    }
  }, [preset]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ organizationId });
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
    fetch(`/api/v1/time-entries?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [organizationId, from, to]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    let x = rows;
    if (coverageFilter) x = x.filter((r) => r.coverageStatus === coverageFilter);
    if (travelOnly) x = x.filter((r) => r.hasTravelBilled);
    if (agentFilter) {
      const s = agentFilter.toLowerCase();
      x = x.filter((r) => r.agentName.toLowerCase().includes(s));
    }
    return applySort(x, sort, (r, key) => {
      switch (key) {
        case "date": return r.startedAt;
        case "agent": return r.agentName;
        case "ticket": return r.ticketNumber;
        case "type": return TIME_TYPE_LABEL[r.timeType] ?? r.timeType;
        case "duration": return r.durationMinutes;
        case "coverage": return COVERAGE_LABEL[r.coverageStatus] ?? r.coverageStatus;
        case "amount": return r.amount ?? 0;
      }
    });
  }, [rows, coverageFilter, travelOnly, agentFilter, sort]);

  const paged = filtered ? filtered.slice(page * pageSize, (page + 1) * pageSize) : null;
  const totalPages = filtered ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const totalMinutes = filtered?.reduce((s, r) => s + r.durationMinutes, 0) ?? 0;
  const totalAmount = filtered?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0;

  function exportCsv() {
    if (!filtered || filtered.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `saisies-temps-${today}.csv`,
      filtered.map((r) => ({
        date: fmtDateTime(r.startedAt),
        technicien: r.agentName,
        ticket: `#${r.ticketNumber}`,
        sujet: r.ticketSubject,
        type: TIME_TYPE_LABEL[r.timeType] ?? r.timeType,
        duree_h: (r.durationMinutes / 60).toFixed(2),
        duree_minutes: r.durationMinutes,
        couverture: COVERAGE_LABEL[r.coverageStatus] ?? r.coverageStatus,
        deplacement: r.hasTravelBilled ? "Oui" : "Non",
        sur_place: r.isOnsite ? "Oui" : "Non",
        hors_heures: r.isAfterHours ? "Oui" : "Non",
        weekend: r.isWeekend ? "Oui" : "Non",
        taux_horaire: r.hourlyRate ?? "",
        montant: r.amount ?? "",
        statut_approbation: r.approvalStatus,
        description: r.description,
      })),
      [
        { key: "date", label: "Date" },
        { key: "technicien", label: "Technicien" },
        { key: "ticket", label: "Ticket" },
        { key: "sujet", label: "Sujet" },
        { key: "type", label: "Type" },
        { key: "duree_h", label: "Durée (h)" },
        { key: "duree_minutes", label: "Durée (min)" },
        { key: "couverture", label: "Couverture" },
        { key: "deplacement", label: "Déplacement" },
        { key: "sur_place", label: "Sur place" },
        { key: "hors_heures", label: "Hors heures" },
        { key: "weekend", label: "Weekend" },
        { key: "taux_horaire", label: "Taux horaire" },
        { key: "montant", label: "Montant" },
        { key: "statut_approbation", label: "Statut approbation" },
        { key: "description", label: "Description" },
      ],
    );
  }

  return (
    <div className="space-y-2.5">
      <FilterBar>
        <PresetSelect value={preset} onChange={(v) => { setPreset(v); setPage(0); }} />
        {preset === "custom" && (
          <>
            <DateInput label="Du" value={from} onChange={(v) => { setFrom(v); setPage(0); }} />
            <DateInput label="Au" value={to} onChange={(v) => { setTo(v); setPage(0); }} />
          </>
        )}
        <FilterSelect
          label="Couverture"
          value={coverageFilter}
          onChange={(v) => { setCoverageFilter(v); setPage(0); }}
          options={[
            { value: "", label: "Toutes" },
            ...Object.entries(COVERAGE_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
        <FilterText
          label="Technicien"
          value={agentFilter}
          onChange={(v) => { setAgentFilter(v); setPage(0); }}
          placeholder="Nom…"
        />
        <FilterCheckbox label="Déplacement" checked={travelOnly} onChange={(v) => { setTravelOnly(v); setPage(0); }} />
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={exportCsv}
            disabled={!filtered || filtered.length === 0}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Exporter en CSV"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50"
            title="Rafraîchir"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </FilterBar>

      {/* Résumé totaux */}
      <div className="flex items-center gap-4 flex-wrap text-[11.5px] text-slate-600 pb-1">
        <span>{filtered?.length ?? 0} saisies</span>
        <span>·</span>
        <span>Total : <strong className="text-slate-900">{fmtHours(totalMinutes)}</strong></span>
        {totalAmount > 0 && (
          <>
            <span>·</span>
            <span>Valeur : <strong className="text-slate-900">{fmtMoney(totalAmount)}</strong></span>
          </>
        )}
      </div>

      {loading || paged === null ? (
        <div className="py-6 text-center text-[12px] text-slate-500">Chargement…</div>
      ) : paged.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-slate-500 border border-dashed border-slate-200 rounded">Aucune saisie dans la période.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                <tr>
                  <SortTh label="Date" sortKey="date" current={sort} onClick={toggleSort} />
                  <SortTh label="Technicien" sortKey="agent" current={sort} onClick={toggleSort} />
                  <SortTh label="Ticket" sortKey="ticket" current={sort} onClick={toggleSort} />
                  <SortTh label="Type" sortKey="type" current={sort} onClick={toggleSort} />
                  <SortTh label="Durée" sortKey="duration" current={sort} onClick={toggleSort} align="right" />
                  <SortTh label="Couverture" sortKey="coverage" current={sort} onClick={toggleSort} />
                  <SortTh label="Montant" sortKey="amount" current={sort} onClick={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">{fmtDateTime(r.startedAt)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">{r.agentName}</td>
                    <td className="px-2 py-1.5">
                      <Link href={`/tickets/${r.ticketId}`} className="text-blue-600 hover:underline">
                        #{r.ticketNumber}
                      </Link>
                      <span className="text-slate-600 ml-1 truncate inline-block max-w-[280px] align-middle">{r.ticketSubject}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1">
                        {TIME_TYPE_LABEL[r.timeType] ?? r.timeType}
                        {r.hasTravelBilled && <span className="text-[9.5px] rounded bg-amber-50 text-amber-700 px-1 py-0.5">🚗</span>}
                        {r.isOnsite && <span className="text-[9.5px] rounded bg-blue-50 text-blue-700 px-1 py-0.5">sur place</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtHours(r.durationMinutes)}</td>
                    <td className="px-2 py-1.5">
                      <span className="text-[10.5px] text-slate-600">{COVERAGE_LABEL[r.coverageStatus] ?? r.coverageStatus}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{fmtMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {paged.map((r) => (
              <div key={r.id} className="rounded border border-slate-200 p-2.5 text-[12px]">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{fmtDate(r.startedAt)} · {r.agentName}</div>
                    <Link href={`/tickets/${r.ticketId}`} className="text-blue-600 hover:underline text-[11.5px]">
                      #{r.ticketNumber} {r.ticketSubject}
                    </Link>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-slate-900">{fmtHours(r.durationMinutes)}</div>
                    <div className="text-[11px] text-slate-600">{fmtMoney(r.amount)}</div>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1 flex-wrap text-[10.5px]">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{TIME_TYPE_LABEL[r.timeType] ?? r.timeType}</span>
                  <span className="rounded bg-slate-50 px-1.5 py-0.5 text-slate-600">{COVERAGE_LABEL[r.coverageStatus] ?? r.coverageStatus}</span>
                  {r.hasTravelBilled && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">🚗 déplacement</span>}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Tickets list
// ============================================================================
type TicketSortKey = "created" | "number" | "subject" | "status" | "priority" | "resolved";

function TicketsList({ organizationId }: { organizationId: string }) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState<TicketSortKey>>({ key: "created", dir: "desc" });
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const pageSize = 25;

  function toggleSort(key: TicketSortKey) {
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "created" || key === "resolved" || key === "number" ? "desc" : "asc" });
    setPage(0);
  }

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ organizationId, limit: "500" });
    if (statusFilter) params.set("status", statusFilter);
    if (search.trim()) params.set("q", search.trim());
    fetch(`/api/v1/tickets?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [organizationId, statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    let x = rows;
    if (priorityFilter) x = x.filter((t) => t.priority === priorityFilter);
    const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return applySort(x, sort, (t, key) => {
      switch (key) {
        case "created": return t.createdAt;
        case "number": return t.number;
        case "subject": return t.subject;
        case "status": return t.status;
        case "priority": return PRIORITY_RANK[t.priority] ?? 0;
        case "resolved": return t.resolvedAt ?? "";
      }
    });
  }, [rows, priorityFilter, sort]);

  const paged = filtered ? filtered.slice(page * pageSize, (page + 1) * pageSize) : null;
  const totalPages = filtered ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;

  function exportCsv() {
    if (!filtered || filtered.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `tickets-${today}.csv`,
      filtered.map((t) => ({
        numero: t.number,
        sujet: t.subject,
        statut: STATUS_LABEL[t.status] ?? t.status,
        priorite: PRIORITY_LABEL[t.priority] ?? t.priority,
        type: t.type,
        cree_le: fmtDate(t.createdAt),
        resolu_le: t.resolvedAt ? fmtDate(t.resolvedAt) : "",
        assigne: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim() : "",
        demandeur: t.requester ? `${t.requester.firstName} ${t.requester.lastName}`.trim() : "",
      })),
      [
        { key: "numero", label: "Numéro" },
        { key: "sujet", label: "Sujet" },
        { key: "statut", label: "Statut" },
        { key: "priorite", label: "Priorité" },
        { key: "type", label: "Type" },
        { key: "cree_le", label: "Créé le" },
        { key: "resolu_le", label: "Résolu le" },
        { key: "assigne", label: "Assigné à" },
        { key: "demandeur", label: "Demandeur" },
      ],
    );
  }

  return (
    <div className="space-y-2.5">
      <FilterBar>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Rechercher…"
            className="w-full rounded border border-slate-300 pl-6 pr-2 py-1 text-[11.5px] focus:border-blue-500 focus:outline-none"
          />
        </div>
        <FilterSelect
          label="Statut"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(0); }}
          options={[
            { value: "", label: "Tous" },
            ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
        <FilterSelect
          label="Priorité"
          value={priorityFilter}
          onChange={(v) => { setPriorityFilter(v); setPage(0); }}
          options={[
            { value: "", label: "Toutes" },
            ...Object.entries(PRIORITY_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
        />
        <div className="ml-auto flex items-center gap-1">
          <div className="inline-flex rounded border border-slate-300 bg-white overflow-hidden">
            <button
              onClick={() => setViewMode("cards")}
              className={`px-2 py-1 text-[11px] ${viewMode === "cards" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Cartes
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-2 py-1 text-[11px] ${viewMode === "table" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Tableau
            </button>
          </div>
          <button
            onClick={exportCsv}
            disabled={!filtered || filtered.length === 0}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Exporter en CSV"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50"
            title="Rafraîchir"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </FilterBar>

      <div className="flex items-center gap-4 flex-wrap text-[11.5px] text-slate-600 pb-1">
        <span>{filtered?.length ?? 0} tickets</span>
      </div>

      {loading || paged === null ? (
        <div className="py-6 text-center text-[12px] text-slate-500">Chargement…</div>
      ) : paged.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-slate-500 border border-dashed border-slate-200 rounded">Aucun ticket avec ces filtres.</div>
      ) : viewMode === "table" ? (
        <>
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                <tr>
                  <SortTh label="#" sortKey="number" current={sort} onClick={toggleSort} />
                  <SortTh label="Sujet" sortKey="subject" current={sort} onClick={toggleSort} />
                  <SortTh label="Statut" sortKey="status" current={sort} onClick={toggleSort} />
                  <SortTh label="Priorité" sortKey="priority" current={sort} onClick={toggleSort} />
                  <SortTh label="Créé" sortKey="created" current={sort} onClick={toggleSort} />
                  <SortTh label="Résolu" sortKey="resolved" current={sort} onClick={toggleSort} />
                  <th className="text-left px-2 py-1.5">Assigné</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-slate-500 font-mono">
                      <Link href={`/tickets/${t.id}`} className="text-blue-600 hover:underline">#{t.number}</Link>
                    </td>
                    <td className="px-2 py-1.5 text-slate-900 max-w-[400px] truncate">{t.subject}</td>
                    <td className="px-2 py-1.5">
                      <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${STATUS_COLORS[t.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`text-[10.5px] rounded px-1.5 py-0.5 ${PRIORITY_COLORS[t.priority] ?? "bg-slate-100"}`}>
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{fmtDate(t.createdAt)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{t.resolvedAt ? fmtDate(t.resolvedAt) : "—"}</td>
                    <td className="px-2 py-1.5 text-slate-700 whitespace-nowrap">
                      {t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            {paged.map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="block rounded border border-slate-200 bg-white hover:border-slate-300 p-2.5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[11px] font-mono text-slate-500">#{t.number}</span>
                      <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${STATUS_COLORS[t.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                      <span className={`text-[10.5px] rounded px-1.5 py-0.5 ${PRIORITY_COLORS[t.priority] ?? "bg-slate-100"}`}>
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                    </div>
                    <div className="text-[13px] font-medium text-slate-900 break-words">{t.subject}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{fmtDate(t.createdAt)}</span>
                      {t.assignee && <><span>·</span><span>{t.assignee.firstName} {t.assignee.lastName}</span></>}
                      {t.resolvedAt && <><span>·</span><span className="text-emerald-700">Résolu {fmtDate(t.resolvedAt)}</span></>}
                    </div>
                  </div>
                  <ExternalLink className="h-3 w-3 text-slate-300 shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      )}
    </div>
  );
}

// ============================================================================
// UI primitives
// ============================================================================
function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap rounded-md bg-slate-50 border border-slate-200 px-2 py-1.5">
      <Filter className="h-3 w-3 text-slate-400" />
      {children}
    </div>
  );
}
function PresetSelect({ value, onChange }: { value: DatePreset; onChange: (v: DatePreset) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DatePreset)} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] focus:border-blue-500 focus:outline-none">
      <option value="last_30">30 derniers jours</option>
      <option value="last_90">90 derniers jours</option>
      <option value="this_month">Ce mois-ci</option>
      <option value="last_month">Mois dernier</option>
      <option value="this_quarter">Ce trimestre</option>
      <option value="this_year">Cette année</option>
      <option value="all">Toute la période</option>
      <option value="custom">Personnalisé…</option>
    </select>
  );
}
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1 text-[11.5px] text-slate-600">
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11.5px] focus:border-blue-500 focus:outline-none" />
    </label>
  );
}
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="inline-flex items-center gap-1 text-[11.5px] text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11.5px] focus:border-blue-500 focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function FilterText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="inline-flex items-center gap-1 text-[11.5px] text-slate-600">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11.5px] focus:border-blue-500 focus:outline-none w-28" />
    </label>
  );
}
function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1 text-[11.5px] text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3 w-3 accent-blue-600" />
      {label}
    </label>
  );
}
function SortTh<K extends string>({
  label, sortKey, current, onClick, align = "left",
}: {
  label: string;
  sortKey: K;
  current: SortState<K>;
  onClick: (key: K) => void;
  align?: "left" | "right";
}) {
  const active = current.key === sortKey;
  const Icon = !active ? ArrowUpDown : current.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-2 py-1.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide text-[10.5px] hover:text-slate-900 transition-colors ${active ? "text-slate-900" : "text-slate-500"}`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2 text-[11.5px] text-slate-600">
      <div>Page {page + 1} / {totalPages}</div>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-40">← Préc.</button>
        <button onClick={() => onChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-40">Suiv. →</button>
      </div>
    </div>
  );
}
