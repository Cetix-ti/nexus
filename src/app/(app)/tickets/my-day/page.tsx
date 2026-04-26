"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Clock,
  Ticket,
  Plus,
  Loader2,
  ArrowRight,
  AlertTriangle,
  CalendarClock,
  CalendarCheck,
  Wrench,
  Car,
  Calendar as CalIcon,
  Users as UsersIcon,
  Key,
  Plane,
  MapPin,
  User,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TicketQuickViewModal } from "@/components/tickets/ticket-quick-view-modal";
import type { Ticket as FullTicket } from "@/lib/mock-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayTicket {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  type: string;
  organizationName: string;
  requesterName: string;
  assigneeName: string | null;
  categoryName: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  slaBreached: boolean;
}

interface DayTimeEntry {
  id: string;
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketStatus: string;
  ticketPriority: string;
  organizationName: string;
  timeType: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  description: string;
  isOnsite: boolean;
  isAfterHours: boolean;
  coverageStatus: string;
  hourlyRate: number | null;
  amount: number | null;
}

interface WorkedTicket {
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketStatus: string;
  ticketPriority: string;
  organizationName: string;
  totalMinutes: number;
  entryCount: number;
  entries: DayTimeEntry[];
}

interface AllOnsiteEntry {
  id: string;
  agentId: string;
  agentName: string;
  isMine: boolean;
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  organizationName: string;
  durationMinutes: number;
  startedAt: string;
  endedAt: string | null;
  description: string;
  isAfterHours: boolean;
}

