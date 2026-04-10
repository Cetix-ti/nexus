"use client";

import { useMemo } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  INTERVENTION_TYPE_COLORS,
  type ScheduledIntervention,
  type SchedulerTechnician,
} from "@/lib/scheduling/types";
import { getInterventionsForWeek } from "@/lib/scheduling/mock-data";

const START_HOUR = 8;
const END_HOUR = 18;
const HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 60; // px per hour

interface SchedulerWeekViewProps {
  weekStart: Date;
  technicians: SchedulerTechnician[];
  selectedTechIds: string[];
  onSelectIntervention: (i: ScheduledIntervention) => void;
}

interface PositionedIntervention {
  intervention: ScheduledIntervention;
  top: number;
  height: number;
  column: number;
  columns: number;
}

function minutesFromStart(date: Date): number {
  return (date.getHours() - START_HOUR) * 60 + date.getMinutes();
}

function layoutDay(items: ScheduledIntervention[]): PositionedIntervention[] {
  // Sort by start
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  // Greedy column packing for overlaps
  const result: PositionedIntervention[] = [];
  type Slot = { endsAt: number };
  const columns: Slot[] = [];

  // First pass: assign columns
  const assigned: { iv: ScheduledIntervention; col: number }[] = [];
  for (const iv of sorted) {
    const startMs = new Date(iv.startsAt).getTime();
    const endMs = new Date(iv.endsAt).getTime();
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].endsAt <= startMs) {
        columns[i] = { endsAt: endMs };
        assigned.push({ iv, col: i });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push({ endsAt: endMs });
      assigned.push({ iv, col: columns.length - 1 });
    }
  }
  const totalCols = Math.max(1, columns.length);

  for (const { iv, col } of assigned) {
    const start = new Date(iv.startsAt);
    const end = new Date(iv.endsAt);
    const top = (minutesFromStart(start) / 60) * HOUR_HEIGHT;
    const heightMin = Math.max(20, (end.getTime() - start.getTime()) / 60000);
    const height = (heightMin / 60) * HOUR_HEIGHT;
    result.push({ intervention: iv, top, height, column: col, columns: totalCols });
  }
  return result;
}

export function SchedulerWeekView({
  weekStart,
  technicians: _technicians,
  selectedTechIds,
  onSelectIntervention,
}: SchedulerWeekViewProps) {
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const interventions = useMemo(() => getInterventionsForWeek(weekStart), [weekStart]);
  const filtered = useMemo(() => {
    if (selectedTechIds.length === 0) return interventions;
    return interventions.filter((iv) =>
      iv.technicianIds.some((id) => selectedTechIds.includes(id))
    );
  }, [interventions, selectedTechIds]);

  const today = new Date();

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      {/* Header */}
      <div
        className="grid border-b border-slate-200/80 bg-slate-50/60"
        style={{ gridTemplateColumns: `60px repeat(7, 1fr)` }}
      >
        <div className="border-r border-slate-200/80" />
        {weekDays.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "px-3 py-2.5 text-center border-r border-slate-200/60 last:border-r-0",
                isToday && "bg-blue-50/40"
              )}
            >
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                {format(day, "EEE", { locale: fr })}
              </div>
              <div
                className={cn(
                  "text-[15px] font-semibold mt-0.5",
                  isToday ? "text-blue-600" : "text-slate-900"
                )}
              >
                {format(day, "d MMM", { locale: fr })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div
        className="grid relative"
        style={{ gridTemplateColumns: `60px repeat(7, 1fr)` }}
      >
        {/* Time column */}
        <div className="border-r border-slate-200/80">
          {Array.from({ length: HOURS }, (_, i) => START_HOUR + i).map((h) => (
            <div
              key={h}
              className="text-[10.5px] text-slate-400 text-right pr-2 tabular-nums"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="-translate-y-1.5 inline-block">{h}:00</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day) => {
          const dayInterventions = filtered.filter((iv) => isSameDay(new Date(iv.startsAt), day));
          const positioned = layoutDay(dayInterventions);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "relative border-r border-slate-200/60 last:border-r-0",
                isToday && "bg-blue-50/20"
              )}
              style={{ height: HOURS * HOUR_HEIGHT }}
            >
              {/* Hour grid lines */}
              {Array.from({ length: HOURS }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-slate-100"
                  style={{ top: i * HOUR_HEIGHT }}
                />
              ))}
              {/* Half-hour lines */}
              {Array.from({ length: HOURS }, (_, i) => (
                <div
                  key={`h-${i}`}
                  className="absolute left-0 right-0 border-t border-dashed border-slate-100/70"
                  style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                />
              ))}

              {/* Interventions */}
              {positioned.map(({ intervention, top, height, column, columns }) => {
                const color = INTERVENTION_TYPE_COLORS[intervention.type];
                const widthPct = 100 / columns;
                const leftPct = column * widthPct;
                return (
                  <button
                    key={intervention.id}
                    type="button"
                    onClick={() => onSelectIntervention(intervention)}
                    className={cn(
                      "absolute rounded-md border-l-[3px] px-1.5 py-1 text-left overflow-hidden ring-1 ring-slate-200/60 hover:ring-slate-300 hover:shadow transition-all",
                      color.bg,
                      color.border
                    )}
                    style={{
                      top: top + 1,
                      height: height - 2,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                  >
                    <div className={cn("text-[10.5px] font-semibold leading-tight line-clamp-2", color.text)}>
                      {intervention.title}
                    </div>
                    <div className="text-[9.5px] text-slate-500 mt-0.5 tabular-nums">
                      {format(new Date(intervention.startsAt), "H:mm", { locale: fr })}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
