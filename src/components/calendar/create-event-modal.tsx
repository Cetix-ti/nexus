"use client";

// ============================================================================
// CreateEventModal — modale partagée pour créer / éditer un événement
// du calendrier.
//
// Utilisée :
//   - depuis /calendar (bouton « + » du header)
//   - depuis /calendar/meetings (bouton « Nouvelle rencontre ») avec
//     `initialKind="MEETING"` pour pré-configurer le type
//
// Pour kind=MEETING, on expose en plus :
//   - un sélecteur d'agents (MultiSelect) → participants invités +
//     notifiés automatiquement par le POST /calendar-events
//   - une section « Ordre du jour » avec points + durées → les items sont
//     POSTés sur /api/v1/meetings/[id]/agenda dès que la rencontre est
//     créée (le serveur retourne `meeting.id` dans la réponse).
// ============================================================================

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Pencil, Briefcase, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";

export interface CalendarRef {
  id: string;
  name: string;
  description: string | null;
  kind: "RENEWALS" | "LEAVE" | "GENERAL" | "CUSTOM";
  color: string;
  isActive: boolean;
}

export type CalendarEventKind =
  | "RENEWAL"
  | "LEAVE"
  | "WORK_LOCATION"
  | "MEETING"
  | "PERSONAL"
  | "OTHER";

export interface CalendarEventRef {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  kind: CalendarEventKind;
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
  internalTicket: {
    id: string;
    number: number;
    subject: string;
    status: string;
  } | null;
  internalProject: {
    id: string;
    code: string;
    name: string;
    status: string;
  } | null;
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
  agents?: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      avatar: string | null;
    };
  }>;
  outlookEventId?: string | null;
  outlookCalendarId?: string | null;
  rawTitle?: string | null;
  syncStatus?: "OK" | "UNDECODED" | "ERROR" | "PENDING" | null;
  syncError?: string | null;
  lastSyncedAt?: string | null;
}

interface AgendaDraft {
  title: string;
  durationMinutes: string;
}

interface Props {
  calendars: CalendarRef[];
  defaultDate: Date;
  editing?: CalendarEventRef | null;
  onClose: () => void;
  onSaved: () => void;
  /**
   * Force le type d'événement par défaut à la création. Utile pour que le
   * bouton « Nouvelle rencontre » de /calendar/meetings ouvre la modale
   * avec kind="MEETING" pré-sélectionné.
   */
  initialKind?: CalendarEventKind;
}