interface MyDayData {
  date: string;
  stats: {
    totalMinutes: number;
    billableMinutes: number;
    billableAmount: number;
    onsiteCount: number;
    ticketsWorked: number;
    ticketsDueToday: number;
    ticketsCreated: number;
    ticketsScheduled: number;
  };
  workedTickets: WorkedTicket[];
  dueToday: DayTicket[];
  scheduledTickets: DayTicket[];
  createdTickets: DayTicket[];
  assignedNoTime: DayTicket[];
  onsiteEntries: DayTimeEntry[];
  allOnsiteToday: AllOnsiteEntry[];
  timeEntries: DayTimeEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function fmtTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

const STATUS_STYLES: Record<
  string,
  { label: string; variant: "primary" | "warning" | "success" | "default" | "danger" }
> = {
  new: { label: "Nouveau", variant: "primary" },
  open: { label: "Ouvert", variant: "primary" },
  in_progress: { label: "En cours", variant: "warning" },
  waiting_client: { label: "En attente", variant: "default" },
  on_site: { label: "Sur place", variant: "primary" },
  scheduled: { label: "Planifié", variant: "primary" },
  resolved: { label: "Résolu", variant: "success" },
  closed: { label: "Fermé", variant: "default" },
};

// Priorités : seul "Critique" garde une couleur distinctive (rouge sobre).
// Le reste reste neutre — la page "Ma journée" doit rester calme visuellement.
const PRIORITY_STYLES: Record<string, { label: string; className: string }> = {
  critical: { label: "Critique", className: "text-red-600 font-semibold" },
  high: { label: "Élevée", className: "text-slate-700 font-medium" },
  medium: { label: "Moyenne", className: "text-slate-500" },
  low: { label: "Faible", className: "text-slate-400" },
};

const TIME_TYPE_LABELS: Record<string, string> = {
  remote: "À distance",
  on_site: "Sur place",
  phone: "Téléphone",
  internal: "Interne",
  travel: "Déplacement",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface DayCalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: string;
  location: string | null;
  meeting: { id: string; status: string } | null;
  calendar: { name: string; color: string };
  organization: { id: string; name: string } | null;
  owner: { id: string; firstName: string; lastName: string; avatar: string | null } | null;
  linkedTickets?: Array<{
    id: string;
    number: number;
    displayNumber?: string;
    subject: string;
    priority: string;
    status: string;
    isInternal: boolean;
  }>;
}

export default function MyDayPage() {
  const [data, setData] = useState<MyDayData | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<DayCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickViewTicket, setQuickViewTicket] = useState<FullTicket | null>(null);
  const [quickViewLoading, setQuickViewLoading] = useState<string | null>(null);
  const [onsiteModalOpen, setOnsiteModalOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as
    | { firstName?: string; lastName?: string }
    | undefined;

  useEffect(() => {
    fetch("/api/v1/my-day")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch((e) => console.error("my-day load failed", e))
      .finally(() => setLoading(false));

    // Charge les événements du calendrier de la journée (today 00:00 → 23:59).
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    const qs = new URLSearchParams({
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
    });
    fetch(`/api/v1/calendar-events?${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: DayCalendarEvent[]) => {
        if (Array.isArray(arr)) setCalendarEvents(arr);
      })
      .catch(() => {});
  }, []);

  // Total de temps saisi aujourd'hui (heures/minutes — pas de $).
  const todayTotals = useMemo(() => {
    if (!data) return { totalMinutes: 0 };
    const total = data.timeEntries.reduce((s, te) => s + te.durationMinutes, 0);
    return { totalMinutes: total };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertTriangle className="h-6 w-6 mb-2" />
        <p className="text-sm">Impossible de charger les données</p>
      </div>
    );
  }

  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: fr });

  // Ouvre le quick-view modal au lieu de rediriger vers la page complète.
  // Si le fetch échoue, on tombe sur la navigation classique.
  async function goTicket(id: string) {
    if (quickViewLoading) return;
    setQuickViewLoading(id);
    try {
      const res = await fetch(`/api/v1/tickets/${id}`);
      if (!res.ok) {
        router.push(`/tickets/${id}`);
        return;
      }
      const ticket = (await res.json()) as FullTicket;
      setQuickViewTicket(ticket);
    } catch {
      router.push(`/tickets/${id}`);
    } finally {
      setQuickViewLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ================================================================ */}
      {/* Header + tuiles compactes (inline, largeur auto).                 */}
      {/* Les tuiles se calent à droite sur desktop, sous le titre en       */}
      {/* mobile. Plus de grid 50/50 qui les rendait énormes.               */}
      {/* ================================================================ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
            {today}
          </div>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.022em] text-slate-900 leading-none">
            Ma journée
          </h1>
        </div>

        {/* KPI rail — chiffres dominants, labels small caps copper-tinted */}
        <div className="flex items-stretch divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setOnsiteModalOpen(true)}
            className="group flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 first:rounded-l-xl last:rounded-r-xl"
            title="Voir les déplacements du jour (tous agents)"
          >
            <Car className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <div>
              <div className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Déplacements
              </div>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-slate-900 leading-none">
                  {data.stats.onsiteCount}
                </span>
                {data.allOnsiteToday && data.allOnsiteToday.length > data.stats.onsiteCount && (
                  <span className="text-[10.5px] font-medium text-slate-400 tabular-nums">
                    +{data.allOnsiteToday.length - data.stats.onsiteCount}
                  </span>
                )}
              </div>
            </div>
            <ArrowRight className="h-3 w-3 text-slate-300 transition-all group-hover:text-slate-600 group-hover:translate-x-0.5 shrink-0" />
          </button>

          <div className="flex items-center gap-3 px-4 py-2.5">
            <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <div>
              <div className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Temps saisi
              </div>
              <div className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-slate-900 leading-none">
                {fmtDuration(todayTotals.totalMinutes)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 1. Tickets travaillés aujourd'hui (avec saisies de temps)        */}
      {/* ================================================================ */}
      <Section
        title="Tickets travaillés aujourd'hui"
        subtitle="Tickets dans lesquels vous avez saisi du temps"
        count={data.workedTickets.length}
        icon={<Wrench className="h-4 w-4" />}
        accentClass="text-slate-600"
        accentBg="bg-slate-100 ring-1 ring-inset ring-slate-200/60"
      >
        {data.workedTickets.length === 0 ? (
          <EmptyState message="Aucune saisie de temps aujourd'hui" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.workedTickets.map((wt) => (
              <WorkedTicketRow
                key={wt.ticketId}
                ticket={wt}
                onClick={() => goTicket(wt.ticketId)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ================================================================ */}
      {/* 2. Échéances + Planifiés — side by side                          */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Échéance aujourd'hui"
          subtitle="Tickets à compléter aujourd'hui"
          count={data.dueToday.length}
          icon={<CalendarClock className="h-4 w-4" />}
          accentClass="text-slate-600"
          accentBg="bg-slate-100 ring-1 ring-inset ring-slate-200/60"
        >
          {data.dueToday.length === 0 ? (
            <EmptyState message="Aucune échéance aujourd'hui" />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.dueToday.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onClick={() => goTicket(t.id)}
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Planifiés"
          subtitle="Tickets que vous avez planifiés"
          count={data.scheduledTickets.length}
          icon={<CalendarCheck className="h-4 w-4" />}
          accentClass="text-slate-600"
          accentBg="bg-slate-100 ring-1 ring-inset ring-slate-200/60"
        >
          {data.scheduledTickets.length === 0 ? (
            <EmptyState message="Aucun ticket planifié" />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.scheduledTickets.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onClick={() => goTicket(t.id)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ================================================================ */}
      {/* Mon agenda du jour — calendrier + rencontres                     */}
      {/* ================================================================ */}
      {calendarEvents.length > 0 && (
        <Section
          title="Mon agenda du jour"
          subtitle="Événements et rencontres planifiés aujourd'hui"
          count={calendarEvents.length}
          icon={<CalIcon className="h-4 w-4" />}
          accentClass="text-slate-600"
          accentBg="bg-slate-100 ring-1 ring-inset ring-slate-200/60"
        >
          <div className="divide-y divide-slate-100">
            {calendarEvents.map((ev) => {
              const Icon =
                ev.kind === "MEETING" ? UsersIcon :
                ev.kind === "RENEWAL" ? Key :
                ev.kind === "LEAVE" ? Plane :
                ev.kind === "WORK_LOCATION" ? MapPin :
                ev.kind === "PERSONAL" ? User :
                CalIcon;
              const href = ev.meeting ? `/calendar/meetings/${ev.meeting.id}` : "/calendar";
              const linked = ev.linkedTickets ?? [];
              return (
                <div key={ev.id} className="px-4 py-2.5 hover:bg-slate-50/80 transition-colors">
                  <Link href={href} className="flex items-center gap-3">
                    {/* Avatar agent pour WORK_LOCATION, sinon l'icône kind */}
                    {ev.kind === "WORK_LOCATION" && ev.owner?.avatar ? (
                      <img
                        src={ev.owner.avatar}
                        alt={`${ev.owner.firstName} ${ev.owner.lastName}`}
                        className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                      />
                    ) : (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0"
                        style={{ backgroundColor: ev.calendar.color + "22", color: ev.calendar.color }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-slate-900 truncate">
                        {ev.title}
                        {ev.organization && (
                          <span className="ml-1.5 text-[11.5px] font-normal text-slate-500">
                            · {ev.organization.name}
                          </span>
                        )}
                      </p>
                      {ev.location && (
                        <p className="text-[11px] text-slate-500 truncate">{ev.location}</p>
                      )}
                    </div>
                    <span className="text-[11.5px] tabular-nums text-slate-500 shrink-0">
                      {ev.allDay
                        ? "Toute la journée"
                        : `${new Date(ev.startsAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })} – ${new Date(ev.endsAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                  </Link>

                  {/* Tickets planifiés sur cette visite — listés sous l'event */}
                  {linked.length > 0 && (
                    <ul className="mt-1.5 ml-10 space-y-0.5">
                      {linked.map((t) => (
                        <li key={t.id}>
                          <Link
                            href={t.isInternal ? `/internal-tickets/${t.id}` : `/tickets/${t.id}`}
                            className="flex items-center gap-2 text-[11.5px] text-slate-600 hover:text-blue-700"
                          >
                            <span className="font-mono text-slate-400 shrink-0">
                              {t.displayNumber ?? `${t.isInternal ? "INT" : "TK"}-${1000 + t.number}`}
                            </span>
                            <span className="truncate">{t.subject}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ================================================================ */}
      {/* 3bis. Assignés sans saisie de temps — "todo du jour"             */}
      {/* ================================================================ */}
      {data.assignedNoTime && data.assignedNoTime.length > 0 && (
        <Section
          title="Assignés — sans saisie de temps"
          subtitle="Tickets actifs assignés à vous aujourd'hui, où vous n'avez pas encore saisi de temps"
          count={data.assignedNoTime.length}
          icon={<Clock className="h-4 w-4" />}
          accentClass="text-slate-600"
          accentBg="bg-slate-100 ring-1 ring-inset ring-slate-200/60"
        >
          <div className="divide-y divide-slate-100">
            {data.assignedNoTime.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                onClick={() => goTicket(t.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ================================================================ */}
      {/* 4. Tickets créés aujourd'hui                                     */}
      {/* ================================================================ */}
      <Section
        title="Créés aujourd'hui"
        subtitle="Tickets que vous avez ouverts"
        count={data.createdTickets.length}
        icon={<Plus className="h-4 w-4" />}
        accentClass="text-slate-600"
        accentBg="bg-slate-100 ring-1 ring-inset ring-slate-200/60"
      >
        {data.createdTickets.length === 0 ? (
          <EmptyState message="Aucun ticket créé aujourd'hui" />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.createdTickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                onClick={() => goTicket(t.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Quick-view modal — ouverte au clic sur un ticket de la journée */}
      <TicketQuickViewModal
        ticket={quickViewTicket}
        open={!!quickViewTicket}
        onClose={() => setQuickViewTicket(null)}
      />

      {/* Modale de coordination des déplacements du jour */}
      <OnsiteCoordinationModal
        open={onsiteModalOpen}
        onClose={() => setOnsiteModalOpen(false)}
        entries={data.allOnsiteToday || []}
        onTicketClick={(id) => {
          setOnsiteModalOpen(false);
          goTicket(id);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  count,
  icon,
  accentClass,
  accentBg,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  icon: React.ReactNode;
  accentClass: string;
  accentBg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className={cn("inline-flex h-4 w-4 items-center justify-center", accentClass)}>
            {icon}
          </span>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-slate-900">
            {title}
          </h2>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {count}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 truncate hidden sm:block">
          {subtitle}
        </span>
      </div>
      <Card className="flex-1 border-slate-200/80">
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </div>
  );
}

/** Ticket row with time summary (for "tickets travaillés") */
function WorkedTicketRow({
  ticket: wt,
  onClick,
}: {
  ticket: WorkedTicket;
  onClick: () => void;
}) {
  const status = STATUS_STYLES[wt.ticketStatus] ?? {
    label: wt.ticketStatus,
    variant: "default" as const,
  };
  const priority = PRIORITY_STYLES[wt.ticketPriority] ?? {
    label: wt.ticketPriority,
    className: "text-slate-500",
  };

  return (
    <button
      onClick={onClick}
      className="relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all hover:bg-slate-50/60 group"
    >
      <PriorityRail priority={wt.ticketPriority} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] font-semibold tracking-[0.02em] text-blue-700">
            {wt.ticketNumber}
          </span>
          <Badge variant={status.variant} className="text-[10px] font-medium">
            {status.label}
          </Badge>
          <span className={cn("text-[10.5px] font-medium uppercase tracking-[0.06em]", priority.className)}>
            {priority.label}
          </span>
        </div>
        <p className="mt-1 text-[13.5px] font-medium text-slate-900 truncate leading-snug">
          {wt.ticketSubject}
        </p>
        <p className="mt-0.5 text-[11.5px] text-slate-500">
          {wt.organizationName}
        </p>
      </div>
      <div className="text-right shrink-0 pl-3 border-l border-slate-200/60">
        <p className="text-[15px] font-semibold tabular-nums tracking-[-0.01em] text-slate-900 leading-none">
          {fmtDuration(wt.totalMinutes)}
        </p>
        <p className="mt-1 text-[10.5px] text-slate-400 tabular-nums">
          {wt.entryCount} saisie{wt.entryCount > 1 ? "s" : ""}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
    </button>
  );
}

/** Standard ticket row */
function TicketRow({
  ticket: t,
  onClick,
}: {
  ticket: DayTicket;
  onClick: () => void;
}) {
  const status = STATUS_STYLES[t.status] ?? {
    label: t.status,
    variant: "default" as const,
  };
  const priority = PRIORITY_STYLES[t.priority] ?? {
    label: t.priority,
    className: "text-slate-500",
  };

  return (
    <button
      onClick={onClick}
      className="relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all hover:bg-slate-50/60 group"
    >
      <PriorityRail priority={t.priority} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] font-semibold tracking-[0.02em] text-blue-700">
            {t.number}
          </span>
          <Badge variant={status.variant} className="text-[10px] font-medium">
            {status.label}
          </Badge>
          <span className={cn("text-[10.5px] font-medium uppercase tracking-[0.06em]", priority.className)}>
            {priority.label}
          </span>
          {t.slaBreached && (
            <AlertTriangle className="h-3 w-3 text-rose-500" />
          )}
        </div>
        <p className="mt-1 text-[13.5px] font-medium text-slate-900 truncate leading-snug">
          {t.subject}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500">
          <span>{t.organizationName}</span>
          <span className="text-slate-300">·</span>
          <span>{t.requesterName}</span>
        </div>
      </div>
      {t.dueAt && (
        <div className="text-right shrink-0 pl-3 border-l border-slate-200/60">
          <p className="text-[9.5px] uppercase tracking-[0.14em] text-slate-400">Échéance</p>
          <p className="mt-1 text-[13px] font-semibold tabular-nums text-slate-700 leading-none">
            {fmtTime(t.dueAt)}
          </p>
        </div>
      )}
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * Petit rail vertical de couleur sur le côté gauche d'une row qui code la
 * priorité visuellement (sans saturer la ligne avec une couleur de fond).
 * 2 px de large, 70% de hauteur de la row, accenté juste assez pour
 * scanner rapidement la liste sans détourner l'attention du contenu.
 */
function PriorityRail({ priority }: { priority: string }) {
  const color =
    priority === "CRITICAL" ? "bg-rose-500"
    : priority === "HIGH"   ? "bg-orange-500"
    : priority === "MEDIUM" ? "bg-blue-400"
    : "bg-slate-300";
  return (
    <span
      className={cn("absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-r", color)}
      aria-hidden="true"
    />
  );
}


function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-center">
      <span className="block h-px w-8 bg-slate-200" />
      <p className="text-[12px] text-slate-400">{message}</p>
      {/* Garde le slot ci-dessous pour les usages ancien-style qui passent
          des children à EmptyState. */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale de coordination des déplacements
// ---------------------------------------------------------------------------
// Affiche TOUS les déplacements du jour (tous agents), groupés par
// organisation. Permet de coordonner : si deux techs sont allés chez le
// même client, un seul doit facturer le déplacement.
function OnsiteCoordinationModal({
  open,
  onClose,
  entries,
  onTicketClick,
}: {
  open: boolean;
  onClose: () => void;
  entries: AllOnsiteEntry[];
  onTicketClick: (ticketId: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  // Regrouper par organisation pour faciliter la coordination.
  const byOrg = new Map<string, AllOnsiteEntry[]>();
  for (const e of entries) {
    const list = byOrg.get(e.organizationName) ?? [];
    list.push(e);
    byOrg.set(e.organizationName, list);
  }
  const orgs = Array.from(byOrg.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], "fr"),
  );
  const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const mineCount = entries.filter((e) => e.isMine).length;
  const agentCount = new Set(entries.map((e) => e.agentId)).size;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Car className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">
                Déplacements aujourd&apos;hui
              </h2>
              <p className="text-[12px] text-slate-500">
                {entries.length} déplacement{entries.length > 1 ? "s" : ""}
                {" · "}
                {fmtDuration(totalMinutes)}
                {" · "}
                {agentCount} agent{agentCount > 1 ? "s" : ""}
                {mineCount > 0 && ` · ${mineCount} à moi`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="text-lg">×</span>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {entries.length === 0 ? (
            <EmptyState message="Aucun déplacement comptabilisé aujourd'hui" />
          ) : (
            <div className="space-y-5">
              {orgs.map(([orgName, list]) => {
                const orgTotal = list.reduce(
                  (s, e) => s + e.durationMinutes,
                  0,
                );
                const agents = Array.from(new Set(list.map((e) => e.agentName)));
                const multipleAgents = agents.length > 1;
                return (
                  <div key={orgName}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-[13px] font-semibold text-slate-900 truncate">
                          {orgName}
                        </h3>
                        {multipleAgents && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                            title="Plusieurs agents — coordonnez la facturation"
                          >
                            {agents.length} agents
                          </span>
                        )}
                      </div>
                      <span className="text-[11.5px] text-slate-500 tabular-nums shrink-0">
                        {fmtDuration(orgTotal)}
                      </span>
                    </div>
                    <div className="space-y-1 rounded-lg border border-slate-200 bg-white overflow-hidden">
                      {list.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onTicketClick(e.ticketId)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50/80 border-b last:border-b-0 border-slate-100"
                        >
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-md shrink-0",
                              e.isMine
                                ? "bg-slate-900 text-white"
                                : "bg-slate-100 text-slate-600",
                            )}
                            title={e.isMine ? "Ma saisie" : e.agentName}
                          >
                            <span className="text-[10px] font-semibold">
                              {e.agentName
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11.5px] font-mono text-slate-400">
                                {e.ticketNumber}
                              </span>
                              <span className="text-[11.5px] font-semibold tabular-nums text-slate-700">
                                {fmtDuration(e.durationMinutes)}
                              </span>
                              {e.isAfterHours && (
                                <span className="text-[10.5px] text-slate-500">
                                  Hors heures
                                </span>
                              )}
                            </div>
                            <p className="text-[12.5px] text-slate-900 truncate">
                              {e.ticketSubject}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {e.agentName}
                              {" · "}
                              {fmtTime(e.startedAt)}
                              {e.endedAt ? ` — ${fmtTime(e.endedAt)}` : ""}
                              {e.description ? ` · ${e.description}` : ""}
                            </p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

