"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalIcon,
  Plus,
  MapPin,
  User,
  Key,
  Plane,
  Briefcase,
  Users as UsersIcon,
  RefreshCcw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Calendar {
  id: string;
  name: string;
  description: string | null;
  kind: "RENEWALS" | "LEAVE" | "GENERAL" | "CUSTOM";
  color: string;
  isActive: boolean;
}
interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  kind: "RENEWAL" | "LEAVE" | "WORK_LOCATION" | "MEETING" | "PERSONAL" | "OTHER";
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  ownerId: string | null;
  location: string | null;
  organizationId: string | null;
  meetingId: string | null;
  calendar: { id: string; name: string; kind: string; color: string };
  owner: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  organization: { id: string; name: string } | null;
  meeting: { id: string; status: string } | null;
  renewalType: string | null;
  leaveType: string | null;
}

const KIND_ICONS = {
  RENEWAL: Key,
  LEAVE: Plane,
  WORK_LOCATION: MapPin,
  MEETING: UsersIcon,
  PERSONAL: User,
  OTHER: CalIcon,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfWeek(d: Date) {
  // Lundi comme premier jour
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (x.getDay() + 6) % 7; // 0=dim → 6, 1=lun → 0
  x.setDate(x.getDate() - offset);
  return x;
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = addDays(s, 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}
function fmtWeekRange(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString("fr-CA", { month: "long", year: "numeric" })}`;
  }
  return `${start.toLocaleDateString("fr-CA", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" })}`;
}
function fmtDayLong(d: Date) {
  return d.toLocaleDateString("fr-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Heure d'affichage dans les vues time-grid
const DAY_START_HOUR = 6;   // Grid démarre à 6h
const DAY_END_HOUR = 22;    // et finit à 22h
const HOUR_HEIGHT = 48;     // px par heure

type ViewMode = "month" | "week" | "day";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CalendarPage() {
  const router = useRouter();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Load calendars
  useEffect(() => {
    fetch("/api/v1/calendars")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Calendar[]) => {
        setCalendars(arr);
        setVisibleCalendarIds(new Set(arr.map((c) => c.id)));
      })
      .catch(() => {});
  }, []);

  // Fenêtre temporelle selon la vue
  const { windowStart, windowEnd } = useMemo(() => {
    if (viewMode === "month") {
      return { windowStart: startOfMonth(cursor), windowEnd: endOfMonth(cursor) };
    }
    if (viewMode === "week") {
      return { windowStart: startOfWeek(cursor), windowEnd: endOfWeek(cursor) };
    }
    return { windowStart: startOfDay(cursor), windowEnd: endOfDay(cursor) };
  }, [viewMode, cursor]);

  // Load events when window or visible calendars change
  const reloadEvents = () => {
    const ids = Array.from(visibleCalendarIds).join(",");
    const qs = new URLSearchParams({ from: windowStart.toISOString(), to: windowEnd.toISOString() });
    if (ids) qs.set("calendarIds", ids);
    setLoading(true);
    fetch(`/api/v1/calendar-events?${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: CalendarEvent[]) => setEvents(arr))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };
  useEffect(reloadEvents, [windowStart, windowEnd, visibleCalendarIds]);

  // Navigation prev/next/today adapte son pas à la vue
  function step(delta: number) {
    if (viewMode === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    } else if (viewMode === "week") {
      setCursor(addDays(cursor, delta * 7));
    } else {
      setCursor(addDays(cursor, delta));
    }
  }
  function goToday() {
    if (viewMode === "month") setCursor(startOfMonth(new Date()));
    else if (viewMode === "week") setCursor(startOfWeek(new Date()));
    else setCursor(startOfDay(new Date()));
  }

  // Label au-dessus du nav selon la vue
  const rangeLabel = useMemo(() => {
    if (viewMode === "month") return fmtMonth(cursor);
    if (viewMode === "week") return fmtWeekRange(startOfWeek(cursor), endOfWeek(cursor));
    return fmtDayLong(cursor);
  }, [viewMode, cursor]);

  // Month grid cells (6 weeks × 7 days)
  const cells = useMemo(() => {
    const start = startOfMonth(cursor);
    const dayOfWeek = start.getDay(); // 0=Sun
    const gridStart = addDays(start, -((dayOfWeek + 6) % 7)); // Monday start
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  function eventsForDay(d: Date): CalendarEvent[] {
    return events.filter((e) => {
      const s = new Date(e.startsAt);
      const ed = new Date(e.endsAt);
      // Un événement apparait si la journée `d` est dans [s, e]
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      return s <= dayEnd && ed >= dayStart;
    });
  }

  function toggleCalendar(id: string) {
    setVisibleCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleEventClick(e: CalendarEvent) {
    if (e.kind === "MEETING" && e.meetingId) {
      router.push(`/calendar/meetings/${e.meetingId}`);
      return;
    }
    // TODO: event detail drawer — v1 : juste une alert
    alert(
      `${e.title}\n${new Date(e.startsAt).toLocaleString("fr-CA")} → ${new Date(e.endsAt).toLocaleString("fr-CA")}\n\n${e.description ?? ""}`,
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
            Calendrier
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => step(-1)}
              className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="h-8 px-3 rounded-md text-[12px] font-medium text-slate-600 hover:bg-slate-100"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => step(1)}
              className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 text-[14px] font-medium capitalize text-slate-700 tabular-nums">
              {rangeLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Switcher Mois / Semaine / Jour */}
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-inset ring-slate-200/60">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={cn(
                  "px-2.5 h-7 rounded-md text-[11.5px] font-medium transition-all",
                  viewMode === v
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                    : "text-slate-500",
                )}
              >
                {v === "month" ? "Mois" : v === "week" ? "Semaine" : "Jour"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={reloadEvents} disabled={loading}>
            <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualiser
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nouvel événement
          </Button>
        </div>
      </div>

      {/* Calendar picker + grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Sidebar: calendar toggles */}
        <Card>
          <CardContent className="p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
              Calendriers
            </h3>
            <div className="space-y-1">
              {calendars.map((c) => {
                const visible = visibleCalendarIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCalendar(c.id)}
                    className={cn(
                      "flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-left text-[12.5px] transition-colors",
                      visible ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:bg-slate-50",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: visible ? c.color : undefined,
                        borderColor: c.color,
                        borderWidth: visible ? 0 : 2,
                        borderStyle: "solid",
                      }}
                    />
                    <span className="truncate flex-1">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Grille — rendu selon viewMode */}
        {viewMode === "month" && (
          <MonthGrid
            cells={cells}
            cursor={cursor}
            eventsForDay={eventsForDay}
            onEventClick={handleEventClick}
          />
        )}
        {viewMode === "week" && (
          <TimeGrid
            days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
            events={events}
            onEventClick={handleEventClick}
          />
        )}
        {viewMode === "day" && (
          <TimeGrid
            days={[startOfDay(cursor)]}
            events={events}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      {showCreate && (
        <CreateEventModal
          calendars={calendars}
          defaultDate={cursor}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reloadEvents();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month grid (6 weeks × 7 days)
// ---------------------------------------------------------------------------
function MonthGrid({
  cells,
  cursor,
  eventsForDay,
  onEventClick,
}: {
  cells: Date[];
  cursor: Date;
  eventsForDay: (d: Date) => CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d} className="px-3 py-2 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 h-[calc(100vh-240px)] min-h-[500px]">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, new Date());
          const dayEvents = eventsForDay(d);
          return (
            <div
              key={i}
              className={cn(
                "border-b border-r border-slate-200 p-1.5 overflow-hidden flex flex-col gap-0.5",
                !inMonth && "bg-slate-50/40",
              )}
            >
              <div className="flex items-center justify-between shrink-0">
                <span
                  className={cn(
                    "text-[11px] font-medium tabular-nums",
                    isToday
                      ? "bg-blue-600 text-white rounded-full h-5 w-5 flex items-center justify-center"
                      : inMonth
                      ? "text-slate-700"
                      : "text-slate-400",
                  )}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 min-h-0">
                {dayEvents.slice(0, 4).map((e) => {
                  const Icon = KIND_ICONS[e.kind] ?? CalIcon;
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-left truncate hover:brightness-95 transition-all"
                      style={{ backgroundColor: e.calendar.color + "22", color: e.calendar.color }}
                      title={e.title}
                    >
                      <Icon className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{e.title}</span>
                    </button>
                  );
                })}
                {dayEvents.length > 4 && (
                  <span className="text-[9.5px] text-slate-500 px-1.5">
                    +{dayEvents.length - 4} autres
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TimeGrid (vue Semaine ou Jour) — bandeau all-day en haut + grille
// horaire DAY_START_HOUR → DAY_END_HOUR avec events positionnés absolument
// selon leur start/end.
// ---------------------------------------------------------------------------
function TimeGrid({
  days,
  events,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const totalHours = DAY_END_HOUR - DAY_START_HOUR;
  const gridHeight = totalHours * HOUR_HEIGHT;

  // Sépare all-day vs timed events
  function splitDayEvents(day: Date) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const overlap = events.filter((e) => {
      const s = new Date(e.startsAt);
      const ed = new Date(e.endsAt);
      return s <= dayEnd && ed >= dayStart;
    });
    return {
      allDay: overlap.filter((e) => e.allDay),
      timed: overlap.filter((e) => !e.allDay),
    };
  }

  // Position d'un événement timed dans la grille horaire du jour
  function positionFor(e: CalendarEvent, day: Date) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const s = new Date(e.startsAt);
    const ed = new Date(e.endsAt);
    // Clamp au jour courant
    const visibleStart = s < dayStart ? dayStart : s;
    const visibleEnd = ed > dayEnd ? dayEnd : ed;
    const startMinutesInDay = Math.max(
      DAY_START_HOUR * 60,
      visibleStart.getHours() * 60 + visibleStart.getMinutes(),
    );
    const endMinutesInDay = Math.min(
      DAY_END_HOUR * 60,
      visibleEnd.getHours() * 60 + visibleEnd.getMinutes(),
    );
    const top = ((startMinutesInDay - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max(18, ((endMinutesInDay - startMinutesInDay) / 60) * HOUR_HEIGHT);
    return { top, height };
  }

  return (
    <Card className="overflow-hidden">
      {/* Header avec les noms de jour */}
      <div
        className="grid bg-slate-50/60 border-b border-slate-200"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div /> {/* spacer pour la col des heures */}
        {days.map((d) => {
          const isToday = isSameDay(d, new Date());
          return (
            <div key={d.toISOString()} className="px-3 py-2 text-center border-l border-slate-200 first:border-l-0">
              <p className="text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">
                {d.toLocaleDateString("fr-CA", { weekday: "short" })}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[14px] font-semibold tabular-nums inline-flex h-7 w-7 items-center justify-center rounded-full",
                  isToday ? "bg-blue-600 text-white" : "text-slate-800",
                )}
              >
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* All-day band */}
      <div
        className="grid border-b border-slate-200 bg-slate-50/30"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="px-2 py-1 text-[9.5px] text-slate-400 uppercase tracking-wider text-right">
          jour
        </div>
        {days.map((d) => {
          const { allDay } = splitDayEvents(d);
          return (
            <div key={d.toISOString()} className="border-l border-slate-200 first:border-l-0 p-1 min-h-[28px] flex flex-col gap-0.5">
              {allDay.map((e) => {
                const Icon = KIND_ICONS[e.kind] ?? CalIcon;
                return (
                  <button
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-left truncate hover:brightness-95 transition-all"
                    style={{ backgroundColor: e.calendar.color + "22", color: e.calendar.color }}
                    title={e.title}
                  >
                    <Icon className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{e.title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Hour grid */}
      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
            height: gridHeight,
          }}
        >
          {/* Colonne des heures */}
          <div className="relative">
            {Array.from({ length: totalHours }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-[10px] text-slate-400 tabular-nums"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {String(DAY_START_HOUR + i).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {days.map((d) => {
            const { timed } = splitDayEvents(d);
            return (
              <div
                key={d.toISOString()}
                className="relative border-l border-slate-200 first:border-l-0"
              >
                {/* Horizontales toutes les heures */}
                {Array.from({ length: totalHours + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-slate-100"
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}
                {/* Events */}
                {timed.map((e) => {
                  const { top, height } = positionFor(e, d);
                  const Icon = KIND_ICONS[e.kind] ?? CalIcon;
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className="absolute left-1 right-1 rounded px-1.5 py-1 text-left text-[10.5px] overflow-hidden hover:brightness-95 transition-all"
                      style={{
                        top,
                        height,
                        backgroundColor: e.calendar.color + "22",
                        color: e.calendar.color,
                        borderLeft: `3px solid ${e.calendar.color}`,
                      }}
                      title={e.title}
                    >
                      <div className="flex items-center gap-1">
                        <Icon className="h-2.5 w-2.5 shrink-0" />
                        <span className="font-semibold truncate">{e.title}</span>
                      </div>
                      <p className="text-[9.5px] opacity-70 tabular-nums">
                        {new Date(e.startsAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {new Date(e.endsAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {e.owner && (
                        <p className="text-[9.5px] opacity-70 truncate">
                          {e.owner.firstName} {e.owner.lastName}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create event modal (simple v1)
// ---------------------------------------------------------------------------
function CreateEventModal({
  calendars,
  defaultDate,
  onClose,
  onCreated,
}: {
  calendars: Calendar[];
  defaultDate: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = defaultDate.toISOString().slice(0, 10);
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CalendarEvent["kind"]>("OTHER");
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(today);
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly" | "yearly">("none");
  const [renewalAmount, setRenewalAmount] = useState("");
  const [renewalNotifyDays, setRenewalNotifyDays] = useState("14");
  const [renewalType, setRenewalType] = useState("");
  const [renewalExternalRef, setRenewalExternalRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [ownerId, setOwnerId] = useState<string>("");

  useEffect(() => {
    fetch("/api/v1/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; name: string; firstName: string; lastName: string }>) => {
        setUsers(arr.map((u) => ({ id: u.id, name: u.name || `${u.firstName} ${u.lastName}` })));
      })
      .catch(() => {});
  }, []);

  // Synchronise le kind avec la nature du calendrier sélectionné
  useEffect(() => {
    const cal = calendars.find((c) => c.id === calendarId);
    if (!cal) return;
    if (cal.kind === "RENEWALS") setKind("RENEWAL");
    else if (cal.kind === "LEAVE") setKind("LEAVE");
    // GENERAL et CUSTOM : laisse l'utilisateur choisir
  }, [calendarId, calendars]);

  async function submit() {
    if (!calendarId || !title.trim()) return;
    setSaving(true);
    try {
      const startsAt = allDay
        ? new Date(startDate).toISOString()
        : new Date(`${startDate}T${startTime}:00`).toISOString();
      const endsAt = allDay
        ? new Date(endDate + "T23:59:59").toISOString()
        : new Date(`${endDate}T${endTime}:00`).toISOString();
      const res = await fetch("/api/v1/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId,
          title,
          kind,
          startsAt,
          endsAt,
          allDay,
          description: description || undefined,
          location: location || undefined,
          ownerId: ownerId || undefined,
          recurrence: recurrence !== "none" ? recurrence : undefined,
          renewalType: kind === "RENEWAL" ? (renewalType || undefined) : undefined,
          renewalAmount: kind === "RENEWAL" && renewalAmount ? Number(renewalAmount) : undefined,
          renewalNotifyDaysBefore: kind === "RENEWAL" && renewalNotifyDays ? Number(renewalNotifyDays) : undefined,
          renewalExternalRef: kind === "RENEWAL" ? (renewalExternalRef || undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Erreur ${res.status}`);
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div className="relative w-full max-w-lg my-4 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Nouvel événement</h2>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500">Calendrier</label>
            <Select value={calendarId} onValueChange={setCalendarId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {calendars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Renouvellement SSL hvac.ca" />
          <div>
            <label className="text-[11px] font-medium text-slate-500">Type</label>
            <Select value={kind} onValueChange={(v) => setKind(v as CalendarEvent["kind"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEETING">Rencontre interne</SelectItem>
                <SelectItem value="RENEWAL">Renouvellement</SelectItem>
                <SelectItem value="LEAVE">Congé / absence</SelectItem>
                <SelectItem value="WORK_LOCATION">Localisation de travail</SelectItem>
                <SelectItem value="PERSONAL">Personnel</SelectItem>
                <SelectItem value="OTHER">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" label="Début" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            {!allDay && <Input type="time" label="Heure" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" label="Fin" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            {!allDay && <Input type="time" label="Heure" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-600">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Toute la journée
          </label>
          {(kind === "LEAVE" || kind === "WORK_LOCATION" || kind === "PERSONAL") && (
            <div>
              <label className="text-[11px] font-medium text-slate-500">Agent concerné</label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un agent" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "WORK_LOCATION" && (
            <Input label="Emplacement" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Chez HVAC, Bureau, Télétravail" />
          )}

          {kind === "RENEWAL" && (
            <div className="space-y-2 rounded-lg bg-amber-50/50 border border-amber-200 p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-700">
                Détails du renouvellement
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">Type</label>
                  <Select value={renewalType} onValueChange={setRenewalType}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="license">Licence logicielle</SelectItem>
                      <SelectItem value="ssl">Certificat SSL</SelectItem>
                      <SelectItem value="subscription">Abonnement</SelectItem>
                      <SelectItem value="warranty">Garantie matériel</SelectItem>
                      <SelectItem value="contract">Contrat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  label="Montant (CAD)"
                  value={renewalAmount}
                  onChange={(e) => setRenewalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Input
                label="Référence externe"
                value={renewalExternalRef}
                onChange={(e) => setRenewalExternalRef(e.target.value)}
                placeholder="N° commande, domaine SSL, etc."
              />
              <Input
                type="number"
                label="Notifier N jours avant"
                value={renewalNotifyDays}
                onChange={(e) => setRenewalNotifyDays(e.target.value)}
              />
              <p className="text-[10.5px] text-amber-700">
                Une notification sera envoyée aux admins MSP + à l&apos;agent concerné à l&apos;approche de l&apos;échéance.
              </p>
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-500">Récurrence</label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as "none" | "weekly" | "monthly" | "yearly")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune</SelectItem>
                <SelectItem value="weekly">Chaque semaine</SelectItem>
                <SelectItem value="monthly">Chaque mois</SelectItem>
                <SelectItem value="yearly">Chaque année</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500">Description (optionnel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!title.trim() || !calendarId}>
            <Briefcase className="h-3.5 w-3.5" />
            Créer
          </Button>
        </div>
      </div>
    </div>
  );
}
