"use client";

import { useMemo, useState } from "react";
import { X, Car, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { mockBillingProfiles, mockContracts } from "@/lib/billing/mock-data";
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
  const [fromLocation, setFrom] = useState("");
  const [toLocation, setTo] = useState("");
  const [distanceKm, setDistance] = useState(0);
  const [durationMinutes, setDuration] = useState(0);
  const [isRoundTrip, setRoundTrip] = useState(true);
  const [notes, setNotes] = useState("");

  const profile = mockBillingProfiles[0];
  const contract = useMemo(
    () => mockContracts.find((c) => c.organizationId === organizationId),
    [organizationId]
  );

  const { coverageStatus, coverageReason, amount } = useMemo(() => {
    const multiplier = isRoundTrip ? 2 : 1;
    const amt = profile.ratePerKm * distanceKm * multiplier + profile.travelFlatFee;
    let status: CoverageStatus = "travel_billable";
    let reason = "Déplacement facturable au taux standard";
    if (contract?.type === "msp_monthly" && contract.mspPlan?.includesTravel) {
      status = "included_in_contract";
      reason = "Déplacement inclus dans le forfait MSP";
    } else if (contract?.type === "hour_bank" && contract.hourBank?.includesTravel) {
      status = "included_in_contract";
      reason = "Déplacement inclus dans la banque d'heures";
    } else if (contract?.type === "msp_monthly") {
      reason = "Déplacement non inclus dans le forfait MSP — facturable";
    }
    return { coverageStatus: status, coverageReason: reason, amount: Math.round(amt * 100) / 100 };
  }, [contract, distanceKm, isRoundTrip, profile]);

  if (!open) return null;

  function reset() {
    setDate(todayISODate());
    setFrom("");
    setTo("");
    setDistance(0);
    setDuration(0);
    setRoundTrip(true);
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entry: TravelEntry = {
      id: `tv_${Date.now()}`,
      ticketId,
      ticketNumber,
      organizationId,
      organizationName,
      agentId: "usr_current",
      agentName: "Jean-Philippe Côté",
      date: new Date(`${date}T00:00:00`).toISOString(),
      fromLocation,
      toLocation,
      distanceKm,
      durationMinutes,
      isRoundTrip,
      coverageStatus,
      coverageReason,
      ratePerKm: profile.ratePerKm,
      flatFee: profile.travelFlatFee,
      amount: coverageStatus === "included_in_contract" ? undefined : amount,
      notes,
      approvalStatus: "draft",
      createdAt: new Date().toISOString(),
    };
    onSave(entry);
    reset();
    onClose();
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
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="De" value={fromLocation} onChange={(e) => setFrom(e.target.value)} placeholder="Bureau Cetix..." required />
            <Input label="Vers" value={toLocation} onChange={(e) => setTo(e.target.value)} placeholder="Adresse du client..." required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Distance (km)"
              type="number"
              min={0}
              step={0.1}
              value={distanceKm || ""}
              onChange={(e) => setDistance(Number(e.target.value) || 0)}
            />
            <Input
              label="Durée (minutes)"
              type="number"
              min={0}
              value={durationMinutes || ""}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3">
            <span className="text-[13px] text-slate-700">Aller-retour</span>
            <Switch checked={isRoundTrip} onCheckedChange={setRoundTrip} />
          </label>

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
                Aperçu de facturation
              </h3>
              <CoverageBadge status={coverageStatus} reason={coverageReason} />
            </div>
            <p className="text-[12.5px] text-slate-600 leading-relaxed">{coverageReason}</p>
            <div className="mt-3 flex items-center gap-4 text-[12px] text-slate-500">
              <span>
                Distance totale :{" "}
                <span className="font-semibold text-slate-900">
                  {(distanceKm * (isRoundTrip ? 2 : 1)).toFixed(1)} km
                </span>
              </span>
              <span>
                Taux : <span className="font-semibold text-slate-900">{profile.ratePerKm.toFixed(2)} $/km</span>
              </span>
              {coverageStatus !== "included_in_contract" && (
                <span>
                  Montant : <span className="font-semibold text-emerald-600">{amount.toFixed(2)} $</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={!fromLocation || !toLocation || distanceKm <= 0}>
              <Save className="h-4 w-4" strokeWidth={2.5} />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