export function CreateEventModal({
  calendars,
  defaultDate,
  editing,
  onClose,
  onSaved,
  initialKind,
}: Props) {
  const today = (() => {
    const d = defaultDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const isEdit = !!editing;

  function splitIso(iso: string): { date: string; time: string } {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return { date: `${yyyy}-${mm}-${dd}`, time: `${h}:${m}` };
  }
  const initStart = editing
    ? splitIso(editing.startsAt)
    : { date: today, time: "09:00" };
  const initEnd = editing
    ? splitIso(editing.endsAt)
    : { date: today, time: "10:00" };

  const defaultCalendarId =
    editing?.calendarId ??
    calendars.find((c) => c.kind === "GENERAL")?.id ??
    calendars[0]?.id ??
    "";
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [title, setTitle] = useState(editing?.title ?? "");
  // Défaut type — priorité : editing > initialKind > WORK_LOCATION
  const [kind, setKind] = useState<CalendarEventKind>(
    editing?.kind ?? initialKind ?? "WORK_LOCATION",
  );
  const [startDate, setStartDate] = useState(initStart.date);
  const [startTime, setStartTime] = useState(initStart.time);
  const [endDate, setEndDate] = useState(initEnd.date);
  const [endTime, setEndTime] = useState(initEnd.time);
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [organizationId, setOrganizationId] = useState<string>(
    editing?.organizationId ?? "",
  );
  const [organizationName, setOrganizationName] = useState<string>(
    editing?.organization?.name ?? "",
  );
  const [orgSearch, setOrgSearch] = useState<string>(
    editing?.organization?.name ?? "",
  );
  const [orgSuggestions, setOrgSuggestions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [siteId, setSiteId] = useState<string>(editing?.siteId ?? "");
  const [sitesForOrg, setSitesForOrg] = useState<
    Array<{ id: string; name: string; city: string | null; isMain?: boolean }>
  >([]);
  const [recurrence, setRecurrence] = useState<
    "none" | "weekly" | "monthly" | "yearly"
  >(
    (editing as { recurrence?: "weekly" | "monthly" | "yearly" } | undefined)
      ?.recurrence ?? "none",
  );
  const [renewalAmount, setRenewalAmount] = useState(
    editing?.renewalType
      ? String((editing as { renewalAmount?: number }).renewalAmount ?? "")
      : "",
  );
  const [renewalNotifyDays, setRenewalNotifyDays] = useState("14");
  const [renewalType, setRenewalType] = useState(editing?.renewalType ?? "");
  const [renewalExternalRef, setRenewalExternalRef] = useState(
    (editing as { renewalExternalRef?: string } | undefined)
      ?.renewalExternalRef ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<
    Array<{ id: string; name: string; avatar: string | null }>
  >([]);
  const { data: session } = useSession();
  const currentUserId =
    (session?.user as { id?: string } | undefined)?.id ?? "";
  const [ownerId, setOwnerId] = useState<string>(
    editing?.ownerId ?? currentUserId,
  );
  const [agentIds, setAgentIds] = useState<string[]>(() => {
    if (editing?.agents && editing.agents.length > 0) {
      return editing.agents.map((a) => a.user.id);
    }
    if (editing?.ownerId) return [editing.ownerId];
    return currentUserId ? [currentUserId] : [];
  });
  // Participants pour kind=MEETING. En édition, on les lit depuis la
  // rencontre liée (si disponible) via un fetch dédié. En création, on
  // commence vide — l'organisateur est ajouté automatiquement côté serveur.
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  // Ordre du jour initial (création seulement). En édition, cette section
  // est cachée — l'agenda se gère depuis la fiche de la rencontre.
  const [agenda, setAgenda] = useState<AgendaDraft[]>([]);
  const [internalTickets, setInternalTickets] = useState<
    Array<{ id: string; number: number; subject: string }>
  >([]);
  const [internalProjects, setInternalProjects] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [internalProjectId, setInternalProjectId] = useState<string>(
    editing?.internalProjectId ?? "",
  );
  const [linkedTicketIds, setLinkedTicketIds] = useState<string[]>(() => {
    const ids = new Set<string>();
    const lt = (editing as { linkedTickets?: Array<{ id: string }> } | undefined)
      ?.linkedTickets;
    if (Array.isArray(lt)) for (const t of lt) ids.add(t.id);
    if (editing?.internalTicketId) ids.add(editing.internalTicketId);
    return Array.from(ids);
  });

  useEffect(() => {
    fetch("/api/v1/users")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          arr: Array<{
            id: string;
            name: string;
            firstName: string;
            lastName: string;
            avatar: string | null;
          }>,
        ) => {
          setUsers(
            arr.map((u) => ({
              id: u.id,
              name: u.name || `${u.firstName} ${u.lastName}`,
              avatar: u.avatar ?? null,
            })),
          );
        },
      )
      .catch(() => {});
    fetch("/api/v1/tickets?internal=true&limit=200")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (arr: Array<{ id: string; number: number; subject: string }>) => {
          if (Array.isArray(arr)) setInternalTickets(arr);
        },
      )
      .catch(() => {});
    fetch("/api/v1/projects?internal=true")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(
        (d: {
          data?: Array<{ id: string; code: string; name: string }>;
        }) => {
          setInternalProjects(d.data ?? []);
        },
      )
      .catch(() => {});
  }, []);

  // En édition d'une rencontre, charge les participants existants depuis
  // /api/v1/meetings/[id] pour pré-remplir le MultiSelect.
  useEffect(() => {
    if (!isEdit) return;
    if (!editing?.meetingId) return;
    fetch(`/api/v1/meetings/${editing.meetingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          m: {
            participants?: Array<{ user: { id: string } }>;
          } | null,
        ) => {
          if (!m || !Array.isArray(m.participants)) return;
          setParticipantIds(m.participants.map((p) => p.user.id));
        },
      )
      .catch(() => {});
  }, [isEdit, editing?.meetingId]);

  useEffect(() => {
    if (isEdit) return;
    if (calendarId) return;
    const general =
      calendars.find((c) => c.kind === "GENERAL")?.id ?? calendars[0]?.id;
    if (general) setCalendarId(general);
  }, [calendars, calendarId, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    if (ownerId) return;
    if (currentUserId) setOwnerId(currentUserId);
  }, [currentUserId, ownerId, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    if (agentIds.length > 0) return;
    if (currentUserId) setAgentIds([currentUserId]);
  }, [currentUserId, agentIds, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    const cal = calendars.find((c) => c.id === calendarId);
    if (!cal) return;
    // Ne pas écraser un `initialKind` explicite — si on nous a dit MEETING,
    // on reste sur MEETING même si le calendrier par défaut est GENERAL.
    if (initialKind) return;
    if (cal.kind === "RENEWALS") setKind("RENEWAL");
    else if (cal.kind === "LEAVE") setKind("LEAVE");
  }, [calendarId, calendars, isEdit, initialKind]);

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
                .map((o: { id: string; name: string }) => ({
                  id: o.id,
                  name: o.name,
                })),
            );
          }
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [orgSearch]);

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
            arr.map(
              (s: {
                id: string;
                name: string;
                city: string;
                primary?: boolean;
              }) => ({
                id: s.id,
                name: s.name,
                city: s.city === "—" ? null : s.city,
                isMain: s.primary,
              }),
            ),
          );
        }
      })
      .catch(() => {});
  }, [organizationId]);

  function addAgendaItem() {
    setAgenda((prev) => [...prev, { title: "", durationMinutes: "" }]);
  }
  function updateAgendaItem(idx: number, patch: Partial<AgendaDraft>) {
    setAgenda((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }
  function removeAgendaItem(idx: number) {
    setAgenda((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!calendarId || !title.trim()) return;

    // IMPORTANT — toujours parser en LOCAL. `new Date("2026-04-17")` (ISO
    // date-only) est parsé UTC par JS → en America/Montreal l'événement
    // "all-day 17 avril" finissait saved à 17 avril 00:00 UTC = 16 avril
    // 20:00 local, donc affiché sur le 16 ET le 17 dans la grille mensuelle.
    // Le suffixe "T00:00:00" force l'interprétation LOCALE (comportement
    // déjà correct pour endDate all-day et pour les événements non all-day).
    const startsDate = allDay
      ? new Date(`${startDate}T00:00:00`)
      : new Date(`${startDate}T${startTime}:00`);
    const endsDate = allDay
      ? new Date(`${endDate}T23:59:59`)
      : new Date(`${endDate}T${endTime}:00`);
    if (endsDate <= startsDate) {
      setError("La fin doit être après le début.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const url = isEdit
        ? `/api/v1/calendar-events/${encodeURIComponent(editing.id)}`
        : "/api/v1/calendar-events";
      const effectiveOwnerId =
        kind === "WORK_LOCATION" ? agentIds[0] ?? ownerId : ownerId;
      const effectiveAgentIds = kind === "WORK_LOCATION" ? agentIds : undefined;

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
          // Participants pour kind=MEETING (crée MeetingParticipant côté
          // serveur + envoie les invitations in-app + email).
          participantIds:
            kind === "MEETING" ? participantIds : undefined,
          recurrence: recurrence !== "none" ? recurrence : null,
          renewalType: kind === "RENEWAL" ? renewalType || undefined : undefined,
          renewalAmount:
            kind === "RENEWAL" && renewalAmount ? Number(renewalAmount) : undefined,
          renewalNotifyDaysBefore:
            kind === "RENEWAL" && renewalNotifyDays
              ? Number(renewalNotifyDays)
              : undefined,
          renewalExternalRef:
            kind === "RENEWAL" ? renewalExternalRef || undefined : undefined,
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

      // Création MEETING + agenda initial : on récupère le meetingId dans la
      // réponse et on POST les points. Chaque POST est séquentiel pour
      // préserver l'ordre (auto-increment du champ `order` côté serveur).
      if (!isEdit && kind === "MEETING" && agenda.length > 0) {
        try {
          const created = (await res.json()) as {
            meetingId?: string | null;
            meeting?: { id: string } | null;
          };
          const meetingId = created.meetingId ?? created.meeting?.id ?? null;
          if (meetingId) {
            for (const a of agenda) {
              if (!a.title.trim()) continue;
              await fetch(`/api/v1/meetings/${meetingId}/agenda`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: a.title.trim(),
                  durationMinutes: a.durationMinutes
                    ? Math.max(1, parseInt(a.durationMinutes, 10) || 0)
                    : undefined,
                }),
              });
            }
          }
        } catch (err) {
          // Agenda best-effort — la rencontre est déjà créée, on ne veut pas
          // afficher d'erreur bloquante pour ça.
          console.warn("[CreateEventModal] agenda POST failed:", err);
        }
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  const showClientSite =
    kind === "OTHER" || kind === "MEETING" || kind === "WORK_LOCATION";
  const calKindOrder: Record<string, number> = {
    GENERAL: 0,
    RENEWALS: 1,
    LEAVE: 2,
    CUSTOM: 3,
  };
  const sortedCalendars = [...calendars].sort((a, b) => {
    const da = calKindOrder[a.kind] ?? 99;
    const db = calKindOrder[b.kind] ?? 99;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, "fr");
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl my-4 rounded-2xl bg-white shadow-2xl"
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
        <div className="border-b border-slate-200 px-6 py-4 pr-14">
          <h2 className="text-[16px] font-semibold text-slate-900">
            {isEdit ? "Modifier l'événement" : "Nouvel événement"}
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {isEdit
              ? "Mets à jour les détails ci-dessous."
              : kind === "MEETING"
                ? "Les agents invités seront notifiés. La rencontre apparaît aussi dans le calendrier."
                : "Par défaut, l'événement est ajouté à l'agenda général."}
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* ================= COLONNE GAUCHE ================= */}
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Calendrier
              </label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortedCalendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Type
              </label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as CalendarEventKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORK_LOCATION">
                    Localisation de travail
                  </SelectItem>
                  <SelectItem value="MEETING">Rencontre interne</SelectItem>
                  <SelectItem value="RENEWAL">Renouvellement</SelectItem>
                  <SelectItem value="LEAVE">Congé / absence</SelectItem>
                  <SelectItem value="PERSONAL">Personnel</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-slate-600">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              Toute la journée
            </label>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                label="Début"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {!allDay && (
                <Input
                  type="time"
                  label="Heure"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                label="Fin"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              {!allDay && (
                <Input
                  type="time"
                  label="Heure"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              )}
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Récurrence
              </label>
              <Select
                value={recurrence}
                onValueChange={(v) =>
                  setRecurrence(v as "none" | "weekly" | "monthly" | "yearly")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <div className="relative">
                  <label className="text-[11px] font-medium text-slate-500">
                    Client
                  </label>
                  <div className="relative">
                    <Input
                      value={orgSearch}
                      onChange={(e) => {
                        setOrgSearch(e.target.value);
                        setOrgDropdownOpen(true);
                        if (e.target.value !== organizationName) {
                          setOrganizationId("");
                        }
                      }}
                      onFocus={() => setOrgDropdownOpen(true)}
                      onBlur={() =>
                        setTimeout(() => setOrgDropdownOpen(false), 150)
                      }
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
                      <SelectValue
                        placeholder={
                          !organizationId
                            ? "Choisis d'abord un client"
                            : sitesForOrg.length === 0
                              ? "Aucun site"
                              : "—"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Aucun site précis</SelectItem>
                      {sitesForOrg.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.isMain ? "★ " : ""}
                          {s.name}
                          {s.city ? ` — ${s.city}` : ""}
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
                />

              </div>
            )}
            {kind === "MEETING" && (
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  Agents invités
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                    (notification + invitation par courriel)
                  </span>
                </label>
                <MultiSelect
                  options={users
                    .filter((u) => u.id !== currentUserId)
                    .map((u) => ({ value: u.id, label: u.name }))}
                  selected={participantIds}
                  onChange={setParticipantIds}
                  placeholder="Sélectionner les agents à inviter"
                />

                <p className="mt-1 text-[10.5px] text-slate-400">
                  Tu es automatiquement ajouté comme organisateur.
                </p>
              </div>
            )}
            {(kind === "LEAVE" || kind === "PERSONAL") && (
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  Agent concerné
                </label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(kind === "WORK_LOCATION" ||
              kind === "MEETING" ||
              kind === "OTHER") && (
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
                    <label className="text-[11px] font-medium text-slate-500">
                      Type
                    </label>
                    <Select value={renewalType} onValueChange={setRenewalType}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="license">
                          Licence logicielle
                        </SelectItem>
                        <SelectItem value="ssl">Certificat SSL</SelectItem>
                        <SelectItem value="subscription">Abonnement</SelectItem>
                        <SelectItem value="warranty">
                          Garantie matériel
                        </SelectItem>
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
                  Une notification sera envoyée aux admins MSP + à l&apos;agent
                  concerné à l&apos;approche de l&apos;échéance.
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
                />

              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">
                  Projet interne
                </label>
                <Select
                  value={internalProjectId || "_none"}
                  onValueChange={(v) =>
                    setInternalProjectId(v === "_none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Aucun</SelectItem>
                    {internalProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ================= PLEINE LARGEUR : DESCRIPTION ================= */}
          <div className="md:col-span-2">
            <label className="text-[11px] font-medium text-slate-500">
              Description (optionnel)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Contexte, notes, …"
            />
          </div>

          {/* ================= ORDRE DU JOUR (MEETING seulement, création) ========= */}
          {!isEdit && kind === "MEETING" && (
            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-600">
                    Ordre du jour
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Ajoute les points à aborder. Pendant la rencontre, chaque
                    point accepte des notes et peut devenir un ticket.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addAgendaItem}
                  className="inline-flex items-center gap-1 text-[11.5px] text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter un point
                </button>
              </div>
              {agenda.length === 0 ? (
                <p className="text-[11.5px] text-slate-400 italic">
                  Optionnel — tu pourras aussi ajouter / modifier les points
                  depuis la fiche de la rencontre.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {agenda.map((a, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[10px] font-medium text-slate-400 tabular-nums mt-2 w-5">
                        {idx + 1}.
                      </span>
                      <Input
                        value={a.title}
                        onChange={(e) =>
                          updateAgendaItem(idx, { title: e.target.value })
                        }
                        placeholder="Ex. Revue des tickets critiques"
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min="1"
                        value={a.durationMinutes}
                        onChange={(e) =>
                          updateAgendaItem(idx, {
                            durationMinutes: e.target.value,
                          })
                        }
                        placeholder="min"
                        className="w-20"
                      />
                      <button
                        type="button"
                        onClick={() => removeAgendaItem(idx)}
                        className="mt-2 text-slate-400 hover:text-red-600"
                        aria-label="Retirer ce point"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && (
            <p className="md:col-span-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={saving}
            disabled={!title.trim() || !calendarId}
          >
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
