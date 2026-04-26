"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Car, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockBillingProfiles } from "@/lib/billing/mock-data";
import type { TravelEntry, CoverageStatus } from "@/lib/billing/types";
import { CoverageBadge } from "./coverage-badge";

interface AddTravelModalProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  onSave: (entry: TravelEntry) => void;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export function AddTravelModal({
  open,
  onClose,
  ticketId,
  ticketNumber,
  organizationId,
  organizationName,
  onSave,
}: AddTravelModalProps) {
  const [date, setDate] = useState(todayISODate());
  const [durationMinutes, setDuration] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [currentUserName, setCurrentUserName] = useState("—");
  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.firstName) setCurrentUserName(`${d.firstName} ${d.lastName}`);
    }).catch(() => {});
  }, []);

  // Phase 6 : on retire le mockContracts.find() qui retournait toujours
  // undefined (les ids mock ne matchent jamais les orgs réelles). Le
  // profil par défaut reste mockBillingProfiles[0] pour le preview UI ;
  // le serveur revalide tout via resolveDecisionForEntry au POST.
  const profile = mockBillingProfiles[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contract = undefined as { type?: string; mspPlan?: { includesTravel?: boolean }; hourBank?: { includesTravel?: boolean } } | undefined;

  // Le taux facturé est unique par client (OrgMileageRate.kmRoundTrip
  // × taux $/km global) — pas dépendant du site visité. On affiche
  // juste la couverture contractuelle ; le montant réel apparaît dans
  // "Mes dépenses" via /api/v1/my-space/mileage une fois la saisie
  // onsite enregistrée.
  const { coverageStatus, coverageReason } = useMemo(() => {
    let status: CoverageStatus = "travel_billable";
    let reason = "Déplacement facturable selon la configuration du client";
    if (contract?.type === "msp_monthly" && contract.mspPlan?.includesTravel) {
      status = "included_in_contract";
      reason = "Déplacement inclus dans le forfait MSP";
    } else if (contract?.type === "hour_bank" && contract.hourBank?.includesTravel) {
      status = "included_in_contract";
      reason = "Déplacement inclus dans la banque d'heures";
    } else if (contract?.type === "msp_monthly") {
      reason = "Déplacement non inclus dans le forfait MSP — facturable";
    }
    return { coverageStatus: status, coverageReason: reason };
  }, [contract]);

  if (!open) return null;

  function reset() {
    setDate(todayISODate());
    setDuration("");
    setNotes("");
  }

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Persiste comme TimeEntry timeType="travel" + hasTravelBilled=true.
      // Avant ce fix, la saisie ne quittait pas le state React → perdue
      // au refresh. Le serveur revalide tout via resolveDecisionForEntry.
      const startedAt = new Date(`${date}T08:00:00`).toISOString();
      const dur = typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : 1;
      const r = await fetch("/api/v1/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          organizationId,
          timeType: "travel",
          startedAt,
          durationMinutes: dur,
          description: notes || "Déplacement",
          isOnsite: true,
          hasTravelBilled: true,
          travelDurationMinutes: typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Erreur HTTP ${r.status}`);
      }
      const created = await r.json();
      // Conserve la signature publique onSave(TravelEntry) pour ne pas
      // casser le composant parent qui pourrait afficher une UI optimiste.
      const entry: TravelEntry = {
        id: created.id ?? `tv_${Date.now()}`,
        ticketId,
        ticketNumber,
        organizationId,
        organizationName,
        agentId: created.agentId ?? "usr_current",
        agentName: currentUserName,
        date: new Date(`${date}T00:00:00`).toISOString(),
        durationMinutes: typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : undefined,
        coverageStatus,
        coverageReason,
        ratePerKm: profile.ratePerKm,
        flatFee: profile.travelFlatFee,
        notes,
        approvalStatus: "draft",
        createdAt: new Date().toISOString(),
      };
      onSave(entry);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Car className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Ajouter un déplacement
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Ticket {ticketNumber} — {organizationName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-[11.5px] text-blue-900 leading-relaxed">
            Le taux de kilométrage est configuré une seule fois par client
            (Paramètres → Allocations &amp; kilométrage). Tu n&apos;as pas besoin
            de saisir l&apos;origine, la destination ni la distance ici —
            le montant facturable au client et remboursé à l&apos;agent sera
            calculé automatiquement.
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <Input
              label="Durée de trajet (minutes) — facultatif"
              type="number"
              min={0}
              value={durationMinutes === "" ? "" : durationMinutes}
              onChange={(e) => {
                const v = e.target.value;
                setDuration(v === "" ? "" : Math.max(0, Number(v) || 0));
              }}
              placeholder="Ex : 45"
            />
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              À remplir uniquement si le temps de trajet est <strong>payé
              à l&apos;agent</strong> selon son contrat. Cette donnée n&apos;affecte
              pas la facturation client — elle est utilisée dans les rapports
              pour calculer la paie de l&apos;agent.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                Couverture contractuelle
              </h3>
              <CoverageBadge status={coverageStatus} reason={coverageReason} />
            </div>
            <p className="text-[12.5px] text-slate-600 leading-relaxed">{coverageReason}</p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              {error}
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              <Save className="h-4 w-4" strokeWidth={2.5} />
              {submitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
