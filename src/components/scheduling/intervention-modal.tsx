"use client";

import { useEffect, useState } from "react";
import { X, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  INTERVENTION_TYPE_LABELS,
  INTERVENTION_STATUS_LABELS,
  type ScheduledIntervention,
  type InterventionType,
  type InterventionStatus,
} from "@/lib/scheduling/types";
import { mockSchedulerTechnicians } from "@/lib/scheduling/mock-data";

interface InterventionModalProps {
  open: boolean;
  onClose: () => void;
  intervention: ScheduledIntervention | null;
  onSave?: (i: ScheduledIntervention) => void;
}

function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toTimeInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combine(date: string, time: string): string {
  if (!date) return new Date().toISOString();
  const [hh = "0", mm = "0"] = (time || "00:00").split(":");
  const d = new Date(date + "T00:00:00");
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d.toISOString();
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function InterventionModal({ open, onClose, intervention, onSave }: InterventionModalProps) {
  const isEditing = !!intervention;

  const [title, setTitle] = useState("");
  const [type, setType] = useState<InterventionType>("remote_intervention");
  const [status, setStatus] = useState<InterventionStatus>("scheduled");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isAllDay, setIsAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [organization, setOrganization] = useState("");
  const [site, setSite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [primaryTech, setPrimaryTech] = useState<string>("");
  const [extraTechs, setExtraTechs] = useState<string[]>([]);
  const [ticketLink, setTicketLink] = useState("");
  const [travelTime, setTravelTime] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [clientNotes, setClientNotes] = useState("");

  // Fetch organizations from API
  const [organizations, setOrganizations] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; name: string }[]) => {
        if (Array.isArray(data)) setOrganizations(data.map((o) => o.name));
      })
      .catch(() => setOrganizations([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (intervention) {
      setTitle(intervention.title);
      setType(intervention.type);
      setStatus(intervention.status);
      setDate(toDateInput(intervention.startsAt));
      setStartTime(toTimeInput(intervention.startsAt));
      setEndTime(toTimeInput(intervention.endsAt));
      setIsAllDay(intervention.isAllDay);
      setDescription(intervention.description ?? "");
      setOrganization(intervention.organizationName);
      setSite(intervention.siteName ?? "");
      setContactName(intervention.contactName ?? "");
      setContactPhone(intervention.contactPhone ?? "");
      setPrimaryTech(intervention.primaryTechnicianId ?? intervention.technicianIds[0] ?? "");
      setExtraTechs(
        intervention.technicianIds.filter(
          (id) => id !== (intervention.primaryTechnicianId ?? intervention.technicianIds[0])
        )
      );
      setTicketLink(intervention.ticketNumber ?? "");
      setTravelTime(intervention.travelTimeMinutes ? String(intervention.travelTimeMinutes) : "");
      setIsRecurring(intervention.isRecurring);
      setClientNotes(intervention.clientNotes ?? "");
    } else {
      setTitle("");
      setType("remote_intervention");
      setStatus("scheduled");
      setDate(toDateInput(new Date().toISOString()));
      setStartTime("09:00");
      setEndTime("10:00");
      setIsAllDay(false);
      setDescription("");
      setOrganization("");
      setSite("");
      setContactName("");
      setContactPhone("");
      setPrimaryTech("");
      setExtraTechs([]);
      setTicketLink("");
      setTravelTime("");
      setIsRecurring(false);
      setClientNotes("");
    }
  }, [open, intervention]);

  if (!open) return null;

  const primaryTechObj = mockSchedulerTechnicians.find((t) => t.id === primaryTech);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const startsAt = combine(date, isAllDay ? "00:00" : startTime);
    const endsAt = combine(date, isAllDay ? "23:59" : endTime);
    const allTechIds = [primaryTech, ...extraTechs].filter(Boolean);
    const allTechNames = allTechIds.map(
      (id) => mockSchedulerTechnicians.find((t) => t.id === id)?.name ?? ""
    );
    const built: ScheduledIntervention = {
      id: intervention?.id ?? `sch_${Date.now()}`,
      startsAt,
      endsAt,
      durationMinutes: Math.max(
        0,
        Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
      ),
      isAllDay,
      title,
      description: description || undefined,
      type,
      status,
      ticketNumber: ticketLink || undefined,
      organizationId: intervention?.organizationId ?? "org",
      organizationName: organization,
      siteName: site || undefined,
      contactName: contactName || undefined,
      contactPhone: contactPhone || undefined,
      technicianIds: allTechIds,
      technicianNames: allTechNames,
      primaryTechnicianId: primaryTech || undefined,
      travelTimeMinutes: travelTime ? Number(travelTime) : undefined,
      isRecurring,
      clientNotes: clientNotes || undefined,
      createdAt: intervention?.createdAt ?? new Date().toISOString(),
      createdBy: intervention?.createdBy ?? "Système",
      updatedAt: new Date().toISOString(),
    };
    onSave?.(built);
    onClose();
  }

  const techOptions = mockSchedulerTechnicians
    .filter((t) => t.id !== primaryTech)
    .map((t) => ({ label: t.name, value: t.id }));

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            {primaryTechObj ? (
              <div
                className={cn(
                  "h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-[12px] font-semibold ring-1 ring-inset ring-white/40",
                  primaryTechObj.color
                )}
              >
                {getInitials(primaryTechObj.name)}
              </div>
            ) : (
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
                <CalendarDays className="h-5 w-5" strokeWidth={2.25} />
              </div>
            )}
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {isEditing ? intervention!.title : "Nouvelle intervention"}
              </h2>
              <p className="text-[12.5px] text-slate-500">
                {isEditing
                  ? "Modifier les détails de l'intervention planifiée"
                  : "Planifier une nouvelle intervention pour votre équipe"}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <Input
            label="Titre"
            placeholder="Ex: Diagnostic VPN — Acme Corp"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as InterventionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVENTION_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Statut</label>
              <Select value={status} onValueChange={(v) => setStatus(v as InterventionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVENTION_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date / heures */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Heure de début</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isAllDay}
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Heure de fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={isAllDay}
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* All day toggle */}
          <ToggleRow
            label="Toute la journée"
            description="L'intervention bloque la journée complète"
            value={isAllDay}
            onChange={setIsAllDay}
          />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Détails de l'intervention..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          {/* Organisation + Site */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Organisation</label>
              <Select value={organization} onValueChange={setOrganization}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Site"
              placeholder="Ex: Bureau principal"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Contact"
              placeholder="Nom du contact"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <Input
              label="Téléphone"
              placeholder="+1 514 555-0000"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>

          {/* Techniciens */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Technicien principal
              </label>
              <Select value={primaryTech} onValueChange={setPrimaryTech}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {mockSchedulerTechnicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Techniciens additionnels
              </label>
              <MultiSelect
                options={techOptions}
                selected={extraTechs}
                onChange={setExtraTechs}
                placeholder="Aucun"
                width={320}
              />
            </div>
          </div>

          {/* Ticket + travel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Ticket lié"
              placeholder="Ex: INC-1042"
              value={ticketLink}
              onChange={(e) => setTicketLink(e.target.value)}
            />
            <Input
              label="Temps de déplacement (min)"
              type="number"
              min={0}
              placeholder="0"
              value={travelTime}
              onChange={(e) => setTravelTime(e.target.value)}
            />
          </div>

          <ToggleRow
            label="Récurrent"
            description="L'intervention se répète selon une règle de récurrence"
            value={isRecurring}
            onChange={setIsRecurring}
          />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Notes client</label>
            <textarea
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              rows={3}
              placeholder="Notes internes ou consignes du client..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              {isEditing ? "Enregistrer" : "Créer l'intervention"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 flex items-start justify-between gap-3">
      <div>
        <h4 className="text-[13.5px] font-semibold text-slate-900">{label}</h4>
        <p className="text-[11.5px] text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors mt-1",
          value ? "bg-blue-600" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow translate-y-0.5",
            value ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
