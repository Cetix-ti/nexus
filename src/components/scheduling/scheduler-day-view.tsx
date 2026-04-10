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

const START_HOUR = 8;
const END_HOUR = 18;
const HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 64;

interface SchedulerDayViewProps {
  date: Date;
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

function minutesFromStart(date: Date): number {
  return (date.getHours() - START_HOUR) * 60 + date.getMinutes();
}

export function SchedulerDayView({
  date,
  technicians,
  selectedTechIds,
  onSelectIntervention,
}: SchedulerDayViewProps) {
  const visibleTechs = useMemo(
    () => (selectedTechIds.length > 0 ? technicians.filter((t) => selectedTechIds.includes(t.id)) : technicians),
    [technicians, selectedTechIds]
  );

  const interventions = useMemo(() => getInterventionsForDate(date), [date]);
  const today = new Date();
  const isToday = isSameDay(date, today);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      {/* Header */}
      <div
        className="grid border-b border-slate-200/80 bg-slate-50/60"
        style={{ gridTemplateColumns: `60px repeat(${visibleTechs.length}, 1fr)` }}
      >
        <div className="border-r border-slate-200/80 px-2 py-2.5 text-[10.5px] text-slate-500 font-semibold uppercase tracking-wider">
          {format(date, "d MMM", { locale: fr })}
        </div>
        {visibleTechs.map((tech) => (
          <div
            key={tech.id}
            className={cn(
              "px-3 py-2.5 border-r border-slate-200/60 last:border-r-0 flex items-center gap-2",
              isToday && "bg-blue-50/30"
            )}
          >
            <div
              className={cn(
                "h-7 w-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold shrink-0",
                tech.color
              )}
            >
              {getInitials(tech.name)}
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-slate-900 truncate leading-tight">
                {tech.name}
              </div>
              <div className="text-[10.5px] text-slate-500 truncate leading-tight">{tech.role}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        className="grid relative"
        style={{ gridTemplateColumns: `60px repeat(${visibleTechs.length}, 1fr)` }}
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

        {visibleTechs.map((tech) => {
          const techInterventions = interventions.filter(
            (iv) => (iv.primaryTechnicianId ?? iv.technicianIds[0]) === tech.id
          );
          return (
            <div
              key={tech.id}
              className="relative border-r border-slate-200/60 last:border-r-0"
              style={{ height: HOURS * HOUR_HEIGHT }}
            >
              {Array.from({ length: HOURS }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-slate-100"
                  style={{ top: i * HOUR_HEIGHT }}
                />
              ))}
              {Array.from({ length: HOURS }, (_, i) => (
                <div
                  key={`h-${i}`}
                  className="absolute left-0 right-0 border-t border-dashed border-slate-100/70"
                  style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                />
              ))}

              {techInterventions.map((iv) => {
                const start = new Date(iv.startsAt);
                const end = new Date(iv.endsAt);
                const top = (minutesFromStart(start) / 60) * HOUR_HEIGHT;
                const heightMin = Math.max(20, (end.getTime() - start.getTime()) / 60000);
                const height = (heightMin / 60) * HOUR_HEIGHT;
                const color = INTERVENTION_TYPE_COLORS[iv.type];
                return (
                  <button
                    key={iv.id}
                    type="button"
                    onClick={() => onSelectIntervention(iv)}
                    className={cn(
                      "absolute rounded-md border-l-[3px] px-2 py-1.5 text-left overflow-hidden ring-1 ring-slate-200/60 hover:ring-slate-300 hover:shadow transition-all",
                      color.bg,
                      color.border
                    )}
                    style={{
                      top: top + 1,
                      height: height - 2,
                      left: 4,
                      right: 4,
                    }}
                  >
                    <div className={cn("text-[11.5px] font-semibold leading-tight line-clamp-2", color.text)}>
                      {iv.title}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                      {format(start, "H:mm", { locale: fr })} — {format(end, "H:mm", { locale: fr })}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{iv.organizationName}</div>
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
