"use client";

// ============================================================================
// QuickAddOnsiteTimeModal — ouvert depuis la bannière « Déplacements
// potentiellement non facturés » dans Mon espace → Mes dépenses.
//
// Permet à l'agent d'ajouter rapidement une saisie de temps ONSITE pour
// un déplacement repéré dans son calendrier. Le kilométrage est ensuite
// calculé automatiquement par l'endpoint /my-space/mileage (trip = toute
// saisie onsite dédupée par jour/org).
//
// Flow :
//   1. Charge les tickets ouverts de l'organisation concernée
//   2. L'utilisateur pick un ticket et fixe une durée (15 min par défaut)
//   3. POST /api/v1/time-entries avec isOnsite=true et startedAt = jour
//      de l'événement calendrier + 09:00 (heure arbitraire, seule la
//      DATE compte pour la détection de déplacement)
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Clock, Loader2, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface TicketRow {
  id: string;
  number: number;
  subject: string;
  status: string;
  totalMinutesToday?: number;
  myMinutesToday?: number;
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  eventDate: string;            // ISO
  organizationId: string;
  organizationName: string;
  onCreated?: () => void;
}

const QUICK_DURATIONS = [15, 30, 45, 60];

export function QuickAddOnsiteTimeModal({
  open, onClose, eventDate, organizationId, organizationName, onCreated,
}: Props) {
  const [mineTickets, setMineTickets] = useState<TicketRow[]>([]);
  const [teamTickets, setTeamTickets] = useState<TicketRow[]>([]);
  const [otherTickets, setOtherTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketId, setTicketId] = useState<string>("");
  const [duration, setDuration] = useState<number>(15);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cette modale est dédiée aux déplacements : on pré-active le toggle.
  // L'utilisateur peut désactiver (ex: déplacement offert, déjà inclus dans
  // un forfait FTIG, travail sur place non facturé comme déplacement).
  const [hasTravelBilled, setHasTravelBilled] = useState(true);
  const [travelConflicts, setTravelConflicts] = useState<Array<{
    id: string;
    ticketId: string;
    ticketNumber: number | null;
    ticketSubject: string | null;
    agentName: string | null;
  }>>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    const dateStr = eventDate.slice(0, 10);
    fetch(`/api/v1/my-space/ticket-suggestions?organizationId=${organizationId}&date=${dateStr}`)
      .then((r) => r.ok ? r.json() : { mine: [], team: [], recentOpen: [] })
      .catch(() => ({ mine: [], team: [], recentOpen: [] }))
      .then((sug) => {
        const toRow = (t: any): TicketRow => ({
          id: t.id, number: t.number ?? 0, subject: t.subject ?? "", status: t.status ?? "",
          totalMinutesToday: t.totalMinutesToday ?? 0,
          myMinutesToday: t.myMinutesToday ?? 0,
        });
        const mineRows: TicketRow[] = (sug.mine ?? []).map(toRow);
        const teamRows: TicketRow[] = (sug.team ?? []).map(toRow);
        // Déduplique recentOpen : retire les tickets déjà présents dans mine/team.
        const suggestedIds = new Set([...mineRows.map((t) => t.id), ...teamRows.map((t) => t.id)]);
        const openRows: TicketRow[] = (sug.recentOpen ?? [])
          .filter((t: any) => !suggestedIds.has(t.id))
          .map(toRow);
        setMineTickets(mineRows);
        setTeamTickets(teamRows);
        setOtherTickets(openRows);
        if (!ticketId) {
          const first = mineRows[0] ?? teamRows[0] ?? openRows[0];
          if (first) setTicketId(first.id);
        }
      })
      .finally(() => setLoading(false));
  }, [open, organizationId, eventDate]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch des déplacements déjà facturés ce jour-là pour cette org.
  useEffect(() => {
    if (!open || !organizationId || !eventDate) { setTravelConflicts([]); return; }
    const dateStr = eventDate.slice(0, 10);
    const ctrl = new AbortController();
    fetch(`/api/v1/time-entries/travel-conflicts?orgId=${organizationId}&date=${dateStr}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTravelConflicts(d?.conflicts ?? []))
      .catch(() => { /* silent */ });
    return () => ctrl.abort();
  }, [open, organizationId, eventDate]);

  if (!open) return null;

  async function submit() {
    if (!ticketId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // On fixe startedAt au jour de l'événement à 09:00. Seule la
      // DATE est utilisée pour dédupliquer les trips côté mileage.
      const eventDay = new Date(eventDate);
      eventDay.setHours(9, 0, 0, 0);
      const res = await fetch("/api/v1/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          organizationId,
          timeType: "onsite_work",
          startedAt: eventDay.toISOString(),
          durationMinutes: duration,
          description: description.trim() || `Déplacement ${organizationName}`,
          isOnsite: true,
          hasTravelBilled,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  const dateLabel = new Date(eventDate).toLocaleDateString("fr-CA", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Ajouter ce déplacement
              </h2>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {organizationName} · {dateLabel}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-[11.5px] text-blue-900 leading-relaxed">
            Une saisie de temps <strong>onsite</strong> sera créée sur le ticket
            choisi. Le kilométrage de ce déplacement apparaîtra automatiquement
            dans <strong>« Toutes mes dépenses »</strong> après la sauvegarde.
          </div>

          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
              Ticket à facturer <span className="text-red-500">*</span>
            </label>
            {loading ? (
              <div className="py-3 flex items-center gap-2 text-[12px] text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des tickets…
              </div>
            ) : mineTickets.length + teamTickets.length + otherTickets.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[12px] text-amber-900 space-y-2">
                <p>Aucun ticket ouvert pour ce client. Crée-en un avant d&apos;ajouter le temps :</p>
                <Link
                  href={`/tickets/new?organizationId=${organizationId}&organizationName=${encodeURIComponent(organizationName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11.5px] text-blue-600 hover:text-blue-700 font-medium"
                >
                  <ExternalLink className="h-3 w-3" /> Créer un ticket dans un nouvel onglet
                </Link>
              </div>
            ) : (
              <Select value={ticketId} onValueChange={setTicketId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mineTickets.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Mes tickets ce jour</SelectLabel>
                      {mineTickets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="font-mono text-[11px] text-slate-500 mr-1.5">#{t.number}</span>
                          {t.subject.slice(0, 65)}{t.subject.length > 65 ? "…" : ""}
                          {(t.myMinutesToday ?? 0) > 0 && (
                            <span className="ml-2 text-[10px] text-emerald-600 font-medium">
                              · {fmtMin(t.myMinutesToday!)}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {teamTickets.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Équipe présente ce jour</SelectLabel>
                      {teamTickets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="font-mono text-[11px] text-slate-500 mr-1.5">#{t.number}</span>
                          {t.subject.slice(0, 65)}{t.subject.length > 65 ? "…" : ""}
                          {(t.totalMinutesToday ?? 0) > 0 && (
                            <span className="ml-2 text-[10px] text-blue-600 font-medium">
                              · {fmtMin(t.totalMinutesToday!)} équipe
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {otherTickets.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Autres tickets ouverts</SelectLabel>
                      {otherTickets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="font-mono text-[11px] text-slate-500 mr-1.5">#{t.number}</span>
                          {t.subject.slice(0, 65)}{t.subject.length > 65 ? "…" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
              Durée du travail sur place
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    duration === d
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={24 * 60}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 15))}
              placeholder="Minutes"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
              Description (optionnel)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={`Ex: Intervention sur place — ${organizationName}`}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <label className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-slate-800">Facturer un déplacement</div>
                <div className="text-[11.5px] text-slate-500">
                  Active la ligne &laquo;&nbsp;déplacement&nbsp;&raquo; dans la facturation de ce temps.
                </div>
              </div>
              <input
                type="checkbox"
                checked={hasTravelBilled}
                onChange={(e) => setHasTravelBilled(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-blue-600"
              />
            </label>
          </div>

          {travelConflicts.length > 0 && hasTravelBilled && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="shrink-0 text-amber-600 mt-0.5">⚠️</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-amber-900">
                    Déplacement déjà facturé ce jour-là chez {organizationName}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11.5px] text-amber-900">
                    {travelConflicts.map((c) => (
                      <li key={c.id}>
                        <span className="font-medium">{c.agentName ?? "Technicien inconnu"}</span>
                        {" · Ticket "}
                        {c.ticketNumber != null ? `#${c.ticketNumber}` : c.ticketId.slice(0, 8)}
                        {c.ticketSubject ? ` — ${c.ticketSubject}` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-amber-800">
                    Vérifiez avec votre collègue avant de facturer un second déplacement.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={submitting || !ticketId || (mineTickets.length + teamTickets.length + otherTickets.length === 0)}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Ajouter le déplacement
          </Button>
        </div>
      </div>
    </div>
  );
}
