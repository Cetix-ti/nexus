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
function fmtDay(d: Date) {
  return d.toLocaleDateString("fr-CA", { weekday: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CalendarPage() {
  const router = useRouter();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set());
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

  // Load events when month or visible calendars change
  const reloadEvents = () => {
    const from = startOfMonth(cursor).toISOString();
    const to = endOfMonth(cursor).toISOString();
    const ids = Array.from(visibleCalendarIds).join(",");
    const qs = new URLSearchParams({ from, to });
    if (ids) qs.set("calendarIds", ids);
    setLoading(true);
    fetch(`/api/v1/calendar-events?${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: CalendarEvent[]) => setEvents(arr))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  };
  useEffect(reloadEvents, [cursor, visibleCalendarIds]);

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
            Calendrier
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCursor(startOfMonth(new Date()))}
              className="h-8 px-3 rounded-md text-[12px] font-medium text-slate-600 hover:bg-slate-100"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 text-[14px] font-medium capitalize text-slate-700 tabular-nums">
              {fmtMonth(cursor)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

        {/* Month grid */}
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
                          onClick={() => handleEventClick(e)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-left truncate hover:brightness-95 transition-all"
                          style={{
                            backgroundColor: e.calendar.color + "22",
                            color: e.calendar.color,
                          }}
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
