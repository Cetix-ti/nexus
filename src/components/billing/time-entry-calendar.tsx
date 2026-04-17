"use client";

// ============================================================================
// TIME ENTRY CALENDAR — vue horaire des saisies de temps du technicien.
//
// Chaque saisie est rendue comme un bloc dans une grille horaire (style
// Google Calendar). Hauteur proportionnelle à la durée. Le bloc affiche
// le logo de l'organisation, le sujet du ticket et la durée.
//
// Vues : jour / semaine / mois (grid compact pour le mois).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar as CalIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OrgLogo } from "@/components/organizations/org-logo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeCalEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  description: string;
  timeType: string;
  coverageStatus: string;
  isOnsite: boolean;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
  isInternal: boolean;
  organization: { id: string; name: string; clientCode: string | null; logo: string | null } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_START = 6;
const DAY_END = 22;
const HOUR_PX = 52;

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r;
}
function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`) : `${m}min`;
}

type ViewMode = "day" | "week" | "month";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimeEntryCalendar() {
  const [entries, setEntries] = useState<TimeCalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState(new Date());

  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(cursor), to: endOfDay(cursor) };
    if (view === "week") {
      const sw = startOfWeek(cursor);
      return { from: sw, to: endOfDay(addDays(sw, 6)) };
    }
    // month
    const f = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const t = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: f, to: t };
  }, [view, cursor]);

  const days = useMemo(() => {
    if (view === "day") return [startOfDay(cursor)];
    if (view === "week") {
      const sw = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(sw, i));
    }
    // month: not used for time grid
    return [];
  }, [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    const res = await fetch(`/api/v1/my-space/time-calendar?${params.toString()}`);
    if (res.ok) {
      const d = await res.json();
      setEntries(d.entries || []);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  function nav(dir: -1 | 1) {
    setCursor((c) => {
      if (view === "day") return addDays(c, dir);
      if (view === "week") return addDays(c, dir * 7);
      return new Date(c.getFullYear(), c.getMonth() + dir, 1);
    });
  }

  const label = useMemo(() => {
    if (view === "day") {
      return cursor.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    if (view === "week") {
      const sw = startOfWeek(cursor);
      const ew = addDays(sw, 6);
      return `${sw.toLocaleDateString("fr-CA", { day: "numeric", month: "short" })} — ${ew.toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  }, [view, cursor]);

  // Total hours in period
  const totalMin = entries.reduce((s, e) => s + e.durationMinutes, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => nav(-1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="sm" onClick={() => nav(1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <h3 className="text-[14px] font-semibold text-slate-900 capitalize ml-2">
            {label}
          </h3>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            {fmtDuration(totalMin)}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1 rounded-md text-[12px] font-medium transition-colors",
                view === v
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-[13px] text-slate-400 text-center py-12">Chargement…</p>
      ) : view === "month" ? (
        <MonthView entries={entries} cursor={cursor} onDayClick={(d) => { setCursor(d); setView("day"); }} />
      ) : (
        <DayWeekGrid days={days} entries={entries} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day / Week time grid
// ---------------------------------------------------------------------------

function DayWeekGrid({ days, entries }: { days: Date[]; entries: TimeCalEntry[] }) {
  const totalHours = DAY_END - DAY_START;
  const gridHeight = totalHours * HOUR_PX;
  const minColWidth = days.length > 1 ? 110 : 0;

  function entriesForDay(day: Date) {
    const ds = startOfDay(day);
    const de = endOfDay(day);
    return entries.filter((e) => {
      const s = new Date(e.startedAt);
      return s >= ds && s <= de;
    });
  }

  function positionFor(e: TimeCalEntry) {
    const s = new Date(e.startedAt);
    const startMin = Math.max(DAY_START * 60, s.getHours() * 60 + s.getMinutes());
    const endMin = Math.min(DAY_END * 60, startMin + e.durationMinutes);
    const top = ((startMin - DAY_START * 60) / 60) * HOUR_PX;
    const height = Math.max(28, ((endMin - startMin) / 60) * HOUR_PX);
    return { top, height };
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: minColWidth ? `${56 + days.length * minColWidth}px` : undefined }}>
          {/* Day headers */}
          <div
            className="grid bg-slate-50/60 border-b border-slate-200"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(${minColWidth}px, 1fr))` }}
          >
            <div />
            {days.map((d) => {
              const isToday = isSameDay(d, new Date());
              const dayEntries = entriesForDay(d);
              const dayMin = dayEntries.reduce((s, e) => s + e.durationMinutes, 0);
              return (
                <div key={d.toISOString()} className="px-2 py-2 text-center border-l border-slate-200">
                  <p className="text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">
                    {d.toLocaleDateString("fr-CA", { weekday: "short" })}
                  </p>
                  <p className={cn(
                    "mt-0.5 text-[14px] font-semibold tabular-nums inline-flex h-7 w-7 items-center justify-center rounded-full",
                    isToday ? "bg-blue-600 text-white" : "text-slate-800",
                  )}>
                    {d.getDate()}
                  </p>
                  {dayMin > 0 && (
                    <p className="text-[10px] text-blue-600 font-semibold mt-0.5">{fmtDuration(dayMin)}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hour grid */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: `56px repeat(${days.length}, minmax(${minColWidth}px, 1fr))`,
                height: gridHeight,
              }}
            >
              {/* Hour labels */}
              <div className="relative">
                {Array.from({ length: totalHours }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-2 text-[10px] text-slate-400 tabular-nums leading-none"
                    style={{ top: i === 0 ? 0 : i * HOUR_PX - 6 }}
                  >
                    {String(DAY_START + i).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d) => {
                const dayEntries = entriesForDay(d);
                return (
                  <div key={d.toISOString()} className="relative border-l border-slate-200">
                    {/* Hour lines */}
                    {Array.from({ length: totalHours + 1 }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-slate-100"
                        style={{ top: i * HOUR_PX }}
                      />
                    ))}
                    {/* Entries */}
                    {dayEntries.map((e) => {
                      const { top, height } = positionFor(e);
                      return (
                        <Link
                          key={e.id}
                          href={`/tickets/${e.ticketId}`}
                          className="absolute left-1 right-1 rounded-lg overflow-hidden hover:brightness-95 hover:z-10 transition-all group"
                          style={{
                            top,
                            height,
                            backgroundColor: e.isInternal ? "#ede9fe" : "#e0f2fe",
                            borderLeft: `3px solid ${e.isInternal ? "#7c3aed" : "#0284c7"}`,
                          }}
                          title={`${e.ticketSubject} — ${fmtDuration(e.durationMinutes)}`}
                        >
                          <div className="flex items-start gap-1.5 px-2 py-1.5 h-full min-w-0">
                            {e.organization && (
                              <span className="shrink-0 mt-0.5">
                                <OrgLogo name={e.organization.name} logo={e.organization.logo} size={18} rounded="sm" />
                              </span>
                            )}
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <p className="text-[11px] font-semibold text-slate-900 truncate leading-tight">
                                {e.ticketSubject}
                              </p>
                              {height >= 44 && (
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                  {e.organization?.name ?? "Interne"}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-slate-700 tabular-nums">
                              {fmtDuration(e.durationMinutes)}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Month view — compact grid, each day = cell with stacked entries
// ---------------------------------------------------------------------------

function MonthView({
  entries,
  cursor,
  onDayClick,
}: {
  entries: TimeCalEntry[];
  cursor: Date;
  onDayClick: (d: Date) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOfs = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cells: Date[] = [];
  const start = addDays(firstDay, -startOfs);
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i));

  function entriesForDay(d: Date) {
    const ds = startOfDay(d);
    const de = endOfDay(d);
    return entries.filter((e) => {
      const s = new Date(e.startedAt);
      return s >= ds && s <= de;
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 min-h-[480px]">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = isSameDay(d, new Date());
          const dayEntries = entriesForDay(d);
          const dayMin = dayEntries.reduce((s, e) => s + e.durationMinutes, 0);
          return (
            <div
              key={i}
              onClick={() => onDayClick(d)}
              className={cn(
                "border-b border-r border-slate-200 p-1 cursor-pointer hover:bg-blue-50/40 transition-colors overflow-hidden flex flex-col",
                !inMonth && "bg-slate-50/40",
              )}
            >
              <div className="flex items-center justify-between shrink-0 mb-0.5">
                <span className={cn(
                  "text-[11px] font-medium tabular-nums",
                  isToday
                    ? "bg-blue-600 text-white rounded-full h-5 w-5 flex items-center justify-center"
                    : inMonth ? "text-slate-700" : "text-slate-400",
                )}>
                  {d.getDate()}
                </span>
                {dayMin > 0 && (
                  <span className="text-[9.5px] font-bold text-blue-600 tabular-nums">
                    {fmtDuration(dayMin)}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-hidden space-y-0.5">
                {dayEntries.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      "rounded px-1 py-0.5 text-[9.5px] truncate",
                      e.isInternal ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800",
                    )}
                    title={`${e.ticketSubject} — ${fmtDuration(e.durationMinutes)}`}
                  >
                    {e.ticketSubject}
                  </div>
                ))}
                {dayEntries.length > 3 && (
                  <span className="text-[9px] text-slate-500">+{dayEntries.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
