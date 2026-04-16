"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
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
  X,
  Pencil,
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
import { MultiSelect } from "@/components/ui/multi-select";

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
  siteId: string | null;
  site: { id: string; name: string; city: string | null } | null;
  meetingId: string | null;
  calendar: { id: string; name: string; kind: string; color: string };
  owner: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  organization: {
    id: string;
    name: string;
    clientCode?: string | null;
    logo?: string | null;
    isInternal?: boolean;
  } | null;
  meeting: { id: string; status: string } | null;
  renewalType: string | null;
  renewalAmount: number | null;
  renewalNotifyDaysBefore: number | null;
  renewalExternalRef: string | null;
  leaveType: string | null;
  recurrence: "weekly" | "monthly" | "yearly" | null;
  recurrenceEndDate: string | null;
  internalTicketId: string | null;
  internalProjectId: string | null;
  internalTicket: { id: string; number: number; subject: string; status: string } | null;
  internalProject: { id: string; code: string; name: string; status: string } | null;
  linkedTickets?: Array<{
    id: string;
    number: number;
    subject: string;
    status: string;
    priority: string;
    isInternal: boolean;
    organizationId: string;
    assigneeId: string | null;
    assignee: { firstName: string; lastName: string } | null;
  }>;
  // Multi-agents : pour les WORK_LOCATION "MG/VG MRVL" (2 agents, 1 event).
  // Peut être absent (anciens events, ou kinds LEAVE/PERSONAL qui restent
  // mono-agent via ownerId).
  agents?: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      avatar: string | null;
    };
  }>;
  // Sync Outlook — permet de distinguer les events créés côté Nexus vs
  // importés d'Outlook, et de signaler les titres qui n'ont pas pu être
  // décodés ("MG LOGICIEL" → client inconnu par ex.).
  outlookEventId?: string | null;
  outlookCalendarId?: string | null;
  rawTitle?: string | null;
  syncStatus?: "OK" | "UNDECODED" | "ERROR" | "PENDING" | null;
  syncError?: string | null;
  lastSyncedAt?: string | null;
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
// CalendarBoard — UI réutilisable du calendrier (header + sidebar + grille
// + modales). Exporté nommé pour être embarqué dans le Tableau de bord sans
// dupliquer les ~800 lignes de logique. La version "page" standalone
// rajoute simplement une balise h1 et des marges — voir `CalendarPage`
// à la toute fin du fichier.
// ---------------------------------------------------------------------------
export function CalendarBoard({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "month";
    const saved = window.localStorage.getItem("calendar.viewMode");
    return (saved === "week" || saved === "day" || saved === "month") ? saved : "month";
  });
  // Cursor initial ALIGNÉ au viewMode restauré depuis localStorage.
  // Avant : cursor = startOfMonth(today) même si viewMode restauré était
  // "week" → la vue semaine ouvrait sur la semaine du 1er du mois
  // (Mar 30–Apr 5 si on est en avril) → zéro événement visible. Le user
  // voyait "aucune donnée" au chargement tant qu'il n'avait pas cliqué
  // "Aujourd'hui". On initialise correctement selon la vue.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    if (typeof window === "undefined") return startOfMonth(now);
    const saved = window.localStorage.getItem("calendar.viewMode");
    if (saved === "week") return startOfWeek(now);
    if (saved === "day") return startOfDay(now);
    return startOfMonth(now);
  });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Persiste le mode de vue à chaque changement.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("calendar.viewMode", viewMode);
    }
  }, [viewMode]);

  // Load calendars + restaure la sélection visible depuis localStorage si présente.
  useEffect(() => {
    fetch("/api/v1/calendars")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Calendar[]) => {
        setCalendars(arr);
        const ids = arr.map((c) => c.id);
        let initial: Set<string> = new Set(ids);
        if (typeof window !== "undefined") {
          try {
            const saved = window.localStorage.getItem("calendar.visibleIds");
            if (saved) {
              const parsed = JSON.parse(saved) as string[];
              if (Array.isArray(parsed)) {
                // Garde uniquement les ids qui existent encore (un calendrier
                // peut avoir été supprimé depuis la dernière session).
                const filtered = parsed.filter((id) => ids.includes(id));
                if (filtered.length > 0) initial = new Set(filtered);
              }
            }
          } catch {}
        }
        setVisibleCalendarIds(initial);
      })
      .catch(() => {});
  }, []);

  // Persiste la sélection visible à chaque changement.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (visibleCalendarIds.size === 0) return; // ne pas écraser avant init
    try {
      window.localStorage.setItem(
        "calendar.visibleIds",
        JSON.stringify(Array.from(visibleCalendarIds)),
      );
    } catch {}
  }, [visibleCalendarIds]);

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

  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  async function handleEventClick(e: CalendarEvent) {
    if (e.kind === "MEETING" && e.meetingId) {
      router.push(`/calendar/meetings/${e.meetingId}`);
      return;
    }
    setDetailEvent(e);
  }

  async function handleDeleteEvent(e: CalendarEvent) {
    const ok = window.confirm(`Supprimer définitivement « ${e.title} » ?`);
    if (!ok) return;
    // L'id peut être un id-occurrence "xxx@ISO" — le endpoint gère déjà
    // la normalisation. La suppression affecte toute la série.
    const res = await fetch(`/api/v1/calendar-events/${encodeURIComponent(e.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Suppression impossible");
      return;
    }
    setDetailEvent(null);
    reloadEvents();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {!embedded && (
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
              Calendrier
            </h1>
          )}
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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Switcher Mois / Semaine / Jour */}
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-inset ring-slate-200/60">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => {
                  // Au changement de vue, on snappe le cursor sur la
                  // période CONTENANT AUJOURD'HUI. Avant : on conservait
                  // le cursor du mois (=1er du mois) → en switchant vers
                  // Semaine on atterrissait sur la semaine du 1er (ex:
                  // Mar 30–Apr 5) — souvent vide → user voit "aucune
                  // donnée". Snapping à today donne une vue utile par
                  // défaut. Pour naviguer dans le passé, boutons ‹ ›
                  // restent disponibles.
                  setViewMode(v);
                  const now = new Date();
                  if (v === "month") setCursor(startOfMonth(now));
                  else if (v === "week") setCursor(startOfWeek(now));
                  else setCursor(startOfDay(now));
                }}
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
            {/* Libellé "Actualiser" masqué sur mobile pour économiser la
                largeur — l'icône + l'état disabled suffisent. */}
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {/* Sur mobile on ne garde que "Nouveau" pour éviter le
                débordement horizontal du header (l'ensemble switcher+
                Actualiser+Nouvel-événement dépassait la largeur écran
                sur < 640 px → le dernier bouton sortait du viewport). */}
            <span className="hidden sm:inline">Nouvel événement</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        </div>
      </div>

      {/* Calendar picker + grid */}
      {/* Layout sidebar + grille calendrier.
          - <lg (<1024 px)            : stack vertical (sidebar au-dessus)
          - lg à 2xl (1024-1535 px)   : sidebar 192 px (plus étroite) pour
            laisser un max d'espace à la grille — cible les laptops
            14" à 150% scaling (1920×1200 natif → 1280 CSS px)
          - 2xl+ (≥1536 px)           : sidebar 240 px, retour au confort
            original des grands écrans */}
      <div className="grid grid-cols-1 lg:grid-cols-[192px_1fr] 2xl:grid-cols-[240px_1fr] gap-3 lg:gap-4">
        {/* Sidebar: calendar toggles */}
        <Card>
          <CardContent className="p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
              Calendriers
            </h3>
            <div className="space-y-1">
              {/* Ordre préféré : le calendrier GENERAL (« Localisation »)
                  en tête, puis Renouvellements, puis Congés, puis le
                  reste alphabétique. */}
              {[...calendars]
                .sort((a, b) => {
                  const order: Record<string, number> = { GENERAL: 0, RENEWALS: 1, LEAVE: 2, CUSTOM: 3 };
                  const da = order[a.kind] ?? 99;
                  const db = order[b.kind] ?? 99;
                  if (da !== db) return da - db;
                  return a.name.localeCompare(b.name, "fr");
                })
                .map((c) => {
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
            onDayClick={(d) => {
              // Uniquement actif sur mobile (sm:cursor-default masque
              // l'intention sur desktop). Sur desktop la tuile en
              // elle-même porte déjà l'interaction clic event.
              setViewMode("day");
              setCursor(startOfDay(d));
            }}
          />
        )}
        {viewMode === "week" && (
          <>
            {/* Mobile : grille 2 colonnes × ~4 rangées (style OneCalendar).
                TimeGrid en timeline horizontale est illisible sur 375 px
                (cols de ~50 px). Ici chaque jour est une carte avec son
                en-tête + la liste compacte des events du jour. */}
            <div className="sm:hidden">
              <MobileWeekGrid
                days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
                events={events}
                onEventClick={handleEventClick}
                onDayClick={(d) => {
                  setViewMode("day");
                  setCursor(startOfDay(d));
                }}
              />
            </div>
            <div className="hidden sm:block">
              <TimeGrid
                days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
                events={events}
                onEventClick={handleEventClick}
              />
            </div>
          </>
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
          onSaved={() => {
            setShowCreate(false);
            reloadEvents();
          }}
        />
      )}

      {editEvent && (
        <CreateEventModal
          calendars={calendars}
          defaultDate={cursor}
          editing={editEvent}
          onClose={() => setEditEvent(null)}
          onSaved={() => {
            setEditEvent(null);
            setDetailEvent(null);
            reloadEvents();
          }}
        />
      )}

      {detailEvent && (
        <EventDetailDrawer
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onEdit={() => {
            // IMPORTANT : on ferme le drawer de détail en même temps qu'on
            // ouvre la modal d'édition. Sans ça, le drawer restait visible
            // par-dessus l'éditeur (même z-index que la modal, mais rendu
            // plus tard dans le JSX → stacking au-dessus).
            setEditEvent(detailEvent);
            setDetailEvent(null);
          }}
          onDelete={() => handleDeleteEvent(detailEvent)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event detail drawer — affiche un event non-MEETING avec actions modifier/supprimer
// ---------------------------------------------------------------------------
function EventDetailDrawer({
  event,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = KIND_ICONS[event.kind] ?? CalIcon;
  const dur = Math.round((new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60_000);
  const orgLink = event.organization
    ? `/organisations/${encodeURIComponent((event.organization as { clientCode?: string; slug?: string }).clientCode || (event.organization as { slug?: string }).slug || event.organizationId || "")}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-4 rounded-2xl bg-white shadow-2xl min-h-[360px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors z-10"
          title="Fermer"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
        <div
          className="border-b border-slate-200 px-7 py-5 pr-16 rounded-t-2xl"
          style={{ borderLeftWidth: 4, borderLeftColor: event.calendar.color }}
        >
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            <Icon className="h-3 w-3" />
            {event.calendar.name}
            {" · "}
            {event.kind}
          </div>
          <h2 className="mt-1.5 text-[18px] font-semibold text-slate-900">{event.title}</h2>
        </div>

        <div className="p-7 space-y-4 text-[13px]">
          <div>
            <p className="text-[11px] font-medium text-slate-500">Quand</p>
            <p className="text-slate-700 tabular-nums">
              {(() => {
                const s = new Date(event.startsAt);
                const e = new Date(event.endsAt);
                if (event.allDay) {
                  // Pour un event all-day, l'endsAt a été normalisé à
                  // 23:59:59.999 du dernier jour. On compare les dates
                  // calendaires pour savoir si c'est mono-jour ou plage.
                  const sameDay =
                    s.getFullYear() === e.getFullYear() &&
                    s.getMonth() === e.getMonth() &&
                    s.getDate() === e.getDate();
                  const startStr = s.toLocaleDateString("fr-CA", { dateStyle: "full" });
                  if (sameDay) return startStr;
                  const endStr = e.toLocaleDateString("fr-CA", { dateStyle: "full" });
                  return `${startStr} → ${endStr}`;
                }
                return `${s.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })} → ${e.toLocaleString("fr-CA", { timeStyle: "short" })}`;
              })()}
              {!event.allDay && <span className="text-slate-400 ml-1.5">({dur} min)</span>}
            </p>
          </div>

          {/* Multi-agents : liste complète pour WORK_LOCATION ; fallback
              sur owner seul pour les autres kinds. */}
          {(() => {
            const agentUsers = (event.agents ?? [])
              .map((a) => a.user)
              .filter((u): u is NonNullable<typeof u> => !!u);
            const list =
              agentUsers.length > 0
                ? agentUsers
                : event.owner
                  ? [event.owner]
                  : [];
            if (list.length === 0) return null;
            return (
              <div>
                <p className="text-[11px] font-medium text-slate-500">
                  {list.length > 1 ? "Agents concernés" : "Concerne"}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {list.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] text-slate-700"
                    >
                      {a.avatar ? (
                        <img
                          src={a.avatar}
                          alt=""
                          className="h-4 w-4 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-semibold text-white"
                          style={{ backgroundColor: event.calendar.color }}
                        >
                          {`${a.firstName?.[0] ?? ""}${a.lastName?.[0] ?? ""}`.toUpperCase()}
                        </span>
                      )}
                      {a.firstName} {a.lastName}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Synchronisation Outlook (WORK_LOCATION uniquement) —
              affiche l'origine, le statut de décodage, le titre brut,
              pour qu'un admin puisse diagnostiquer un event mal mappé. */}
          {event.kind === "WORK_LOCATION" && (event.outlookEventId || event.syncStatus) && (
            <div
              className={cn(
                "rounded-lg border p-3 space-y-1.5",
                event.syncStatus === "UNDECODED" || event.syncStatus === "ERROR"
                  ? "border-red-200 bg-red-50/60"
                  : "border-sky-200 bg-sky-50/50",
              )}
            >
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    "text-[10.5px] font-semibold uppercase tracking-wider",
                    event.syncStatus === "UNDECODED" || event.syncStatus === "ERROR"
                      ? "text-red-700"
                      : "text-sky-700",
                  )}
                >
                  Synchronisation Outlook
                </p>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                    event.syncStatus === "OK" && "bg-emerald-100 text-emerald-700",
                    event.syncStatus === "UNDECODED" && "bg-red-100 text-red-700",
                    event.syncStatus === "ERROR" && "bg-red-100 text-red-700",
                    event.syncStatus === "PENDING" && "bg-amber-100 text-amber-700",
                    !event.syncStatus && "bg-slate-100 text-slate-600",
                  )}
                >
                  {event.syncStatus === "OK" && "synchronisé"}
                  {event.syncStatus === "UNDECODED" && "non décodé"}
                  {event.syncStatus === "ERROR" && "erreur"}
                  {event.syncStatus === "PENDING" && "en attente"}
                  {!event.syncStatus && "—"}
                </span>
              </div>
              <p className="text-[11.5px] text-slate-600">
                Origine :{" "}
                <span className="font-medium text-slate-800">
                  {event.outlookEventId ? "Outlook (calendrier partagé)" : "Nexus"}
                </span>
              </p>
              {event.rawTitle && event.rawTitle !== event.title && (
                <p className="text-[11.5px] text-slate-600">
                  Titre brut Outlook :{" "}
                  <code className="rounded bg-white/70 px-1 py-0.5 text-[11px] text-slate-800">
                    {event.rawTitle}
                  </code>
                </p>
              )}
              {event.syncError && (
                <p className="text-[11.5px] text-red-700">
                  {event.syncError}
                  {event.syncStatus === "UNDECODED" && (
                    <span className="block mt-0.5 text-red-600/80">
                      Corrige le titre côté Outlook (ex: « BR LV ») ou édite
                      cet événement directement dans Nexus pour forcer le
                      mapping agents + client.
                    </span>
                  )}
                </p>
              )}
              {event.lastSyncedAt && (
                <p className="text-[10.5px] text-slate-400 tabular-nums">
                  Dernière synchro :{" "}
                  {new Date(event.lastSyncedAt).toLocaleString("fr-CA", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>
          )}

          {event.location && (
            <div>
              <p className="text-[11px] font-medium text-slate-500">Emplacement</p>
              <p className="text-slate-700">{event.location}</p>
            </div>
          )}

          {event.organization && (
            <div>
              <p className="text-[11px] font-medium text-slate-500">Client</p>
              {orgLink ? (
                <Link href={orgLink} className="text-blue-600 hover:underline">
                  {event.organization.name}
                </Link>
              ) : (
                <p className="text-slate-700">{event.organization.name}</p>
              )}
              {event.site && (
                <p className="mt-0.5 text-[11.5px] text-slate-500">
                  Site : {event.site.name}
                  {event.site.city ? ` — ${event.site.city}` : ""}
                </p>
              )}
            </div>
          )}

          {event.kind === "RENEWAL" && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1.5">
              {event.renewalType && (
                <p className="text-[12px]">
                  <span className="text-amber-700 font-medium">Type :</span> {event.renewalType}
                </p>
              )}
              {typeof event.renewalAmount === "number" && (
                <p className="text-[12px]">
                  <span className="text-amber-700 font-medium">Montant :</span> {event.renewalAmount.toFixed(2)} CAD
                </p>
              )}
              {event.renewalExternalRef && (
                <p className="text-[12px]">
                  <span className="text-amber-700 font-medium">Réf :</span> {event.renewalExternalRef}
                </p>
              )}
              {typeof event.renewalNotifyDaysBefore === "number" && (
                <p className="text-[11px] text-amber-700">
                  Notification J-{event.renewalNotifyDaysBefore}
                </p>
              )}
              {event.description && (
                <p className="text-[12px] text-amber-900 whitespace-pre-wrap">{event.description}</p>
              )}
            </div>
          )}

          {event.internalTicket && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">
                Ticket interne lié
              </p>
              <Link
                href={`/internal-tickets/${event.internalTicket.id}`}
                className="mt-1 block text-[12.5px] text-blue-700 hover:underline truncate"
              >
                #{event.internalTicket.number} — {event.internalTicket.subject}
              </Link>
            </div>
          )}

          {event.internalProject && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-violet-700">
                Projet interne lié
              </p>
              <Link
                href={`/internal-projects/${event.internalProject.id}`}
                className="mt-1 block text-[12.5px] text-violet-700 hover:underline truncate"
              >
                {event.internalProject.code} — {event.internalProject.name}
              </Link>
            </div>
          )}

          {/* Tickets liés à cette visite — planification "Ma journée". */}
          {event.kind === "WORK_LOCATION" && (
            <LinkedTicketsSection eventId={event.id} organizationId={event.organizationId} />
          )}

          {event.recurrence && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-600">
                Récurrence
              </p>
              <p className="text-[12px] text-slate-700">
                {event.recurrence === "weekly" && "Toutes les semaines"}
                {event.recurrence === "monthly" && "Tous les mois"}
                {event.recurrence === "yearly" && "Tous les ans"}
                {event.recurrenceEndDate && (
                  <span className="text-slate-500 ml-1.5">
                    jusqu&apos;au {new Date(event.recurrenceEndDate).toLocaleDateString("fr-CA")}
                  </span>
                )}
              </p>
            </div>
          )}

          {event.kind === "LEAVE" && event.leaveType && (
            <div>
              <p className="text-[11px] font-medium text-slate-500">Type de congé</p>
              <p className="text-slate-700">{event.leaveType}</p>
            </div>
          )}

          {event.description && event.kind !== "RENEWAL" && (
            <div>
              <p className="text-[11px] font-medium text-slate-500">Description</p>
              <p className="text-slate-700 whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-7 py-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600 hover:bg-red-50">
            <X className="h-3.5 w-3.5" />
            Supprimer
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
            <Button variant="primary" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedTicketsSection — tickets planifiés sur une visite WORK_LOCATION.
// Affiche la liste actuelle (filtrée display-time : seuls les tickets
// requiresOnSite=true + non résolus restent) + un bouton pour ouvrir un
// picker des autres tickets "à faire sur place" du même client, qu'on
// peut cocher pour ajouter au plan.
// ---------------------------------------------------------------------------
interface LinkedTicketRow {
  id: string;
  number: number;
  displayNumber?: string;
  subject: string;
  status: string;
  priority: string;
  isInternal: boolean;
  organizationId: string;
  assignee: { firstName: string; lastName: string } | null;
}

function LinkedTicketsSection({
  eventId,
  organizationId,
}: {
  eventId: string;
  organizationId: string | null;
}) {
  const [linked, setLinked] = useState<LinkedTicketRow[]>([]);
  const [clientPool, setClientPool] = useState<LinkedTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/calendar-events/${encodeURIComponent(eventId)}/linked-tickets`);
      if (!res.ok) return;
      const d = await res.json();
      setLinked(d.linked ?? []);
      setClientPool(d.clientOnSite ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function addTickets(ids: string[]) {
    if (ids.length === 0) return;
    const res = await fetch(`/api/v1/calendar-events/${encodeURIComponent(eventId)}/linked-tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketIds: ids }),
    });
    if (res.ok) {
      setPickerOpen(false);
      load();
    }
  }

  async function removeTicket(ticketId: string) {
    const res = await fetch(
      `/api/v1/calendar-events/${encodeURIComponent(eventId)}/linked-tickets?ticketId=${encodeURIComponent(ticketId)}`,
      { method: "DELETE" },
    );
    if (res.ok) load();
  }

  const priorityClass = (p: string): string => {
    switch (p?.toUpperCase()) {
      case "CRITICAL": return "text-red-600 bg-red-50 border-red-200";
      case "HIGH": return "text-orange-600 bg-orange-50 border-orange-200";
      case "MEDIUM": return "text-amber-600 bg-amber-50 border-amber-200";
      default: return "text-slate-500 bg-slate-50 border-slate-200";
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-600">
          Tickets planifiés sur cette visite
          {linked.length > 0 && (
            <span className="ml-1.5 text-slate-400">({linked.length})</span>
          )}
        </p>
        {organizationId && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-[11.5px] font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Ajouter depuis tickets sur site
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[11.5px] text-slate-400">Chargement…</p>
      ) : linked.length === 0 ? (
        <p className="text-[11.5px] text-slate-400">
          Aucun ticket lié. Utilise le bouton ci-dessus pour planifier les tickets « à faire sur place » de ce client.
        </p>
      ) : (
        <ul className="space-y-1">
          {linked.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5"
            >
              <Link
                href={t.isInternal ? `/internal-tickets/${t.id}` : `/tickets/${t.id}`}
                className="flex items-center gap-2 flex-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                <span className={cn(
                  "inline-flex items-center rounded border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider shrink-0",
                  priorityClass(t.priority),
                )}>
                  {t.priority}
                </span>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {t.displayNumber ?? `${t.isInternal ? "INT" : "TK"}-${1000 + t.number}`}
                </span>
                <span className="text-[12.5px] text-slate-700 truncate flex-1 hover:text-blue-600 hover:underline">
                  {t.subject}
                </span>
              </Link>
              {t.assignee && (
                <span className="text-[10.5px] text-slate-400 shrink-0">
                  {t.assignee.firstName[0]}. {t.assignee.lastName}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeTicket(t.id)}
                className="h-5 w-5 inline-flex items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                title="Retirer"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <OnSiteTicketPicker
          tickets={clientPool}
          onCancel={() => setPickerOpen(false)}
          onAdd={addTickets}
        />
      )}
    </div>
  );
}

