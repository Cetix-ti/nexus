"use client";

// ============================================================================
// MultiOrgTripModal — créer N saisies de temps en 1 modal pour un événement
// calendrier qui couvre plusieurs clients (tournée multi-clients).
//
// Pour chaque org : sélecteur de ticket suggéré (mine/team/recentOpen),
// durée de travail, toggle déplacement facturé + durée trajet.
//
// Submit = N POST séquentielles vers /api/v1/time-entries (l'endpoint
// existant valide ticket↔org, détecte les doublons via travel-conflicts).
// Si une saisie échoue, on logue mais on continue les autres — rollback
// total de N saisies déjà créées est complexe, on accepte le partial commit.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, Plus, Route, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface TicketRow { id: string; number: number; subject: string; status: string }
interface OrgInput { id: string; name: string }

interface RowState {
  organizationId: string;
  organizationName: string;
  ticketId: string;
  durationMinutes: number;
  hasTravelBilled: boolean;
  travelDurationMinutes: number;
  description: string;
  loading: boolean;
  mineTickets: TicketRow[];
  teamTickets: TicketRow[];
  otherTickets: TicketRow[];
  resultStatus?: "ok" | "fail" | null;
  resultError?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  eventDate: string;            // ISO du jour visé
  organizations: OrgInput[];    // ≥ 2 attendu
  /** Durée totale d'événement (minutes) — split équitable par org en défaut. */
  totalDurationMinutes?: number;
  /** Durée totale du trajet (minutes) — split équitable par org en défaut. */
  totalTravelMinutes?: number;
  onCreated?: (created: number, failed: number) => void;
}

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];

