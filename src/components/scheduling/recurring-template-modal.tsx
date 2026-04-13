"use client";

import { useState, useEffect } from "react";
import { X, Repeat, Calendar, Sparkles, Check } from "lucide-react";
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
import {
  WEEKDAY_LONG,
  describeSchedule,
  type RecurringTicketTemplate,
  type RecurrenceFrequency,
  type WeekDay,
  type MonthlyPattern,
} from "@/lib/scheduling/recurring-types";

interface RecurringTemplateModalProps {
  open: boolean;
  template: RecurringTicketTemplate | null; // null = create mode
  onClose: () => void;
  onSave: (template: RecurringTicketTemplate) => void;
}

const FREQ_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "daily", label: "Quotidien" },
  { value: "weekly", label: "Hebdomadaire" },
  { value: "monthly", label: "Mensuel" },
  { value: "yearly", label: "Annuel" },
];

const QUEUES = [
  "Support général",
  "Réseau & Infrastructure",
  "Sécurité",
  "Infrastructure Cloud",
  "Demandes de service",
  "Projets",
];

const WEEKDAYS: WeekDay[] = [1, 2, 3, 4, 5, 6, 7];

const MONTHLY_PATTERNS: { value: MonthlyPattern; label: string }[] = [
  { value: "day_of_month", label: "Jour fixe du mois" },
  { value: "first_weekday", label: "Premier jour spécifique" },
  { value: "last_weekday", label: "Dernier jour spécifique" },
  { value: "nth_weekday", label: "Nième jour spécifique" },
];

