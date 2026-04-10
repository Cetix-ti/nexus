"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Search,
  Repeat,
  Calendar,
  Clock,
  Play,
  Pause,
  Pencil,
  Trash2,
  History,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import type { RecurringRun } from "@/lib/scheduling/recurring-types";
import {
  describeSchedule,
  type RecurringTicketTemplate,
  type RecurrenceFrequency,
} from "@/lib/scheduling/recurring-types";
import { RecurringTemplateModal } from "@/components/scheduling/recurring-template-modal";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";

const ORG_OPTIONS = [
  { label: "Acme Corp", value: "org-2" },
  { label: "TechStart Inc", value: "org-3" },
  { label: "Global Finance", value: "org-4" },
  { label: "HealthCare Plus", value: "org-5" },
  { label: "MédiaCentre QC", value: "org-6" },
];

const FREQUENCY_OPTIONS: { label: string; value: RecurrenceFrequency }[] = [
  { label: "Quotidien", value: "daily" },
  { label: "Hebdomadaire", value: "weekly" },
  { label: "Mensuel", value: "monthly" },
  { label: "Annuel", value: "yearly" },
];

const FREQUENCY_COLORS: Record<RecurrenceFrequency, string> = {
  daily: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  weekly: "bg-blue-50 text-blue-700 ring-blue-200/70",
  monthly: "bg-violet-50 text-violet-700 ring-violet-200/70",
  yearly: "bg-amber-50 text-amber-700 ring-amber-200/70",
  custom: "bg-slate-50 text-slate-700 ring-slate-200/70",
};

