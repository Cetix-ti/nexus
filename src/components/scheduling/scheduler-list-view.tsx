"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  INTERVENTION_TYPE_COLORS,
  INTERVENTION_TYPE_LABELS,
  INTERVENTION_STATUS_LABELS,
  type ScheduledIntervention,
  type InterventionStatus,
} from "@/lib/scheduling/types";
import { mockSchedulerTechnicians } from "@/lib/scheduling/mock-data";

interface SchedulerListViewProps {
  interventions: ScheduledIntervention[];
  onSelectIntervention: (i: ScheduledIntervention) => void;
}

const STATUS_STYLE: Record<InterventionStatus, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200/70",
  scheduled: "bg-blue-50 text-blue-700 ring-blue-200/70",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200/70",
  completed: "bg-slate-50 text-slate-600 ring-slate-200/70",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200/70",
  rescheduled: "bg-violet-50 text-violet-700 ring-violet-200/70",
  no_show: "bg-orange-50 text-orange-700 ring-orange-200/70",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getTechColor(techId: string): string {
  return mockSchedulerTechnicians.find((t) => t.id === techId)?.color ?? "from-slate-400 to-slate-600";
}

export function SchedulerListView({ interventions, onSelectIntervention }: SchedulerListViewProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduledIntervention[]>();
    const sorted = [...interventions].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
    for (const iv of sorted) {
      const key = new Date(iv.startsAt).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(iv);
    }
    return Array.from(map.entries());
  }, [interventions]);

  if (grouped.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-12 text-center">
        <p className="text-[13px] text-slate-500">Aucune intervention pour cette période</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map(([dateKey, items]) => {
        const date = new Date(dateKey);
        return (
          <div
            key={dateKey}
            className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-slate-900 capitalize">
                {format(date, "EEEE d MMMM yyyy", { locale: fr })}
              </h3>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {items.length} intervention{items.length > 1 ? "s" : ""}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="text-left px-4 py-2 w-[120px]">Heure</th>
                  <th className="text-left px-2 py-2 w-[160px]">Type</th>
                  <th className="text-left px-2 py-2">Titre</th>
                  <th className="text-left px-2 py-2 w-[180px]">Organisation</th>
                  <th className="text-left px-2 py-2 w-[120px]">Techniciens</th>
                  <th className="text-left px-4 py-2 w-[130px]">Statut</th>
                </tr>
              </thead>
              <tbody>
                {items.map((iv) => {
                  const color = INTERVENTION_TYPE_COLORS[iv.type];
                  const start = new Date(iv.startsAt);
                  const end = new Date(iv.endsAt);
                  return (
                    <tr
                      key={iv.id}
                      onClick={() => onSelectIntervention(iv)}
                      className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-[12px] text-slate-700 tabular-nums">
                        {format(start, "H:mm", { locale: fr })} — {format(end, "H:mm", { locale: fr })}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset",
                            color.bg,
                            color.text,
                            color.ring
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", color.dot)} />
                          {INTERVENTION_TYPE_LABELS[iv.type]}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="text-[13px] font-medium text-slate-900 truncate">{iv.title}</div>
                        {iv.ticketNumber && (
                          <div className="text-[10.5px] text-slate-500 tabular-nums">{iv.ticketNumber}</div>
                        )}
                      </td>
                      <td className="px-2 py-3 text-[12px] text-slate-700 truncate">
                        {iv.organizationName}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex -space-x-1.5">
                          {iv.technicianIds.slice(0, 3).map((id, idx) => {
                            const name = iv.technicianNames[idx] ?? "";
                            return (
                              <div
                                key={id + idx}
                                title={name}
                                className={cn(
                                  "h-6 w-6 rounded-full bg-gradient-to-br ring-2 ring-white flex items-center justify-center text-white text-[9px] font-semibold",
                                  getTechColor(id)
                                )}
                              >
                                {getInitials(name)}
                              </div>
                            );
                          })}
                          {iv.technicianIds.length > 3 && (
                            <div className="h-6 w-6 rounded-full bg-slate-100 ring-2 ring-white flex items-center justify-center text-slate-600 text-[9px] font-semibold">
                              +{iv.technicianIds.length - 3}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
                            STATUS_STYLE[iv.status]
                          )}
                        >
                          {INTERVENTION_STATUS_LABELS[iv.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