function emptyTemplate(): RecurringTicketTemplate {
  const now = new Date().toISOString();
  return {
    id: `rt_${Date.now()}`,
    name: "",
    description: "",
    organizationId: "org-2",
    organizationName: "Acme Corp",
    createdBy: "Jean-Philippe Côté",
    ticketSubject: "",
    ticketDescription: "",
    ticketType: "service_request",
    ticketPriority: "medium",
    ticketUrgency: "medium",
    ticketImpact: "medium",
    ticketSource: "monitoring",
    defaultAssigneeName: undefined,
    defaultQueueName: undefined,
    defaultCategory: undefined,
    defaultRequesterName: "Système Cetix",
    defaultTags: ["récurrent"],
    schedule: {
      frequency: "weekly",
      interval: 1,
      startDate: new Date().toISOString(),
      timeOfDay: "08:00",
      daysOfWeek: [1],
    },
    isActive: true,
    totalRunsCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function RecurringTemplateModal({
  open,
  template,
  onClose,
  onSave,
}: RecurringTemplateModalProps) {
  const [form, setForm] = useState<RecurringTicketTemplate>(emptyTemplate());

  // Fetch organizations from API
  const [orgOptions, setOrgOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; name: string }[]) => {
        if (Array.isArray(data)) setOrgOptions(data);
      })
      .catch(() => setOrgOptions([]));
  }, []);

  // Fetch technicians from API
  const [technicians, setTechnicians] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/v1/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; name: string }[]) => {
        if (Array.isArray(data)) setTechnicians(data.map((u) => u.name));
      })
      .catch(() => setTechnicians([]));
  }, []);

  useEffect(() => {
    if (template) {
      setForm({ ...template });
    } else {
      setForm(emptyTemplate());
    }
  }, [template, open]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  function update<K extends keyof RecurringTicketTemplate>(
    key: K,
    value: RecurringTicketTemplate[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSchedule<K extends keyof RecurringTicketTemplate["schedule"]>(
    key: K,
    value: RecurringTicketTemplate["schedule"][K]
  ) {
    setForm((prev) => ({
      ...prev,
      schedule: { ...prev.schedule, [key]: value },
    }));
  }

  function toggleWeekday(d: WeekDay) {
    const current = form.schedule.daysOfWeek || [];
    const next = current.includes(d)
      ? current.filter((x) => x !== d)
      : [...current, d].sort();
    updateSchedule("daysOfWeek", next);
  }

  function handleOrgChange(orgId: string) {
    const org = orgOptions.find((o) => o.id === orgId);
    setForm((prev) => ({
      ...prev,
      organizationId: orgId,
      organizationName: org?.name || "",
    }));
  }

  function handleSave() {
    if (!form.name.trim() || !form.ticketSubject.trim()) return;
    onSave({
      ...form,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  }

  const isEdit = !!template;
  const freq = form.schedule.frequency;

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
            <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <Repeat className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {isEdit ? "Modifier le modèle récurrent" : "Nouveau modèle récurrent"}
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Configurez la planification et le ticket à créer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[65vh] overflow-y-auto space-y-5">
          {/* GENERAL */}
          <section>
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-3">
              Informations générales
            </h3>
            <div className="space-y-3">
              <Input
                label="Nom du modèle"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Vérification quotidienne des sauvegardes"
              />
              <Input
                label="Description"
                value={form.description || ""}
                onChange={(e) => update("description", e.target.value)}
                placeholder="À quoi sert ce modèle ?"
              />
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Organisation cliente
                </label>
                <Select value={form.organizationId} onValueChange={handleOrgChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orgOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* SCHEDULE */}
          <section>
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-3 inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Planification
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Fréquence
                  </label>
                  <Select
                    value={freq}
                    onValueChange={(v) =>
                      updateSchedule("frequency", v as RecurrenceFrequency)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQ_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Heure d'exécution"
                  type="time"
                  value={form.schedule.timeOfDay}
                  onChange={(e) => updateSchedule("timeOfDay", e.target.value)}
                />
              </div>

              {/* Interval (always shown) */}
              <Input
                label={
                  freq === "daily"
                    ? "Tous les N jours"
                    : freq === "weekly"
                    ? "Toutes les N semaines"
                    : freq === "monthly"
                    ? "Tous les N mois"
                    : "Tous les N ans"
                }
                type="number"
                min="1"
                value={form.schedule.interval}
                onChange={(e) =>
                  updateSchedule("interval", parseInt(e.target.value) || 1)
                }
              />

              {/* Weekly: days of week */}
              {freq === "weekly" && (
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Jours de la semaine
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d) => {
                      const active = (form.schedule.daysOfWeek || []).includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleWeekday(d)}
                          className={cn(
                            "h-9 px-3 rounded-lg text-[12px] font-medium transition-colors",
                            active
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          )}
                        >
                          {WEEKDAY_LONG[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Monthly: pattern */}
              {freq === "monthly" && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                      Modèle mensuel
                    </label>
                    <Select
                      value={form.schedule.monthlyPattern || "day_of_month"}
                      onValueChange={(v) =>
                        updateSchedule("monthlyPattern", v as MonthlyPattern)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHLY_PATTERNS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(form.schedule.monthlyPattern === "day_of_month" ||
                    !form.schedule.monthlyPattern) && (
                    <Input
                      label="Jour du mois (1-31)"
                      type="number"
                      min="1"
                      max="31"
                      value={form.schedule.dayOfMonth || 1}
                      onChange={(e) =>
                        updateSchedule(
                          "dayOfMonth",
                          parseInt(e.target.value) || 1
                        )
                      }
                    />
                  )}
                </div>
              )}

              {/* Yearly */}
              {freq === "yearly" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                      Mois
                    </label>
                    <Select
                      value={String(form.schedule.monthOfYear || 1)}
                      onValueChange={(v) =>
                        updateSchedule("monthOfYear", parseInt(v))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "Janvier",
                          "Février",
                          "Mars",
                          "Avril",
                          "Mai",
                          "Juin",
                          "Juillet",
                          "Août",
                          "Septembre",
                          "Octobre",
                          "Novembre",
                          "Décembre",
                        ].map((m, i) => (
                          <SelectItem key={i} value={String(i + 1)}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    label="Jour du mois"
                    type="number"
                    min="1"
                    max="31"
                    value={form.schedule.dayOfMonth || 1}
                    onChange={(e) =>
                      updateSchedule(
                        "dayOfMonth",
                        parseInt(e.target.value) || 1
                      )
                    }
                  />
                </div>
              )}

              {/* Live preview */}
              <div className="rounded-lg bg-blue-50/40 ring-1 ring-inset ring-blue-200/60 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-0.5">
                  Aperçu
                </p>
                <p className="text-[12.5px] text-blue-900 font-medium">
                  {describeSchedule(form.schedule)}
                </p>
              </div>
            </div>
          </section>

          {/* TICKET PAYLOAD */}
          <section>
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-3 inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Ticket à créer
            </h3>
            <div className="space-y-3">
              <Input
                label="Sujet du ticket"
                value={form.ticketSubject}
                onChange={(e) => update("ticketSubject", e.target.value)}
                placeholder="[Auto] Vérification des sauvegardes"
              />
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  value={form.ticketDescription}
                  onChange={(e) => update("ticketDescription", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  placeholder="Description détaillée..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Type
                  </label>
                  <Select
                    value={form.ticketType}
                    onValueChange={(v) => update("ticketType", v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incident">Incident</SelectItem>
                      <SelectItem value="service_request">Demande de service</SelectItem>
                      <SelectItem value="problem">Problème</SelectItem>
                      <SelectItem value="change">Changement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Priorité
                  </label>
                  <Select
                    value={form.ticketPriority}
                    onValueChange={(v) => update("ticketPriority", v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critique</SelectItem>
                      <SelectItem value="high">Élevée</SelectItem>
                      <SelectItem value="medium">Moyenne</SelectItem>
                      <SelectItem value="low">Faible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Assigné à
                  </label>
                  <Select
                    value={form.defaultAssigneeName || ""}
                    onValueChange={(v) => update("defaultAssigneeName", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Personne" />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    File d&apos;attente
                  </label>
                  <Select
                    value={form.defaultQueueName || ""}
                    onValueChange={(v) => update("defaultQueueName", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aucune" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUEUES.map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSave}>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            {isEdit ? "Enregistrer" : "Créer le modèle"}
          </Button>
        </div>
      </div>
    </div>
  );
}