export default function SchedulingPage() {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState<string[]>([]);
  const [freqFilter, setFreqFilter] = useState<string[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [templates, setTemplates] = useState<RecurringTicketTemplate[]>([]);
  const [runs, setRuns] = useState<RecurringRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] =
    useState<RecurringTicketTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/scheduling/templates").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tplData]) => {
        if (Array.isArray(tplData)) setTemplates(tplData);
      })
      .catch((e) => console.error("scheduling load failed", e))
      .finally(() => setLoading(false));
  }, []);

  function handleSave(template: RecurringTicketTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === template.id);
      if (exists) {
        return prev.map((t) => (t.id === template.id ? template : t));
      }
      return [...prev, template];
    });
    setEditingTemplate(null);
    setCreatingTemplate(false);
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (!showInactive && !t.isActive) return false;
      if (orgFilter.length > 0 && !orgFilter.includes(t.organizationId))
        return false;
      if (freqFilter.length > 0 && !freqFilter.includes(t.schedule.frequency))
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !t.name.toLowerCase().includes(q) &&
          !t.organizationName.toLowerCase().includes(q) &&
          !t.ticketSubject.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [templates, search, orgFilter, freqFilter, showInactive]);

  const stats = useMemo(() => {
    const active = templates.filter((t) => t.isActive);
    const totalRuns = templates.reduce((acc, t) => acc + t.totalRunsCount, 0);
    const upcomingToday = active.filter((t) => {
      if (!t.nextRunAt) return false;
      const next = new Date(t.nextRunAt);
      const today = new Date();
      return (
        next.getDate() === today.getDate() &&
        next.getMonth() === today.getMonth() &&
        next.getFullYear() === today.getFullYear()
      );
    }).length;
    return {
      total: templates.length,
      active: active.length,
      paused: templates.length - active.length,
      totalRuns,
      upcomingToday,
    };
  }, [templates]);

  function toggleActive(id: string) {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isActive: !t.isActive } : t))
    );
  }

  function deleteTemplate(id: string) {
    if (!confirm("Supprimer ce modèle récurrent ?")) return;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
              Planificateur de tickets
            </h1>
            <span className="inline-flex h-6 items-center rounded-md bg-slate-100 px-2 text-[11.5px] font-semibold text-slate-600 tabular-nums ring-1 ring-inset ring-slate-200/60">
              {filtered.length}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Configurez des tickets qui seront créés automatiquement sur un
            horaire défini
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => setCreatingTemplate(true)}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Nouveau modèle récurrent
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Repeat} label="Modèles totaux" value={stats.total} color="text-blue-600 bg-blue-50" />
        <StatCard icon={Play} label="Actifs" value={stats.active} color="text-emerald-600 bg-emerald-50" />
        <StatCard icon={Pause} label="En pause" value={stats.paused} color="text-amber-600 bg-amber-50" />
        <StatCard icon={Calendar} label="Prévus aujourd'hui" value={stats.upcomingToday} color="text-violet-600 bg-violet-50" />
        <StatCard icon={TrendingUp} label="Exécutions totales" value={stats.totalRuns} color="text-cyan-600 bg-cyan-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72">
          <Input
            placeholder="Rechercher un modèle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <MultiSelect options={ORG_OPTIONS} selected={orgFilter} onChange={setOrgFilter} placeholder="Organisation" width={200} />
        <MultiSelect
          options={FREQUENCY_OPTIONS.map((f) => ({ label: f.label, value: f.value }))}
          selected={freqFilter}
          onChange={setFreqFilter}
          placeholder="Fréquence"
          width={170}
        />
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={cn(
            "inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border text-[13px] font-medium transition-colors",
            showInactive
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          <Pause className="h-3.5 w-3.5" strokeWidth={2.25} />
          Inclure inactifs
        </button>
      </div>

      {/* Template list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-slate-700">
              Aucun modèle récurrent
            </p>
            <p className="text-[12px] text-slate-500 mt-1">
              Cliquez sur « Nouveau modèle récurrent » pour automatiser la
              création de tickets
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => setEditingTemplate(t)}
              onToggle={() => toggleActive(t.id)}
              onDelete={() => deleteTemplate(t.id)}
            />
          ))}
        </div>
      )}

      {/* Recent runs */}
      <div className="mt-4">
        <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-slate-500" />
          Exécutions récentes
        </h2>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60">
                  {r.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-900 truncate">
                      {r.templateName}
                    </p>
                    <p className="text-[11.5px] text-slate-500">
                      {formatDistanceToNow(new Date(r.ranAt), { addSuffix: true, locale: fr })}
                      {r.createdTicketNumber && ` · Ticket créé : ${r.createdTicketNumber}`}
                    </p>
                  </div>
                  <Badge variant={r.status === "success" ? "success" : "danger"}>
                    {r.status === "success" ? "Réussi" : "Échec"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit / Create modal */}
      <RecurringTemplateModal
        open={!!editingTemplate || creatingTemplate}
        template={editingTemplate}
        onClose={() => {
          setEditingTemplate(null);
          setCreatingTemplate(false);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Repeat;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", color)}>
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="text-[20px] font-semibold tabular-nums text-slate-900">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateCard({
  template,
  onEdit,
  onToggle,
  onDelete,
}: {
  template: RecurringTicketTemplate;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={cn("card-hover", !template.isActive && "opacity-70")}>
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-inset shrink-0",
                FREQUENCY_COLORS[template.schedule.frequency]
              )}
            >
              <Repeat className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-semibold text-slate-900">
                  {template.name}
                </h3>
                <Badge variant={template.isActive ? "success" : "default"}>
                  {template.isActive ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Actif
                    </>
                  ) : (
                    <>
                      <Pause className="h-2.5 w-2.5" />
                      En pause
                    </>
                  )}
                </Badge>
                <Badge variant="outline">{template.organizationName}</Badge>
              </div>
              {template.description && (
                <p className="mt-1 text-[12.5px] text-slate-500">
                  {template.description}
                </p>
              )}

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50/60 ring-1 ring-inset ring-slate-200/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 inline-flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    Planification
                  </p>
                  <p className="text-[12.5px] font-medium text-slate-800">
                    {describeSchedule(template.schedule)}
                  </p>
                  {template.nextRunAt && template.isActive && (
                    <p className="mt-1 text-[11px] text-blue-600 inline-flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      Prochaine : {format(new Date(template.nextRunAt), "d MMM HH:mm", { locale: fr })}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-slate-50/60 ring-1 ring-inset ring-slate-200/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 inline-flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    Ticket créé
                  </p>
                  <p className="text-[12.5px] font-medium text-slate-800 truncate">
                    {template.ticketSubject}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10.5px] text-slate-500">Type :</span>
                    <Badge variant="default">{template.ticketType}</Badge>
                    {template.defaultAssigneeName && (
                      <>
                        <span className="text-[10.5px] text-slate-500">→</span>
                        <span className="text-[10.5px] text-slate-700">
                          {template.defaultAssigneeName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {template.totalRunsCount} exécutions
                </span>
                {template.lastRunAt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Dernière : {formatDistanceToNow(new Date(template.lastRunAt), { addSuffix: true, locale: fr })}
                  </span>
                )}
                <span>
                  Créé par <strong>{template.createdBy}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggle}
              className={cn(
                "h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors",
                template.isActive
                  ? "text-amber-600 hover:bg-amber-50"
                  : "text-emerald-600 hover:bg-emerald-50"
              )}
              title={template.isActive ? "Mettre en pause" : "Activer"}
            >
              {template.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={onEdit}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Modifier"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600" title="Supprimer">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
