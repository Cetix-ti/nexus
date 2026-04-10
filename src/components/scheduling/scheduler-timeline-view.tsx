"use client";

import { useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  INTERVENTION_TYPE_COLORS,
  type ScheduledIntervention,
  type SchedulerTechnician,
} from "@/lib/scheduling/types";
import { getInterventionsForDate } from "@/lib/scheduling/mock-data";

const START_HOUR = 7;
const END_HOUR = 19;
const HOURS = END_HOUR - START_HOUR;
const ROW_HEIGHT = 56;
const TECH_COL_WIDTH = 200;

interface SchedulerTimelineViewProps {
  weekStart: Date;
  technicians: SchedulerTechnician[];
  selectedTechIds: string[];
  onSelectIntervention: (i: ScheduledIntervention) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SchedulerTimelineView({
  weekStart,
  technicians,
  selectedTechIds,
  onSelectIntervention,
}: SchedulerTimelineViewProps) {
  // Show one day — use today if weekStart contains it, otherwise weekStart
  const today = new Date();
  const day = useMemo(() => {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    if (today.getTime() >= start.getTime() && today.getTime() < end.getTime()) {
      return today;
    }
    return start;
  }, [weekStart]);

  const visibleTechs = useMemo(
    () =>
      selectedTechIds.length > 0
        ? technicians.filter((t) => selectedTechIds.includes(t.id))
        : technicians,
    [technicians, selectedTechIds]
  );

  const interventions = useMemo(() => getInterventionsForDate(day), [day]);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/60 px-4 py-2.5">
        <div className="text-[12.5px] font-semibold text-slate-700">
          Chronologie — {format(day, "EEEE d MMMM yyyy", { locale: fr })}
        </div>
        <div className="text-[11px] text-slate-500">
          {visibleTechs.length} technicien{visibleTechs.length > 1 ? "s" : ""}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: TECH_COL_WIDTH + HOURS * 80 }}>
          {/* Hour scale */}
          <div
            className="grid border-b border-slate-200/80 bg-slate-50/40"
            style={{ gridTemplateColumns: `${TECH_COL_WIDTH}px 1fr` }}
          >
            <div className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 border-r border-slate-200/80">
              Technicien
            </div>
            <div className="relative h-9">
              {Array.from({ length: HOURS }, (_, i) => {
                const h = START_HOUR + i;
                const isOffHours = h < 8 || h >= 18;
                return (
                  <div
                    key={h}
                    className={cn(
                      "absolute top-0 bottom-0 border-l border-slate-200/60 text-[10.5px] text-slate-400 tabular-nums px-1.5 pt-2",
                      isOffHours && "bg-slate-100/40"
                    )}
                    style={{ left: `${(i / HOURS) * 100}%`, width: `${100 / HOURS}%` }}
                  >
                    {h}h
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tech rows */}
          {visibleTechs.map((tech) => {
            const techInterventions = interventions.filter((iv) =>
              iv.technicianIds.includes(tech.id)
            );
            return (
              <div
                key={tech.id}
                className="grid border-b border-slate-200/60 last:border-b-0"
                style={{ gridTemplateColumns: `${TECH_COL_WIDTH}px 1fr` }}
              >
                {/* Tech cell */}
                <div className="px-3 py-2 border-r border-slate-200/80 flex items-center gap-2.5">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[11px] font-semibold shrink-0",
                      tech.color
                    )}
                  >
                    {getInitials(tech.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-slate-900 truncate leading-tight">
                      {tech.name}
                    </div>
                    <div className="text-[10.5px] text-slate-500 truncate leading-tight">
                      {tech.role}
                    </div>
                  </div>
                </div>

                {/* Timeline row */}
                <div className="relative" style={{ height: ROW_HEIGHT }}>
                  {/* Hour grid + off-hours shading */}
                  {Array.from({ length: HOURS }, (_, i) => {
                    const h = START_HOUR + i;
                    const isOffHours = h < 8 || h >= 18;
                    return (
                      <div
                        key={h}
                        className={cn(
                          "absolute top-0 bottom-0 border-l border-slate-100",
                          isOffHours && "bg-slate-100/40"
                        )}
                        style={{ left: `${(i / HOURS) * 100}%`, width: `${100 / HOURS}%` }}
                      />
                    );
                  })}

                  {/* Bars */}
                  {techInterventions.map((iv) => {
                    const start = new Date(iv.startsAt);
                    const end = new Date(iv.endsAt);
                    const startMinutes = start.getHours() * 60 + start.getMinutes() - START_HOUR * 60;
                    const endMinutes = end.getHours() * 60 + end.getMinutes() - START_HOUR * 60;
                    const totalMinutes = HOURS * 60;
                    const leftPct = Math.max(0, (startMinutes / totalMinutes) * 100);
                    const widthPct = Math.max(
                      1,
                      ((Math.min(endMinutes, totalMinutes) - Math.max(startMinutes, 0)) /
                        totalMinutes) *
                        100
                    );
                    const color = INTERVENTION_TYPE_COLORS[iv.type];
                    return (
                      <button
                        key={iv.id}
                        type="button"
                        onClick={() => onSelectIntervention(iv)}
                        className={cn(
                          "absolute top-1.5 bottom-1.5 rounded-md border-l-[3px] px-2 py-1 overflow-hidden text-left ring-1 ring-slate-200/60 hover:ring-slate-300 hover:shadow transition-all",
                          color.bg,
                          color.border
                        )}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      >
                        <div
                          className={cn(
                            "text-[11px] font-semibold leading-tight truncate",
                            color.text
                          )}
                        >
                          {iv.title}
                        </div>
                        <div className="text-[9.5px] text-slate-500 truncate tabular-nums">
                          {format(start, "H:mm", { locale: fr })} —{" "}
                          {format(end, "H:mm", { locale: fr })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {visibleTechs.length === 0 && (
            <div className="px-4 py-8 text-center text-[12.5px] text-slate-400">
              Aucun technicien sélectionné
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