function OnSiteTicketPicker({
  tickets,
  onCancel,
  onAdd,
}: {
  tickets: LinkedTicketRow[];
  onCancel: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-lg my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">
            Tickets « à faire sur place » chez ce client
          </h3>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Coche ceux que tu veux ajouter à ta planification pour cette visite.
          </p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-1.5">
          {tickets.length === 0 ? (
            <p className="text-[12px] text-slate-500 py-6 text-center">
              Aucun autre ticket « à faire sur place » chez ce client.
            </p>
          ) : (
            tickets.map((t) => {
              const checked = selected.has(t.id);
              return (
                <label
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer transition-colors",
                    checked
                      ? "border-blue-300 bg-blue-50/60"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(t.id)}
                    className="shrink-0"
                  />
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {t.displayNumber ?? `${t.isInternal ? "INT" : "TK"}-${1000 + t.number}`}
                  </span>
                  <span className="text-[12.5px] text-slate-800 truncate flex-1">
                    {t.subject}
                  </span>
                  {t.assignee && (
                    <span className="text-[10.5px] text-slate-400 shrink-0">
                      {t.assignee.firstName[0]}. {t.assignee.lastName}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => onAdd(Array.from(selected))}
          >
            Ajouter ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventTile — rendu d'un événement dans la grille mois/all-day/time.
// Pour WORK_LOCATION : avatar agent à gauche, titre au centre, nom du
// client à droite. Autres kinds : icône + titre classique.
// ---------------------------------------------------------------------------
function EventTile({
  event,
  onClick,
  compact = true,
}: {
  event: CalendarEvent;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = KIND_ICONS[event.kind] ?? CalIcon;
  const isWorkLoc = event.kind === "WORK_LOCATION";

  // Liste d'agents à afficher — pour les WORK_LOCATION "MG/VG MRVL", on a
  // 2 agents liés via la table de jointure. On fallback sur owner (1 agent)
  // pour les events créés sans agentIds et pour les autres kinds.
  const agentUsers = (event.agents ?? [])
    .map((a) => a.user)
    .filter((u): u is NonNullable<typeof u> => !!u);
  const displayedAgents =
    agentUsers.length > 0
      ? agentUsers
      : event.owner
        ? [event.owner]
        : [];

  // UNDECODED = titre Outlook qu'on n'a pas pu mapper (agent/client inconnu).
  // ERROR = push vers Graph a échoué. On signale visuellement pour qu'un
  // admin puisse cliquer et intervenir.
  const hasSyncIssue =
    event.syncStatus === "UNDECODED" || event.syncStatus === "ERROR";

  // Dérive le "kind visuel" d'un event WORK_LOCATION à partir des données.
  // On n'a pas stocké `locationKind` sur CalendarEvent — on l'infère :
  //   - agents vide + org interne → réunion d'équipe (company_meeting).
  //     Affiche le logo Cetix comme thumbnail principal.
  //   - agents présents + org null → événement perso (RDV, OFF, DENTISTE…).
  //     Affiche l'avatar agent + mention discrète "Perso".
  //   - sinon → visite client / bureau / télétravail normal.
  const isCompanyMeeting =
    isWorkLoc &&
    displayedAgents.length === 0 &&
    !!event.organization?.isInternal;
  const isPersonal =
    isWorkLoc &&
    displayedAgents.length > 0 &&
    !event.organization &&
    !hasSyncIssue;

  if (isWorkLoc) {
    const agentsTooltip = displayedAgents
      .map((a) => `${a.firstName} ${a.lastName}`)
      .join(", ");
    return (
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 w-full px-1.5 py-0.5 rounded text-[10.5px] text-left hover:brightness-95 transition-all min-w-0",
          hasSyncIssue && "ring-1 ring-red-400",
        )}
        style={{ backgroundColor: event.calendar.color + "22", color: event.calendar.color }}
        title={
          hasSyncIssue
            ? `⚠ ${event.syncError || "Titre non décodé"} — ${event.rawTitle || event.title}`
            : isCompanyMeeting
              ? `${event.title} · Réunion d'équipe`
              : isPersonal
                ? `${event.title} · Événement personnel${agentsTooltip ? ` · ${agentsTooltip}` : ""}`
                : `${event.title}${event.organization ? ` · ${event.organization.name}` : ""}${agentsTooltip ? ` · ${agentsTooltip}` : ""}`
        }
      >
        {/* Thumbnail à gauche — varie selon le type d'event. */}
        {isCompanyMeeting && event.organization?.logo ? (
          /* Réunion d'équipe → logo Cetix. Pas d'avatar agent (pas d'agent
             spécifique — la réunion concerne tout le monde). */
          <img
            src={event.organization.logo}
            alt={event.organization.name}
            className="h-4 w-4 rounded-sm object-contain bg-white ring-1 ring-white shrink-0"
          />
        ) : displayedAgents.length > 0 ? (
          /* Cluster d'avatars agents (overlap en cas de multi, max 3 + badge "+N") */
          <span className="flex -space-x-1 shrink-0">
            {displayedAgents.slice(0, 3).map((a) => {
              const initials =
                `${a.firstName?.[0] ?? ""}${a.lastName?.[0] ?? ""}`.toUpperCase();
              return a.avatar ? (
                <img
                  key={a.id}
                  src={a.avatar}
                  alt={`${a.firstName} ${a.lastName}`}
                  className="h-4 w-4 rounded-full object-cover ring-1 ring-white"
                />
              ) : (
                <span
                  key={a.id}
                  className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-semibold text-white ring-1 ring-white"
                  style={{ backgroundColor: event.calendar.color }}
                >
                  {initials}
                </span>
              );
            })}
            {displayedAgents.length > 3 && (
              <span
                className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-semibold text-white ring-1 ring-white"
                style={{ backgroundColor: event.calendar.color }}
              >
                +{displayedAgents.length - 3}
              </span>
            )}
          </span>
        ) : hasSyncIssue ? (
          <span className="h-4 w-4 rounded-full flex items-center justify-center shrink-0 bg-red-500 text-white text-[8px] font-bold">
            !
          </span>
        ) : (
          <Icon className="h-2.5 w-2.5 shrink-0" />
        )}
        {/* Titre (flex-1, truncate). Pas d'italique : la distinction
            "personnel" vs "télétravail" se fait déjà via le label à
            droite ("Perso"/"Équipe"/nom du client). Avant on italisait
            les events `isPersonal` (détection : agents + pas d'org) mais
            ce prédicat englobait aussi les TÉLÉTRAVAIL (pas d'org non
            plus), ce qui italisait des titres qui n'avaient pas lieu de
            l'être. Tant qu'on ne persiste pas `locationKind` sur le row,
            on reste neutre. */}
        <span className="truncate flex-1 min-w-0">
          {event.title}
        </span>
        {/* Indicateur à droite — client / "Équipe" / "Perso". */}
        {isCompanyMeeting ? (
          <span
            className={cn(
              "shrink-0 font-semibold opacity-75 truncate",
              compact ? "max-w-[80px] text-[9.5px]" : "max-w-[120px]",
            )}
          >
            Équipe
          </span>
        ) : isPersonal ? (
          <span
            className={cn(
              "shrink-0 font-medium opacity-60 truncate",
              compact ? "max-w-[60px] text-[9.5px]" : "max-w-[120px]",
            )}
          >
            Perso
          </span>
        ) : (
          event.organization && (
            <span
              className={cn(
                "shrink-0 font-medium opacity-75 truncate",
                compact ? "max-w-[60px] text-[9.5px]" : "max-w-[120px]",
              )}
            >
              {event.organization.name}
            </span>
          )
        )}
      </button>
    );
  }

  // Autres kinds — rendu classique
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-left truncate hover:brightness-95 transition-all"
      style={{ backgroundColor: event.calendar.color + "22", color: event.calendar.color }}
      title={event.title}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{event.title}</span>
    </button>
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
  onDayClick,
}: {
  cells: Date[];
  cursor: Date;
  eventsForDay: (d: Date) => CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  /** Tap sur une cellule → ouvre la vue Jour pour cette date. Utilisé
   *  sur mobile (≤640 px) où les events sont affichés en points seulement,
   *  pas en tuiles cliquables. */
  onDayClick?: (d: Date) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d} className="px-1 sm:px-3 py-2 text-center">
            {/* Sur mobile : 1ère lettre seule (L/M/M/J/V/S/D) pour que
                les 7 colonnes tiennent sans scroll horizontal. */}
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d.charAt(0)}</span>
          </div>
        ))}
      </div>
      {/* Hauteur de la grille mensuelle.
          - Formule : viewport - 240 px (header + sidebar MSP + marges)
          - min-h augmenté à 560 px (laptop 14" à 150% scaling = 800 CSS
            px de haut → 800-240=560 disponibles). Avant : 420 px forçait
            des cellules de ~70 px de haut, trop petit pour voir >2 events.
          - max-h 900 px évite que sur un écran ultra-large 4K la grille
            gonfle au point que chaque cellule fasse 150+ px (excès
            d'espace vertical). */}
      <div className="grid grid-cols-7 grid-rows-6 h-[calc(100vh-240px)] min-h-[560px] max-h-[900px]">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, new Date());
          const dayEvents = eventsForDay(d);
          return (
            <div
              key={i}
              onClick={() => onDayClick?.(d)}
              className={cn(
                "border-b border-r border-slate-200 p-0.5 sm:p-1.5 overflow-hidden flex flex-col gap-0.5",
                !inMonth && "bg-slate-50/40",
                // Sur mobile : la cellule entière est tappable (ouvre la
                // vue Jour). Sur desktop : tap via les tuiles directement.
                onDayClick && "sm:cursor-default cursor-pointer active:bg-slate-100/70",
              )}
            >
              <div className="flex items-center justify-between shrink-0">
                <span
                  className={cn(
                    "text-[10px] sm:text-[11px] font-medium tabular-nums",
                    isToday
                      ? "bg-blue-600 text-white rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center text-[9px] sm:text-[11px]"
                      : inMonth
                      ? "text-slate-700"
                      : "text-slate-400",
                  )}
                >
                  {d.getDate()}
                </span>
              </div>

              {/* Desktop (sm+) : tuiles d'event normales, cliquables. */}
              <div className="hidden sm:flex flex-1 overflow-y-auto flex-col gap-0.5 min-h-0">
                {dayEvents.slice(0, 4).map((e) => (
                  <EventTile key={e.id} event={e} onClick={() => onEventClick(e)} />
                ))}
                {dayEvents.length > 4 && (
                  <span className="text-[9.5px] text-slate-500 px-1.5">
                    +{dayEvents.length - 4} autres
                  </span>
                )}
              </div>

              {/* Mobile (<sm) : points colorés par calendrier. Les tuiles
                  complètes sont illisibles sur 50 px de large → on donne
                  juste un signal visuel "il y a N events ce jour". Tap
                  sur la cellule → vue Jour. */}
              <div className="sm:hidden flex-1 flex flex-wrap content-start gap-0.5 pt-0.5 min-h-0 overflow-hidden">
                {dayEvents.slice(0, 6).map((e) => (
                  <span
                    key={e.id}
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: e.calendar.color }}
                    title={e.title}
                  />
                ))}
                {dayEvents.length > 6 && (
                  <span className="text-[8px] text-slate-500 leading-none">
                    +{dayEvents.length - 6}
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
// MobileWeekGrid — vue semaine sur mobile. 2 colonnes × ~4 rangées (le
// 7e jour finit tout seul sur la 4e rangée). Chaque cellule = carte
// "jour" avec numéro + liste compacte des events. Tap → vue Jour.
//
// Remplace la TimeGrid en timeline horizontale pour < 640 px, où les 7
// colonnes étroites rendaient les events illisibles. Format inspiré
// d'OneCalendar mobile.
// ---------------------------------------------------------------------------
function MobileWeekGrid({
  days,
  events,
  onEventClick,
  onDayClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onDayClick: (d: Date) => void;
}) {
  // Réplique la logique de TimeGrid pour les events d'une journée,
  // avec la même normalisation all-day (-1ms si fin à minuit) pour éviter
  // qu'un event apparaisse en double sur 2 jours.
  function eventsForDay(day: Date): CalendarEvent[] {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    return events.filter((e) => {
      const s = new Date(e.startsAt);
      let ed = new Date(e.endsAt);
      if (
        e.allDay &&
        ed.getHours() === 0 &&
        ed.getMinutes() === 0 &&
        ed.getSeconds() === 0 &&
        ed.getMilliseconds() === 0 &&
        ed.getTime() > s.getTime()
      ) {
        ed = new Date(ed.getTime() - 1);
      }
      return s <= dayEnd && ed >= dayStart;
    });
  }

  return (
    <Card className="overflow-hidden">
      {/* 2 cols. 7 jours → 3 rangées pleines + 1 cellule seule en bas-gauche. */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200">
        {days.map((d) => {
          const dayEvents = eventsForDay(d);
          const isToday = isSameDay(d, new Date());
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          // Tri : all-day d'abord, puis timed par heure.
          const sorted = [...dayEvents].sort((a, b) => {
            if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
            return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
          });
          return (
            <div
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              className={cn(
                "min-h-[128px] px-2 py-2 flex flex-col gap-1 active:bg-slate-100/70 cursor-pointer",
                isWeekend && "bg-slate-50/40",
                isToday && "bg-blue-50/40",
              )}
            >
              {/* Header de la carte jour */}
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    isToday ? "text-blue-700" : "text-slate-500",
                  )}
                >
                  {d.toLocaleDateString("fr-CA", { weekday: "short" })}
                </span>
                <span
                  className={cn(
                    "text-[15px] font-semibold tabular-nums",
                    isToday
                      ? "bg-blue-600 text-white rounded-full h-6 w-6 inline-flex items-center justify-center text-[12px]"
                      : "text-slate-900",
                  )}
                >
                  {d.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="ml-auto text-[9.5px] text-slate-400 tabular-nums">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* Liste compacte des events — max 4 visibles, +N le reste.
                  On intercepte le clic sur la tuile pour éviter que le
                  click-through ouvre aussi la vue Jour. */}
              <div className="flex-1 flex flex-col gap-0.5 min-h-0 overflow-hidden">
                {sorted.length === 0 ? (
                  <p className="text-[10.5px] text-slate-400 italic">Aucun</p>
                ) : (
                  <>
                    {sorted.slice(0, 4).map((e) => (
                      <button
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEventClick(e);
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-left hover:brightness-95 transition-all min-w-0"
                        style={{
                          backgroundColor: e.calendar.color + "22",
                          color: e.calendar.color,
                          borderLeft: `2px solid ${e.calendar.color}`,
                        }}
                      >
                        {!e.allDay && (
                          <span className="text-[9px] tabular-nums opacity-75 shrink-0">
                            {new Date(e.startsAt).toLocaleTimeString("fr-CA", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        <span className="truncate flex-1 min-w-0">{e.title}</span>
                      </button>
                    ))}
                    {sorted.length > 4 && (
                      <span className="text-[9.5px] text-slate-500 pl-1.5">
                        +{sorted.length - 4} autre{sorted.length - 4 > 1 ? "s" : ""}
                      </span>
                    )}
                  </>
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

  // Sépare all-day vs timed events.
  // Pour les events all-day importés depuis Outlook avant la normalisation
  // (end = minuit du jour suivant), l'overlap retombait sur 2 jours : le
  // tile apparaissait en double. On normalise ici à nouveau par sécurité
  // (si un event legacy subsiste non backfillé) en considérant la fin
  // comme exclusive quand elle est pile à minuit.
  function splitDayEvents(day: Date) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const overlap = events.filter((e) => {
      const s = new Date(e.startsAt);
      let ed = new Date(e.endsAt);
      if (
        e.allDay &&
        ed.getHours() === 0 &&
        ed.getMinutes() === 0 &&
        ed.getSeconds() === 0 &&
        ed.getMilliseconds() === 0 &&
        ed.getTime() > s.getTime()
      ) {
        ed = new Date(ed.getTime() - 1);
      }
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

  // Vue semaine : 7 colonnes étroites sont illisibles sur mobile.
  // On force une largeur minimale par colonne et on rend le tout
  // scrollable horizontalement à l'intérieur de la Card.
  const minColWidth = days.length > 1 ? 90 : 0; // jour-vue : pas de min, semaine : 90px/col
  return (
    <Card className="overflow-hidden">
     <div className="overflow-x-auto" style={{ minWidth: 0 }}>
      <div style={{ minWidth: minColWidth ? `${48 + days.length * minColWidth}px` : undefined }}>
      {/* Header avec les noms de jour */}
      <div
        className="grid bg-slate-50/60 border-b border-slate-200"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(${minColWidth}px, 1fr))` }}
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

      {/* All-day band. min-h-[32px] + py-1.5 donne assez d'espace pour ne
          pas que le label "jour" de la colonne des heures touche la
          première ligne 06:00 de la grille horaire (bug de chevauchement). */}
      <div
        className="grid border-b border-slate-200 bg-slate-50/30"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(${minColWidth}px, 1fr))` }}
      >
        <div className="px-2 py-1.5 text-[9.5px] text-slate-400 uppercase tracking-wider text-right self-center">
          jour
        </div>
        {days.map((d) => {
          const { allDay } = splitDayEvents(d);
          return (
            <div key={d.toISOString()} className="border-l border-slate-200 first:border-l-0 p-1 min-h-[28px] flex flex-col gap-0.5">
              {allDay.map((e) => (
                <EventTile key={e.id} event={e} onClick={() => onEventClick(e)} compact={false} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Hour grid — un padding-top de 8px évite que le premier label
          "06:00" (qui est positionné avec top=0) se colle au bandeau
          all-day au-dessus. */}
      <div className="overflow-y-auto pt-2" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(${minColWidth}px, 1fr))`,
            height: gridHeight,
          }}
        >
          {/* Colonne des heures. On ne soustrait plus -6 au premier
              label (sinon "06:00" dépasse vers le haut et chevauche le
              bandeau all-day). Chaque label reste aligné sur le trait
              horizontal de son heure. */}
          <div className="relative">
            {Array.from({ length: totalHours }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-[10px] text-slate-400 tabular-nums leading-none"
                style={{ top: i === 0 ? 0 : i * HOUR_HEIGHT - 6 }}
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
      </div>
     </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Modal création / édition d'un événement
// `editing` = null → création ; sinon on pré-remplit et on PATCH.
// ---------------------------------------------------------------------------
function CreateEventModal({
  calendars,
  defaultDate,
  editing,
  onClose,
  onSaved,
}: {
  calendars: Calendar[];
  defaultDate: Date;
  editing?: CalendarEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Date par défaut pour la création — exprimée en LOCAL pour rester
  // alignée avec ce que l'agent voit dans la grille.
  const today = (() => {
    const d = defaultDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const isEdit = !!editing;

  // Extrait les composantes date/heure d'une ISO string pour initialiser.
  function splitIso(iso: string): { date: string; time: string } {
    // IMPORTANT : on retourne la date ET l'heure dans le fuseau LOCAL.
    // Le bug précédent mixait `toISOString()` (UTC) pour la date et
    // `getHours()` (local) pour l'heure, donc dès qu'un événement croisait
    // minuit UTC, l'init du formulaire était décalée d'un jour. Au save,
    // `new Date(\`${date}T${time}:00\`)` reconstruisait une date local
    // shiftée de ~24h → l'utilisateur voyait l'événement disparaitre / pas
    // de changement quand il modifiait juste l'heure de fin.
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return { date: `${yyyy}-${mm}-${dd}`, time: `${h}:${m}` };
  }
  const initStart = editing ? splitIso(editing.startsAt) : { date: today, time: "09:00" };
  const initEnd = editing ? splitIso(editing.endsAt) : { date: today, time: "10:00" };

  // Défaut = calendrier GENERAL (aujourd'hui « Localisation »). Fallback
  // sur le premier calendrier dispo si aucun GENERAL n'existe (cas
  // pathologique). L'ancien « Agenda général » a été fusionné dans
  // « Localisation » — cf. scripts/remove-agenda-general.ts.
  const defaultCalendarId =
    editing?.calendarId ??
    calendars.find((c) => c.kind === "GENERAL")?.id ??
    calendars[0]?.id ??
    "";
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [title, setTitle] = useState(editing?.title ?? "");
  // Défaut type = WORK_LOCATION (~95% des événements à la création dans
  // l'agenda général). En édition, on respecte le kind existant.
  const [kind, setKind] = useState<CalendarEvent["kind"]>(editing?.kind ?? "WORK_LOCATION");
  const [startDate, setStartDate] = useState(initStart.date);
  const [startTime, setStartTime] = useState(initStart.time);
  const [endDate, setEndDate] = useState(initEnd.date);
  const [endTime, setEndTime] = useState(initEnd.time);
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  // Client + site — visibles sur calendrier général (ou quand WORK_LOCATION).
  const [organizationId, setOrganizationId] = useState<string>(editing?.organizationId ?? "");
  const [organizationName, setOrganizationName] = useState<string>(
    editing?.organization?.name ?? "",
  );
  const [orgSearch, setOrgSearch] = useState<string>(editing?.organization?.name ?? "");
  const [orgSuggestions, setOrgSuggestions] = useState<Array<{ id: string; name: string }>>([]);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [siteId, setSiteId] = useState<string>(editing?.siteId ?? "");
  const [sitesForOrg, setSitesForOrg] = useState<Array<{ id: string; name: string; city: string | null; isMain?: boolean }>>([]);
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly" | "yearly">(
    (editing as { recurrence?: "weekly" | "monthly" | "yearly" } | undefined)?.recurrence ?? "none",
  );
  const [renewalAmount, setRenewalAmount] = useState(
    editing?.renewalType ? String((editing as { renewalAmount?: number }).renewalAmount ?? "") : "",
  );
  const [renewalNotifyDays, setRenewalNotifyDays] = useState("14");
  const [renewalType, setRenewalType] = useState(editing?.renewalType ?? "");
  const [renewalExternalRef, setRenewalExternalRef] = useState(
    (editing as { renewalExternalRef?: string } | undefined)?.renewalExternalRef ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? "";
  // Défaut = l'agent qui crée l'événement (gain de temps : 95% des
  // WORK_LOCATION sont "ma propre localisation"). Modifiable au besoin.
  const [ownerId, setOwnerId] = useState<string>(editing?.ownerId ?? currentUserId);
  // Multi-agents : pour WORK_LOCATION "MG/VG MRVL" on peut sélectionner
  // plusieurs agents. Pour LEAVE/PERSONAL on garde ownerId single-select.
  // Source de vérité à l'édition : la liste `agents` si présente, sinon
  // le ownerId en repli. À la création : l'utilisateur courant (cohérent
  // avec ownerId default).
  const [agentIds, setAgentIds] = useState<string[]>(() => {
    if (editing?.agents && editing.agents.length > 0) {
      return editing.agents.map((a) => a.user.id);
    }
    if (editing?.ownerId) return [editing.ownerId];
    return currentUserId ? [currentUserId] : [];
  });
  const [internalTickets, setInternalTickets] = useState<Array<{ id: string; number: number; subject: string }>>([]);
  const [internalProjects, setInternalProjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [internalTicketId, setInternalTicketId] = useState<string>(editing?.internalTicketId ?? "");
  // Multi-liaisons : on tient la liste complète des tickets liés via
  // Ticket.calendarEventId. Quand l'event est ouvert en édition, on
  // initialise depuis `editing.linkedTickets` (vue serveur). L'ancien
  // `internalTicketId` scalaire est fusionné dedans pour back-compat.
  const [linkedTicketIds, setLinkedTicketIds] = useState<string[]>(() => {
    const ids = new Set<string>();
    const lt = (editing as { linkedTickets?: Array<{ id: string }> } | undefined)?.linkedTickets;
    if (Array.isArray(lt)) for (const t of lt) ids.add(t.id);
    if (editing?.internalTicketId) ids.add(editing.internalTicketId);
    return Array.from(ids);
  });
  const [internalProjectId, setInternalProjectId] = useState<string>(editing?.internalProjectId ?? "");

  useEffect(() => {
    fetch("/api/v1/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; name: string; firstName: string; lastName: string; avatar: string | null }>) => {
        setUsers(arr.map((u) => ({
          id: u.id,
          name: u.name || `${u.firstName} ${u.lastName}`,
          avatar: u.avatar ?? null,
        })));
      })
      .catch(() => {});
    // Pré-charge tickets + projets internes pour le sélecteur de lien.
    fetch("/api/v1/tickets?internal=true&limit=200")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; number: number; subject: string }>) => {
        if (Array.isArray(arr)) setInternalTickets(arr);
      })
      .catch(() => {});
    fetch("/api/v1/projects?internal=true")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d: { data?: Array<{ id: string; code: string; name: string }> }) => {
        setInternalProjects(d.data ?? []);
      })
      .catch(() => {});
  }, []);

  // Si les calendriers arrivent après le premier render (fetch async dans
  // le parent) ET qu'on est en création sans calendarId encore fixé,
  // bascule sur GENERAL dès qu'il est dispo.
  useEffect(() => {
    if (isEdit) return;
    if (calendarId) return;
    const general = calendars.find((c) => c.kind === "GENERAL")?.id ?? calendars[0]?.id;
    if (general) setCalendarId(general);
  }, [calendars, calendarId, isEdit]);

  // Même logique pour la session : si elle hydrate après le premier render,
  // synchronise ownerId sur moi-même tant qu'on n'a rien choisi.
  useEffect(() => {
    if (isEdit) return;
    if (ownerId) return;
    if (currentUserId) setOwnerId(currentUserId);
  }, [currentUserId, ownerId, isEdit]);

  // Idem pour agentIds : en création, si la session arrive tardivement,
  // initialise la liste d'agents avec l'utilisateur courant.
  useEffect(() => {
    if (isEdit) return;
    if (agentIds.length > 0) return;
    if (currentUserId) setAgentIds([currentUserId]);
  }, [currentUserId, agentIds, isEdit]);

  // Synchronise le kind avec la nature du calendrier sélectionné
  // (uniquement en mode création — en édition on respecte le kind existant).
  useEffect(() => {
    if (isEdit) return;
    const cal = calendars.find((c) => c.id === calendarId);
    if (!cal) return;
    if (cal.kind === "RENEWALS") setKind("RENEWAL");
    else if (cal.kind === "LEAVE") setKind("LEAVE");
  }, [calendarId, calendars, isEdit]);

  // Debounce l'autocomplete client : fetch /organizations?search=... après
  // 200ms d'inactivité clavier.
  useEffect(() => {
    const q = orgSearch.trim();
    if (q.length < 1) {
      setOrgSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/v1/organizations?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((arr) => {
          if (Array.isArray(arr)) {
            setOrgSuggestions(
              arr
                .filter((o: { isInternal?: boolean }) => !o.isInternal)
                .slice(0, 20)
                .map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })),
            );
          }
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [orgSearch]);

  // Charge les sites du client sélectionné (reset à chaque changement d'org).
  useEffect(() => {
    if (!organizationId) {
      setSitesForOrg([]);
      setSiteId("");
      return;
    }
    fetch(`/api/v1/sites?organizationId=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (Array.isArray(arr)) {
          setSitesForOrg(
            arr.map((s: { id: string; name: string; city: string; primary?: boolean }) => ({
              id: s.id,
              name: s.name,
              city: s.city === "—" ? null : s.city,
              isMain: s.primary,
            })),
          );
        }
      })
      .catch(() => {});
  }, [organizationId]);

  async function submit() {
    if (!calendarId || !title.trim()) return;

    // Validation fin > début
    const startsDate = allDay
      ? new Date(startDate)
      : new Date(`${startDate}T${startTime}:00`);
    const endsDate = allDay
      ? new Date(endDate + "T23:59:59")
      : new Date(`${endDate}T${endTime}:00`);
    if (endsDate <= startsDate) {
      setError("La fin doit être après le début.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // encodeURIComponent : un id de récurrence "xxx@2026-04-15T13:00:00.000Z"
      // contient `:` et `@` qui sans encodage peuvent embrouiller certains
      // routeurs / proxies. Le PATCH normalise déjà l'id côté serveur.
      const url = isEdit
        ? `/api/v1/calendar-events/${encodeURIComponent(editing.id)}`
        : "/api/v1/calendar-events";
      // Pour WORK_LOCATION on utilise agentIds[] comme source de vérité
      // multi-agents. Le ownerId est positionné sur le premier agent pour
      // rester cohérent avec le modèle de données (ownerId = "agent principal").
      // Les autres kinds (LEAVE/PERSONAL) continuent à utiliser ownerId seul.
      const effectiveOwnerId =
        kind === "WORK_LOCATION"
          ? (agentIds[0] ?? ownerId)
          : ownerId;
      const effectiveAgentIds =
        kind === "WORK_LOCATION" ? agentIds : undefined;

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId,
          title,
          kind,
          startsAt: startsDate.toISOString(),
          endsAt: endsDate.toISOString(),
          allDay,
          description: description || undefined,
          location: location || undefined,
          ownerId: effectiveOwnerId || undefined,
          agentIds: effectiveAgentIds,
          recurrence: recurrence !== "none" ? recurrence : null,
          renewalType: kind === "RENEWAL" ? (renewalType || undefined) : undefined,
          renewalAmount: kind === "RENEWAL" && renewalAmount ? Number(renewalAmount) : undefined,
          renewalNotifyDaysBefore: kind === "RENEWAL" && renewalNotifyDays ? Number(renewalNotifyDays) : undefined,
          renewalExternalRef: kind === "RENEWAL" ? (renewalExternalRef || undefined) : undefined,
          // Back-compat : on continue à envoyer internalTicketId (premier
          // ticket de la liste) pour les pièces qui s'y réfèrent (drawer
          // event, dashboard interne). La source N-to-1 est maintenant
          // linkedTicketIds[] côté serveur (Ticket.calendarEventId).
          internalTicketId: linkedTicketIds[0] || null,
          linkedTicketIds,
          internalProjectId: internalProjectId || null,
          organizationId: organizationId || null,
          siteId: siteId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Erreur ${res.status}`);
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  // On affiche le bloc Client/Site quand l'event peut pertinemment être
  // "chez un client" : type OTHER (défaut calendrier général), MEETING
  // (réunion possiblement sur site), WORK_LOCATION (sur site client).
  const showClientSite = kind === "OTHER" || kind === "MEETING" || kind === "WORK_LOCATION";
  // Ordre préféré du dropdown calendrier : GENERAL d'abord, puis RENEWALS,
  // LEAVE, puis le reste par nom. Le fait que le défaut soit GENERAL est
  // décidé plus haut (defaultCalendarId) mais la liste visible aussi doit
  // le montrer en tête.
  const calKindOrder: Record<string, number> = { GENERAL: 0, RENEWALS: 1, LEAVE: 2, CUSTOM: 3 };
  const sortedCalendars = [...calendars].sort((a, b) => {
    const da = calKindOrder[a.kind] ?? 99;
    const db = calKindOrder[b.kind] ?? 99;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, "fr");
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div className="relative w-full max-w-5xl my-4 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors z-10"
          title="Fermer"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-200 px-6 py-4 pr-14">
          <h2 className="text-[16px] font-semibold text-slate-900">
            {isEdit ? "Modifier l'événement" : "Nouvel événement"}
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {isEdit
              ? "Mets à jour les détails ci-dessous."
              : "Par défaut, l'événement est ajouté à l'agenda général."}
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* ================= COLONNE GAUCHE ================= */}
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-medium text-slate-500">Calendrier</label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sortedCalendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div>
              <label className="text-[11px] font-medium text-slate-500">Type</label>
              <Select value={kind} onValueChange={(v) => setKind(v as CalendarEvent["kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORK_LOCATION">Localisation de travail</SelectItem>
                  <SelectItem value="MEETING">Rencontre interne</SelectItem>
                  <SelectItem value="RENEWAL">Renouvellement</SelectItem>
                  <SelectItem value="LEAVE">Congé / absence</SelectItem>
                  <SelectItem value="PERSONAL">Personnel</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Case "toute la journée" — juste sous le dropdown Type. */}
            <label className="flex items-center gap-2 text-[12px] text-slate-600">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              Toute la journée
            </label>

            <div className="grid grid-cols-2 gap-2">
              <Input type="date" label="Début" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              {!allDay && <Input type="time" label="Heure" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" label="Fin" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {!allDay && <Input type="time" label="Heure" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
            </div>

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
          </div>

          {/* ================= COLONNE DROITE ================= */}
          <div className="space-y-4">
            {showClientSite && (
              <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-blue-700">
                  Chez un client (optionnel)
                </p>
                {/* Organization autocomplete */}
                <div className="relative">
                  <label className="text-[11px] font-medium text-slate-500">Client</label>
                  <div className="relative">
                    <Input
                      value={orgSearch}
                      onChange={(e) => {
                        setOrgSearch(e.target.value);
                        setOrgDropdownOpen(true);
                        // Si on efface tout ou modifie le nom sélectionné, on
                        // reset l'id pour forcer une re-sélection explicite.
                        if (e.target.value !== organizationName) {
                          setOrganizationId("");
                        }
                      }}
                      onFocus={() => setOrgDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setOrgDropdownOpen(false), 150)}
                      placeholder="Taper le nom d'un client…"
                    />
                    {organizationId && (
                      <button
                        type="button"
                        onClick={() => {
                          setOrganizationId("");
                          setOrganizationName("");
                          setOrgSearch("");
                          setSiteId("");
                          setSitesForOrg([]);
                        }}
                        className="absolute top-1/2 -translate-y-1/2 right-2 h-5 w-5 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Retirer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {orgDropdownOpen && orgSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                      {orgSuggestions.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setOrganizationId(o.id);
                            setOrganizationName(o.name);
                            setOrgSearch(o.name);
                            setOrgDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          {o.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Site selector (facultatif, dépend de l'org) */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500">
                    Site (facultatif)
                  </label>
                  <Select
                    value={siteId || "_none"}
                    onValueChange={(v) => setSiteId(v === "_none" ? "" : v)}
                    disabled={!organizationId || sitesForOrg.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!organizationId ? "Choisis d'abord un client" : sitesForOrg.length === 0 ? "Aucun site" : "—"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Aucun site précis</SelectItem>
                      {sitesForOrg.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.isMain ? "★ " : ""}{s.name}{s.city ? ` — ${s.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {kind === "WORK_LOCATION" && (
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  Agents concernés
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                    (plusieurs possibles, ex: « MG/VG MRVL »)
                  </span>
                </label>
                <MultiSelect
                  options={users.map((u) => ({ value: u.id, label: u.name }))}
                  selected={agentIds}
                  onChange={setAgentIds}
                  placeholder="Sélectionner un ou plusieurs agents"
                  width={520}
                />
              </div>
            )}
            {(kind === "LEAVE" || kind === "PERSONAL") && (
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

            {(kind === "WORK_LOCATION" || kind === "MEETING" || kind === "OTHER") && (
              <Input
                label="Emplacement / lieu (texte libre)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Salle conseil, Teams, 1234 rue X"
              />
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

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                Lier à une ressource interne (optionnel)
              </p>
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  Tickets liés
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                    (plusieurs possibles)
                  </span>
                </label>
                <MultiSelect
                  options={internalTickets.map((t) => ({
                    value: t.id,
                    label: `#${t.number} — ${t.subject}`,
                  }))}
                  selected={linkedTicketIds}
                  onChange={setLinkedTicketIds}
                  placeholder="Aucun ticket lié"
                  width={520}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">Projet interne</label>
                <Select value={internalProjectId || "_none"} onValueChange={(v) => setInternalProjectId(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Aucun</SelectItem>
                    {internalProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ================= PLEINE LARGEUR : DESCRIPTION ================= */}
          <div className="md:col-span-2">
            <label className="text-[11px] font-medium text-slate-500">Description (optionnel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Contexte, ordre du jour, notes…"
            />
          </div>

          {error && (
            <p className="md:col-span-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!title.trim() || !calendarId}>
            {isEdit ? (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Enregistrer
              </>
            ) : (
              <>
                <Briefcase className="h-3.5 w-3.5" />
                Créer
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page standalone /calendar — rend simplement CalendarBoard en pleine page.
// La vraie logique est dans CalendarBoard (importable ailleurs, notamment
// dans le Tableau de bord).
// ---------------------------------------------------------------------------
export default function CalendarPage() {
  return <CalendarBoard />;
}
