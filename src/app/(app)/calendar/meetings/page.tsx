"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search,
  Loader2,
  Users as UsersIcon,
  CheckCircle2,
  Circle,
  CircleDot,
  XCircle,
  Calendar as CalIcon,
  Ticket as TicketIcon,
  ListChecks,
  Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CreateEventModal,
  type CalendarRef,
} from "@/components/calendar/create-event-modal";

interface MeetingRow {
  id: string;
  title: string;
  description: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  location: string | null;
  startsAt: string;
  endsAt: string;
  createdBy: { id: string; name: string; avatar: string | null } | null;
  participantCount: number;
  generatedTicketCount: number;
  agendaCount: number;
  participantsPreview: Array<{ id: string; name: string; avatar: string | null }>;
}

const STATUS_FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "upcoming", label: "À venir" },
  { value: "past", label: "Passées" },
  { value: "scheduled", label: "Planifiées" },
  { value: "in_progress", label: "En cours" },
  { value: "completed", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
] as const;

const STATUS_BADGE: Record<MeetingRow["status"], { label: string; tone: string; Icon: typeof Circle }> = {
  scheduled:   { label: "Planifiée",  tone: "bg-blue-50 text-blue-700 border-blue-200",       Icon: Circle },
  in_progress: { label: "En cours",   tone: "bg-amber-50 text-amber-700 border-amber-200",    Icon: CircleDot },
  completed:   { label: "Terminée",   tone: "bg-green-50 text-green-700 border-green-200",    Icon: CheckCircle2 },
  cancelled:   { label: "Annulée",    tone: "bg-slate-100 text-slate-500 border-slate-200",   Icon: XCircle },
};

export default function MeetingsListPage() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("upcoming");
  const [mineOnly, setMineOnly] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  // Calendriers — requis par la modale partagée. Chargés une seule fois à
  // l'ouverture de la page (la liste ne change quasi jamais).
  const [calendars, setCalendars] = useState<CalendarRef[]>([]);
  const router = useRouter();
  // useSession importé mais plus utilisé directement — on laisse quand même
  // le hook actif pour que le SessionProvider hydrate le currentUser utilisé
  // par la modale partagée (via son propre useSession).
  useSession();

  useEffect(() => {
    fetch("/api/v1/calendars")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: CalendarRef[]) => {
        if (Array.isArray(arr)) setCalendars(arr);
      })
      .catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (mineOnly) qs.set("mine", "true");
    if (search.trim()) qs.set("search", search.trim());
    fetch(`/api/v1/meetings?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: MeetingRow[]) => setMeetings(Array.isArray(arr) ? arr : []))
      .catch(() => setMeetings([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [search, mineOnly]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return meetings.filter((m) => {
      const start = new Date(m.startsAt).getTime();
      if (filter === "all") return true;
      if (filter === "upcoming") return start >= now && m.status !== "cancelled";
      if (filter === "past") return start < now || m.status === "completed";
      return m.status === filter;
    });
  }, [meetings, filter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
            Rencontres
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Toutes les fiches de réunion — agenda, participants, tickets générés.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/calendar"
            className="text-[12.5px] inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"
          >
            <CalIcon className="h-3.5 w-3.5" />
            Vue calendrier
          </Link>
          <Button variant="primary" onClick={() => setShowNewModal(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nouvelle rencontre
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Rechercher par titre, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-3.5 w-3.5" />}
            className="min-w-[240px] flex-1"
          />
          <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "px-2.5 h-8 rounded-md font-medium transition-colors",
                  filter === f.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="ml-2 flex items-center gap-1.5 text-[12px] text-slate-600">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />
            Mes rencontres
          </label>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UsersIcon className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-slate-900">Aucune rencontre</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Clique sur « Nouvelle rencontre » pour en créer une, ou utilise la
              vue calendrier.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((m) => {
            const badge = STATUS_BADGE[m.status];
            const StatusIcon = badge.Icon;
            const start = new Date(m.startsAt);
            const end = new Date(m.endsAt);
            const sameDay = start.toDateString() === end.toDateString();
            return (
              <Link key={m.id} href={`/calendar/meetings/${m.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14.5px] font-semibold text-slate-900 truncate">
                          {m.title}
                        </h3>
                        <p className="mt-0.5 text-[11.5px] text-slate-500 tabular-nums">
                          {start.toLocaleDateString("fr-CA", { dateStyle: "medium" })}
                          {" · "}
                          {start.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                          {" → "}
                          {sameDay
                            ? end.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })
                            : end.toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-medium",
                          badge.tone,
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    </div>

                    {m.location && (
                      <p className="text-[11.5px] text-slate-500 truncate">
                        📍 {m.location}
                      </p>
                    )}
                    {m.description && (
                      <p className="text-[12px] text-slate-600 line-clamp-2">{m.description}</p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <UsersIcon className="h-3 w-3 text-slate-400" />
                          {m.participantCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ListChecks className="h-3 w-3 text-slate-400" />
                          {m.agendaCount}
                        </span>
                        {m.generatedTicketCount > 0 && (
                          <Badge variant="primary" className="text-[9.5px]">
                            <TicketIcon className="h-2.5 w-2.5 mr-0.5" />
                            {m.generatedTicketCount} ticket(s)
                          </Badge>
                        )}
                      </div>
                      {m.createdBy && (
                        <span className="text-[11px] text-slate-500">
                          {m.createdBy.name}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {showNewModal && (
        <CreateEventModal
          calendars={calendars}
          defaultDate={new Date()}
          initialKind="MEETING"
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false);
            // Recharge la liste — évite de quitter la page si l'utilisateur
            // voulait juste en créer une et revenir à la liste. Si un jour
            // on veut ouvrir la fiche, utiliser router.push avec meetingId
            // renvoyé par l'event créé.
            load();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