export function MultiOrgTripModal({
  open, onClose, eventDate, organizations, totalDurationMinutes, totalTravelMinutes, onCreated,
}: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialise les rows une fois quand le modal s'ouvre.
  useEffect(() => {
    if (!open) return;
    const n = organizations.length;
    const defDur = totalDurationMinutes && n > 0 ? Math.round(totalDurationMinutes / n) : 30;
    const defTravel = totalTravelMinutes && n > 0 ? Math.round(totalTravelMinutes / n) : 30;
    setRows(organizations.map((o) => ({
      organizationId: o.id,
      organizationName: o.name,
      ticketId: "",
      durationMinutes: defDur,
      hasTravelBilled: true,
      travelDurationMinutes: defTravel,
      description: "",
      loading: true,
      mineTickets: [], teamTickets: [], otherTickets: [],
      resultStatus: null,
    })));

    // Fetch ticket suggestions par org en parallèle.
    const dateStr = eventDate.slice(0, 10);
    organizations.forEach((o, idx) => {
      fetch(`/api/v1/my-space/ticket-suggestions?organizationId=${o.id}&date=${dateStr}`)
        .then((r) => (r.ok ? r.json() : { mine: [], team: [], recentOpen: [] }))
        .catch(() => ({ mine: [], team: [], recentOpen: [] }))
        .then((sug) => {
          const toRow = (t: { id: string; number?: number; subject?: string; status?: string }): TicketRow => ({
            id: t.id, number: t.number ?? 0, subject: t.subject ?? "", status: t.status ?? "",
          });
          const mine = (sug.mine ?? []).map(toRow);
          const team = (sug.team ?? []).map(toRow);
          const seen = new Set([...mine.map((t: TicketRow) => t.id), ...team.map((t: TicketRow) => t.id)]);
          const other = (sug.recentOpen ?? []).filter((t: { id: string }) => !seen.has(t.id)).map(toRow);
          setRows((prev) => prev.map((r, i) => {
            if (i !== idx) return r;
            const firstTicket = mine[0] ?? team[0] ?? other[0];
            return {
              ...r,
              loading: false,
              mineTickets: mine, teamTickets: team, otherTickets: other,
              ticketId: firstTicket?.id ?? "",
            };
          }));
        });
    });
  }, [open, organizations, eventDate, totalDurationMinutes, totalTravelMinutes]);

  if (!open) return null;

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function submit() {
    setError(null);
    // Validation : chaque ligne doit avoir un ticket.
    const missing = rows.filter((r) => !r.ticketId);
    if (missing.length > 0) {
      setError(`Sélectionne un ticket pour ${missing.length} client(s).`);
      return;
    }
    setSubmitting(true);

    let created = 0;
    let failed = 0;
    const eventDay = new Date(eventDate);
    eventDay.setHours(9, 0, 0, 0);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const res = await fetch("/api/v1/time-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: r.ticketId,
            organizationId: r.organizationId,
            timeType: "onsite_work",
            startedAt: eventDay.toISOString(),
            durationMinutes: r.durationMinutes,
            description: r.description.trim() || `Tournée multi-clients — ${r.organizationName}`,
            isOnsite: true,
            hasTravelBilled: r.hasTravelBilled,
            travelDurationMinutes: r.hasTravelBilled ? r.travelDurationMinutes : null,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          updateRow(i, { resultStatus: "fail", resultError: d.error ?? `HTTP ${res.status}` });
          failed++;
        } else {
          updateRow(i, { resultStatus: "ok" });
          created++;
        }
      } catch (err) {
        updateRow(i, { resultStatus: "fail", resultError: err instanceof Error ? err.message : "Erreur" });
        failed++;
      }
    }

    setSubmitting(false);
    onCreated?.(created, failed);
    if (failed === 0) onClose();
  }

  const dateLabel = new Date(eventDate).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Tournée multi-clients</h2>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {dateLabel} · {organizations.length} clients
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-[11.5px] text-blue-900 leading-relaxed">
            Une saisie <strong>onsite</strong> par client sera créée. Le trajet est splitté
            équitablement par défaut — ajuste la durée de travail et le temps de trajet
            par client si nécessaire.
          </div>

          {error && (
            <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-[12.5px] text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {rows.map((r, idx) => {
              const tickets = [...r.mineTickets, ...r.teamTickets, ...r.otherTickets];
              return (
                <div
                  key={r.organizationId}
                  className={`rounded-lg border p-3.5 ${
                    r.resultStatus === "ok" ? "border-emerald-300 bg-emerald-50/40" :
                    r.resultStatus === "fail" ? "border-red-300 bg-red-50/40" :
                    "border-slate-200 bg-slate-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <h4 className="text-[13.5px] font-semibold text-slate-900">{r.organizationName}</h4>
                    {r.resultStatus === "ok" && (
                      <span className="text-[11px] text-emerald-700 font-medium">✓ saisie créée</span>
                    )}
                    {r.resultStatus === "fail" && (
                      <span className="text-[11px] text-red-700 font-medium">✕ {r.resultError}</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11.5px] font-medium text-slate-700 mb-1">
                        Ticket <span className="text-red-500">*</span>
                      </label>
                      {r.loading ? (
                        <div className="py-2 flex items-center gap-2 text-[12px] text-slate-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
                        </div>
                      ) : tickets.length === 0 ? (
                        <div className="rounded border border-amber-200 bg-amber-50/60 p-2 text-[11.5px] text-amber-900">
                          Aucun ticket ouvert.{" "}
                          <Link
                            href={`/tickets/new?organizationId=${r.organizationId}`}
                            target="_blank"
                            className="inline-flex items-center gap-0.5 underline font-medium"
                          >
                            Créer un ticket <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      ) : (
                        <Select value={r.ticketId} onValueChange={(v) => updateRow(idx, { ticketId: v })}>
                          <SelectTrigger className="h-9 text-[12.5px]"><SelectValue placeholder="Choisir un ticket" /></SelectTrigger>
                          <SelectContent>
                            {r.mineTickets.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Mes tickets actifs</SelectLabel>
                                {r.mineTickets.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    #{t.number} — {t.subject}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            {r.teamTickets.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Tickets équipe</SelectLabel>
                                {r.teamTickets.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    #{t.number} — {t.subject}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            {r.otherTickets.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Autres tickets ouverts</SelectLabel>
                                {r.otherTickets.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    #{t.number} — {t.subject}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11.5px] font-medium text-slate-700 mb-1">Durée travail (min)</label>
                        <div className="flex gap-1 flex-wrap">
                          {QUICK_DURATIONS.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => updateRow(idx, { durationMinutes: d })}
                              className={`px-2 py-1 rounded text-[11.5px] font-medium ${
                                r.durationMinutes === d ? "bg-blue-600 text-white" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                          <Input
                            type="number"
                            value={r.durationMinutes}
                            onChange={(e) => updateRow(idx, { durationMinutes: parseInt(e.target.value) || 0 })}
                            className="h-7 w-16 text-[12px] px-2"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11.5px] font-medium text-slate-700 mb-1">Trajet (min)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={r.hasTravelBilled}
                            onChange={(e) => updateRow(idx, { hasTravelBilled: e.target.checked })}
                            className="h-3.5 w-3.5"
                            id={`travel-${idx}`}
                          />
                          <label htmlFor={`travel-${idx}`} className="text-[11.5px] text-slate-700">facturer</label>
                          <Input
                            type="number"
                            value={r.travelDurationMinutes}
                            onChange={(e) => updateRow(idx, { travelDurationMinutes: parseInt(e.target.value) || 0 })}
                            disabled={!r.hasTravelBilled}
                            className="h-7 w-16 text-[12px] px-2"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting || rows.some((r) => r.loading)} className="gap-1.5">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {submitting ? "Enregistrement…" : `Créer ${rows.length} saisies`}
          </Button>
        </div>
      </div>
    </div>
  );
}
