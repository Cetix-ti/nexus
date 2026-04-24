"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Clock, Car, Receipt, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  TIME_TYPE_LABELS,
  TIME_TYPE_ICONS,
  EXPENSE_TYPE_LABELS,
  type TimeEntry,
  type TravelEntry,
  type ExpenseEntry,
} from "@/lib/billing/types";
import { CoverageBadge } from "./coverage-badge";
import { AddTimeModal } from "./add-time-modal";
import { AddTravelModal } from "./add-travel-modal";
import { AddExpenseModal } from "./add-expense-modal";

interface TicketBillingSectionProps {
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
}

type Tab = "time" | "travel" | "expense";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "primary" | "success" | "warning" | "danger";
}) {
  const accentClass =
    accent === "success"
      ? "text-emerald-600"
      : accent === "warning"
      ? "text-amber-600"
      : accent === "danger"
      ? "text-red-600"
      : accent === "primary"
      ? "text-blue-600"
      : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={cn("mt-1 text-[17px] font-semibold tabular-nums", accentClass)}>{value}</p>
    </div>
  );
}

export function TicketBillingSection({
  ticketId,
  ticketNumber,
  organizationId,
  organizationName,
}: TicketBillingSectionProps) {
  const [tab, setTab] = useState<Tab>("time");
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState<string | null>(null);
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Saisies de temps RÉELLES depuis l'API. Pas de fallback mock — si la
  // table est vide, on affiche un état vide honnête.
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [reloadTime, setReloadTime] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/time-entries?ticketId=${encodeURIComponent(ticketId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setTimeEntries(
          data.map((r: Record<string, unknown>) => ({
            id: String(r.id),
            ticketId: String(r.ticketId),
            ticketNumber: String(r.ticketNumber ?? ""),
            organizationId: String(r.organizationId),
            organizationName: String(r.organizationName ?? "—"),
            agentId: String(r.agentId),
            agentName: String(r.agentName ?? "—"),
            timeType: r.timeType as TimeEntry["timeType"],
            startedAt: String(r.startedAt),
            endedAt: (r.endedAt as string | null) ?? undefined,
            durationMinutes: Number(r.durationMinutes ?? 0),
            description: String(r.description ?? ""),
            isAfterHours: Boolean(r.isAfterHours),
            isWeekend: Boolean(r.isWeekend),
            isUrgent: Boolean(r.isUrgent),
            isOnsite: Boolean(r.isOnsite),
            hasTravelBilled: Boolean(r.hasTravelBilled),
            travelDurationMinutes: (r.travelDurationMinutes as number | null | undefined) ?? null,
            coverageStatus: r.coverageStatus as TimeEntry["coverageStatus"],
            coverageReason: String(r.coverageReason ?? ""),
            hourlyRate: (r.hourlyRate as number | null) ?? undefined,
            amount: (r.amount as number | null) ?? undefined,
            approvalStatus: (r.approvalStatus as TimeEntry["approvalStatus"]) ?? "draft",
            createdAt: String(r.createdAt),
            updatedAt: String(r.updatedAt),
          }))
        );
      })
      .catch((e) => console.error("time-entries load failed", e));
    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadTime]);
  const [travelEntries, setTravelEntries] = useState<TravelEntry[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);

  const stats = useMemo(() => {
    const totalMin = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const billableMin = timeEntries
      .filter((e) =>
        ["billable", "hour_bank_overage", "msp_overage", "travel_billable"].includes(e.coverageStatus)
      )
      .reduce((s, e) => s + e.durationMinutes, 0);
    const includedMin = timeEntries
      .filter((e) => e.coverageStatus === "included_in_contract")
      .reduce((s, e) => s + e.durationMinutes, 0);
    const bankMin = timeEntries
      .filter((e) => e.coverageStatus === "deducted_from_hour_bank")
      .reduce((s, e) => s + e.durationMinutes, 0);
    const overageMin = timeEntries
      .filter((e) => ["hour_bank_overage", "msp_overage"].includes(e.coverageStatus))
      .reduce((s, e) => s + e.durationMinutes, 0);
    // Confidentialité : pas d'agrégat monétaire dans la vue ticket.
    return { totalMin, billableMin, includedMin, bankMin, overageMin };
  }, [timeEntries, travelEntries, expenseEntries]);

  return (
    <div className="mb-8 rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-900">Temps & facturation</h2>
            <p className="text-[12px] text-slate-500">
              Suivez le temps, les déplacements et les dépenses associés à ce ticket
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
          <StatCard label="Temps total" value={formatDuration(stats.totalMin)} />
          <StatCard label="Facturable" value={formatDuration(stats.billableMin)} accent="primary" />
          <StatCard label="Inclus contrat" value={formatDuration(stats.includedMin)} accent="success" />
          <StatCard label="Banque consommée" value={formatDuration(stats.bankMin)} accent="success" />
          <StatCard label="Dépassement" value={formatDuration(stats.overageMin)} accent="warning" />
        </div>
      </div>

      {/* Scroll horizontal sur mobile — les 3 onglets avec compteurs
          débordaient sur écran < 375 px. Le scroll permet de glisser
          sans que la page elle-même ne scrolle horizontalement. */}
      <div className="flex items-center gap-1 border-b border-slate-200/80 px-3 sm:px-5 pt-3 overflow-x-auto">
        {[
          { id: "time" as Tab, label: "Temps", icon: Clock, count: timeEntries.length },
          { id: "travel" as Tab, label: "Déplacements", icon: Car, count: travelEntries.length },
          { id: "expense" as Tab, label: "Dépenses", icon: Receipt, count: expenseEntries.length },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-[12.5px] sm:text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0",
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              {t.label}
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold",
                  active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-5">
        <div className="mb-4 flex items-center justify-end">
          {tab === "time" && (
            <Button variant="primary" size="sm" onClick={() => setShowTimeModal(true)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Ajouter du temps
            </Button>
          )}
          {tab === "travel" && (
            <Button variant="primary" size="sm" onClick={() => setShowTravelModal(true)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Ajouter un déplacement
            </Button>
          )}
          {tab === "expense" && (
            <Button variant="primary" size="sm" onClick={() => setShowExpenseModal(true)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Ajouter une dépense
            </Button>
          )}
        </div>

        {tab === "time" && (
          <EntryList
            empty="Aucune entrée de temps pour ce ticket"
            rows={timeEntries.map((e) => ({
              id: e.id,
              date: e.startedAt,
              icon: TIME_TYPE_ICONS[e.timeType],
              label: TIME_TYPE_LABELS[e.timeType],
              description: e.description,
              agent: e.agentName,
              metric: formatDuration(e.durationMinutes),
              amount: e.amount,
              coverageStatus: e.coverageStatus,
              coverageReason: e.coverageReason,
            }))}
            onEdit={(id) => {
              setEditingTimeEntryId(id);
              setShowTimeModal(true);
            }}
            onDelete={async (id) => {
              if (!confirm("Supprimer cette saisie de temps ?")) return;
              const res = await fetch(
                `/api/v1/time-entries?id=${encodeURIComponent(id)}`,
                { method: "DELETE" }
              );
              if (res.ok) setReloadTime((k) => k + 1);
            }}
          />
        )}
        {tab === "travel" && (() => {
          // Dérive les déplacements depuis les saisies de temps avec
          // hasTravelBilled=true. C'est la source de vérité unique : les
          // deux onglets (Temps + Déplacements) montrent la même donnée.
          const derivedRows = timeEntries
            .filter((e) => e.hasTravelBilled)
            .map((e) => {
              const minutes = e.travelDurationMinutes ?? null;
              return {
                id: `te-travel-${e.id}`,
                date: e.startedAt,
                icon: "🚗",
                label: "Déplacement (synchronisé avec la saisie de temps)",
                description: e.description || "Déplacement facturé",
                agent: e.agentName,
                metric: minutes != null ? `${minutes} min` : "Durée non saisie",
                amount: undefined as number | undefined,
                coverageStatus: "travel_billable" as const,
                coverageReason:
                  minutes != null
                    ? "Temps de trajet aller-retour saisi sur la saisie de temps."
                    : "Déplacement facturé — aucune durée de trajet saisie.",
                _sourceTimeEntryId: e.id,
              };
            });
          const manualRows = travelEntries.map((e) => {
            const route = e.fromLocation && e.toLocation ? `${e.fromLocation} → ${e.toLocation}` : "Déplacement";
            const km = typeof e.distanceKm === "number" ? e.distanceKm * (e.isRoundTrip ? 2 : 1) : null;
            return {
              id: e.id,
              date: e.date,
              icon: "🚗",
              label: route,
              description: e.notes || (e.durationMinutes ? `${e.durationMinutes} min de trajet` : ""),
              agent: e.agentName,
              metric: km !== null ? `${km} km` : (e.durationMinutes ? `${e.durationMinutes} min` : ""),
              amount: e.amount,
              coverageStatus: e.coverageStatus,
              coverageReason: e.coverageReason,
              _sourceTimeEntryId: undefined as string | undefined,
            };
          });
          const rows = [...derivedRows, ...manualRows];
          return (
            <EntryList
              empty="Aucun déplacement pour ce ticket"
              rows={rows}
              onEdit={(id) => {
                const r = rows.find((x) => x.id === id);
                if (r?._sourceTimeEntryId) {
                  // Renvoie à l'édition de la saisie de temps source.
                  setEditingTimeEntryId(r._sourceTimeEntryId);
                  setShowTimeModal(true);
                }
              }}
              onDelete={(id) => {
                const r = rows.find((x) => x.id === id);
                if (r?._sourceTimeEntryId) {
                  // Supprimer depuis un déplacement synchro = décocher la
                  // case sur la saisie de temps source.
                  if (!confirm("Retirer le déplacement facturé de cette saisie de temps ?")) return;
                  fetch("/api/v1/time-entries", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: r._sourceTimeEntryId, hasTravelBilled: false, travelDurationMinutes: null }),
                  }).then((res) => { if (res.ok) setReloadTime((k) => k + 1); });
                } else {
                  setTravelEntries((prev) => prev.filter((e) => e.id !== id));
                }
              }}
            />
          );
        })()}
        {tab === "expense" && (
          <EntryList
            empty="Aucune dépense pour ce ticket"
            rows={expenseEntries.map((e) => ({
              id: e.id,
              date: e.date,
              icon: "💳",
              label: EXPENSE_TYPE_LABELS[e.expenseType],
              description: e.description,
              agent: e.agentName,
              metric: `${e.amount.toFixed(2)} $`,
              amount: e.isRebillable ? e.amount : undefined,
              coverageStatus: e.coverageStatus,
              coverageReason: e.coverageReason,
            }))}
            onDelete={(id) => setExpenseEntries((prev) => prev.filter((e) => e.id !== id))}
          />
        )}
      </div>

      <AddTimeModal
        open={showTimeModal}
        onClose={() => { setShowTimeModal(false); setEditingTimeEntryId(null); }}
        ticketId={ticketId}
        ticketNumber={ticketNumber}
        organizationId={organizationId}
        organizationName={organizationName}
        editingEntry={editingTimeEntryId ? timeEntries.find((e) => e.id === editingTimeEntryId) ?? null : null}
        onSave={async (entry) => {
          try {
            const payload = {
              ticketId,
              organizationId,
              timeType: entry.timeType,
              startedAt: entry.startedAt,
              endedAt: entry.endedAt ?? null,
              durationMinutes: entry.durationMinutes,
              description: entry.description,
              isAfterHours: entry.isAfterHours,
              isWeekend: entry.isWeekend,
              isUrgent: entry.isUrgent,
              isOnsite: entry.isOnsite,
              hasTravelBilled: entry.hasTravelBilled ?? false,
              travelDurationMinutes: entry.hasTravelBilled ? (entry.travelDurationMinutes ?? null) : null,
              // Le serveur IGNORE ces 4 champs et recalcule via
              // resolveDecisionForEntry(). On les envoie pour préserver
              // le contrat d'API mais ils ne sont jamais stockés tels quels.
              coverageStatus: entry.coverageStatus,
              coverageReason: entry.coverageReason,
              hourlyRate: entry.hourlyRate ?? null,
              amount: entry.amount ?? null,
              // Le flag "forcer non facturable" est le seul signal manuel
              // qui reste honoré par le serveur.
              forceNonBillable: (entry as { forceNonBillable?: boolean }).forceNonBillable ?? false,
            };
            let res: Response;
            if (editingTimeEntryId) {
              res = await fetch("/api/v1/time-entries", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editingTimeEntryId, ...payload }),
              });
            } else {
              res = await fetch("/api/v1/time-entries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
            }
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              alert(`Échec : ${data.error || res.status}`);
              return;
            }
            setEditingTimeEntryId(null);
            setReloadTime((k) => k + 1);
          } catch (err) {
            alert(`Erreur réseau : ${err instanceof Error ? err.message : String(err)}`);
          }
        }}
      />
      <AddTravelModal
        open={showTravelModal}
        onClose={() => setShowTravelModal(false)}
        ticketId={ticketId}
        ticketNumber={ticketNumber}
        organizationId={organizationId}
        organizationName={organizationName}
        onSave={(entry) => setTravelEntries((prev) => [...prev, entry])}
      />
      <AddExpenseModal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        ticketId={ticketId}
        ticketNumber={ticketNumber}
        organizationId={organizationId}
        organizationName={organizationName}
        onSave={(entry) => setExpenseEntries((prev) => [...prev, entry])}
      />
    </div>
  );
}

