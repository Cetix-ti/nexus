"use client";

import { useMemo, useState } from "react";
import { X, Clock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  TIME_TYPE_LABELS,
  TIME_TYPE_ICONS,
  type TimeType,
  type TimeEntry,
} from "@/lib/billing/types";
import { decideBilling } from "@/lib/billing/engine";
import { mockBillingProfiles, mockContracts } from "@/lib/billing/mock-data";
import { CoverageBadge } from "./coverage-badge";

interface AddTimeModalProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  onSave: (entry: TimeEntry) => void;
}

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];

function todayISODate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function diffMinutes(date: string, start: string, end: string): number {
  if (!date || !start || !end) return 0;
  const s = new Date(`${date}T${start}:00`).getTime();
  const e = new Date(`${date}T${end}:00`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / 60000);
}

export function AddTimeModal({
  open,
  onClose,
  ticketId,
  ticketNumber,
  organizationId,
  organizationName,
  onSave,
}: AddTimeModalProps) {
  const [timeType, setTimeType] = useState<TimeType>("remote_work");
  const [date, setDate] = useState(todayISODate());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [manualMode, setManualMode] = useState(false);
  const [manualMinutes, setManualMinutes] = useState(60);
  const [description, setDescription] = useState("");
  const [isOnsite, setIsOnsite] = useState(false);
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [isWeekend, setIsWeekend] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [forceNonBillable, setForceNonBillable] = useState(false);

  const durationMinutes = manualMode
    ? manualMinutes
    : diffMinutes(date, startTime, endTime);

  const billingProfile = mockBillingProfiles[0];
  const contract = useMemo(
    () => mockContracts.find((c) => c.organizationId === organizationId),
    [organizationId]
  );

  const decision = useMemo(() => {
    if (durationMinutes <= 0) return null;
    return decideBilling({
      timeType,
      durationMinutes,
      isOnsite,
      isAfterHours,
      isWeekend,
      isUrgent,
      organizationId,
      contract,
      billingProfile,
      forceNonBillable,
    });
  }, [
    timeType,
    durationMinutes,
    isOnsite,
    isAfterHours,
    isWeekend,
    isUrgent,
    organizationId,
    contract,
    billingProfile,
    forceNonBillable,
  ]);

  if (!open) return null;

  function handleTypeChange(t: TimeType) {
    setTimeType(t);
    if (t === "onsite_work") setIsOnsite(true);
    if (t === "remote_work") setIsOnsite(false);
  }

  function reset() {
    setTimeType("remote_work");
    setDate(todayISODate());
    setStartTime("09:00");
    setEndTime("10:00");
    setManualMode(false);
    setManualMinutes(60);
    setDescription("");
    setIsOnsite(false);
    setIsAfterHours(false);
    setIsWeekend(false);
    setIsUrgent(false);
    setForceNonBillable(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision || durationMinutes <= 0) return;
    const now = new Date().toISOString();
    const startedAt = new Date(`${date}T${startTime}:00`).toISOString();
    const endedAt = manualMode
      ? undefined
      : new Date(`${date}T${endTime}:00`).toISOString();
    const entry: TimeEntry = {
      id: `te_${Date.now()}`,
      ticketId,
      ticketNumber,
      organizationId,
      organizationName,
      contractId: contract?.id,
      agentId: "usr_current",
      agentName: "Jean-Philippe Côté",
      timeType,
      startedAt,
      endedAt,
      durationMinutes,
      description,
      isAfterHours,
      isWeekend,
      isUrgent,
      isOnsite,
      coverageStatus: decision.status,
      coverageReason: decision.reason,
      hourlyRate: decision.rate,
      amount: decision.amount,
      approvalStatus: "draft",
      createdAt: now,
      updatedAt: now,
    };
    onSave(entry);
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Clock className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Ajouter du temps
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
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Type de temps
            </label>
            <Select value={timeType} onValueChange={(v) => handleTypeChange(v as TimeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIME_TYPE_LABELS) as TimeType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIME_TYPE_ICONS[t]} {TIME_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="flex items-end justify-end">
              <div className="flex items-center gap-2 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                    !manualMode ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60" : "text-slate-500"
                  )}
                >
                  Plage horaire
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                    manualMode ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60" : "text-slate-500"
                  )}
                >
                  Durée manuelle
                </button>
              </div>
            </div>
          </div>

          {!manualMode ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Heure de début
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Heure de fin
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Durée (minutes)
              </label>
              <Input
                type="number"
                min={1}
                value={manualMinutes}
                onChange={(e) => setManualMinutes(Number(e.target.value) || 0)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setManualMinutes(m)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                      manualMinutes === m
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Description du travail
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Décrivez le travail effectué..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
            {[
              { label: "Sur site", value: isOnsite, set: setIsOnsite },
              { label: "Heures supplémentaires", value: isAfterHours, set: setIsAfterHours },
              { label: "Week-end", value: isWeekend, set: setIsWeekend },
              { label: "Intervention urgente", value: isUrgent, set: setIsUrgent },
              { label: "Forcer non-facturable", value: forceNonBillable, set: setForceNonBillable },
            ].map((row) => (
              <label key={row.label} className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-[13px] text-slate-700">{row.label}</span>
                <Switch checked={row.value} onCheckedChange={row.set} />
              </label>
            ))}
          </div>

          {decision && (
            <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                  Couverture
                </h3>
                <CoverageBadge status={decision.status} reason={decision.reason} />
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                {decision.reason}
              </p>
              <div className="mt-3 flex items-center gap-4 text-[12px] text-slate-500">
                <span>
                  Durée :{" "}
                  <span className="font-semibold text-slate-900">
                    {Math.floor(durationMinutes / 60)}h {durationMinutes % 60}min
                  </span>
                </span>
              </div>
              {/*
                Confidentialité : taux horaire et montants ne sont JAMAIS affichés
                dans l'interface ticket. Ils restent dans la section dédiée
                « Facturation » accessible uniquement aux rôles facturation /
                admin (cf. (app)/billing).
              */}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={durationMinutes <= 0 || !description.trim()}>
              <Save className="h-4 w-4" strokeWidth={2.5} />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