interface EntryRow {
  id: string;
  date: string;
  icon: string;
  label: string;
  description: string;
  agent: string;
  metric: string;
  amount?: number;
  coverageStatus: import("@/lib/billing/types").CoverageStatus;
  coverageReason: string;
  /**
   * Si défini, la ligne est dérivée d'une saisie de temps (déplacement
   * synchronisé). Les actions Modifier/Supprimer reviennent à éditer
   * la saisie source.
   */
  _sourceTimeEntryId?: string;
}

function EntryList({
  rows,
  empty,
  onEdit,
  onDelete,
}: {
  rows: EntryRow[];
  empty: string;
  onEdit?: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
        <p className="text-[13px] text-slate-500">{empty}</p>
      </div>
    );
  }
  return (
    <>
    {/* Mobile card list */}
    <div className="sm:hidden space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-[14px] leading-none">{r.icon}</span>
              <span className="text-[12.5px] font-medium text-slate-700 truncate">{r.label}</span>
            </div>
            <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
              {format(new Date(r.date), "dd MMM")}
            </span>
          </div>
          {r.description && (
            <p className="text-[12px] text-slate-600 mb-1.5 break-words">{r.description}</p>
          )}
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <div className="flex items-center gap-1.5">
              <Avatar className="h-4 w-4"><AvatarFallback className="text-[8px]">{getInitials(r.agent)}</AvatarFallback></Avatar>
              <span className="text-[11px] text-slate-500 truncate">{r.agent}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-slate-800 tabular-nums">{r.metric}</span>
              <CoverageBadge status={r.coverageStatus} reason={r.coverageReason} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-100">
            {onEdit && (
              <button onClick={() => onEdit(r.id)} className="text-[11px] text-slate-500 hover:text-blue-600 px-2 py-0.5">
                Modifier
              </button>
            )}
            <button onClick={() => onDelete(r.id)} className="text-[11px] text-red-500 hover:text-red-700 px-2 py-0.5">
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>

    {/* Desktop table */}
    <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200/80">
      <div className="overflow-x-auto"><table className="w-full text-[13px]">
        <thead className="bg-slate-50/70">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2.5">Date</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Agent</th>
            <th className="px-3 py-2.5 text-right">Quantité</th>
            <th className="px-3 py-2.5">Couverture</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                {format(new Date(r.date), "dd MMM")}
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] leading-none">{r.icon}</span>
                  <span className="text-slate-700">{r.label}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-slate-600 max-w-xs truncate" title={r.description}>
                {r.description}
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[9px]">{getInitials(r.agent)}</AvatarFallback>
                  </Avatar>
                  <span className="text-slate-600 whitespace-nowrap">{r.agent}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
                {r.metric}
              </td>
              <td className="px-3 py-3">
                <CoverageBadge status={r.coverageStatus} reason={r.coverageReason} />
              </td>
              {/* Colonne Montant retirée volontairement : confidentialité tarifaire */}
              <td className="px-3 py-3">
                <div className="flex items-center justify-end gap-1">
                  {onEdit && (
                  <button
                    onClick={() => onEdit(r.id)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    title="Modifier"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  )}
                  <button
                    onClick={() => onDelete(r.id)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
    </>
  );
}
