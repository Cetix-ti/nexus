"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Search,
  Plus,
  AlertTriangle,
  FolderKanban,
  CheckCircle2,
  Clock,
  TrendingUp,
  Timer,
  Link2,
  ListChecks,
  Loader2,
  X,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent } from "@/components/ui/card";
import { OrgLogo } from "@/components/organizations/org-logo";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  type Project,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/projects/types";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Format safe d'une date projet : accepte "" / null / undefined sans
 *  faire crasher la carte. Un projet sans date affiche "—". */
function fmtProjectDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM", { locale: fr });
}

const TABS: { key: string; label: string; filter: (p: Project) => boolean }[] = [
  { key: "all", label: "Tous", filter: () => true },
  {
    key: "active",
    label: "Actifs",
    filter: (p) => p.status === "active" || p.status === "planning",
  },
  { key: "risk", label: "À risque", filter: (p) => p.isAtRisk || p.status === "at_risk" },
  { key: "completed", label: "Terminés", filter: (p) => p.status === "completed" },
  { key: "drafts", label: "Brouillons", filter: (p) => p.status === "draft" },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [orgFilter, setOrgFilter] = useState<string[]>([]);
  const [managerFilter, setManagerFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const loadProjects = useCallback(() => {
    setLoading(true);
    fetch("/api/v1/projects")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setProjects(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const orgOptions = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.organizationId, p.organizationName));
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [projects]);

  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.managerId, p.managerName));
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [projects]);

  const statusOptions = useMemo(
    () =>
      (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => ({
        value: s,
        label: PROJECT_STATUS_LABELS[s],
      })),
    []
  );

  const tabFilter = TABS.find((t) => t.key === activeTab)!.filter;

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (!tabFilter(p)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.code.toLowerCase().includes(q) &&
          !p.organizationName.toLowerCase().includes(q) &&
          !p.description.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter.length && !statusFilter.includes(p.status)) return false;
      if (orgFilter.length && !orgFilter.includes(p.organizationId)) return false;
      if (managerFilter.length && !managerFilter.includes(p.managerId)) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      return true;
    });
    // `projects` ESSENTIEL dans les deps — sans ça, le memo capture le
    // tableau initial vide au premier render et ne se met jamais à jour
    // quand le fetch termine. C'est ce qui faisait qu'on voyait "2" dans
    // la pastille mais rien dans la grille.
  }, [projects, search, statusFilter, orgFilter, managerFilter, typeFilter, tabFilter]);

  const stats = useMemo(() => {
    const active = projects.filter(
      (p) => p.status === "active" || p.status === "planning"
    ).length;
    const risk = projects.filter((p) => p.isAtRisk || p.status === "at_risk").length;
    const now = new Date();
    const completedThisMonth = projects.filter((p) => {
      if (p.status !== "completed" || !p.actualEndDate) return false;
      const d = new Date(p.actualEndDate);
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    }).length;
    const consumed = projects.reduce((s, p) => s + (p.consumedHours || 0), 0);
    const budget = projects.reduce((s, p) => s + (p.budgetHours || 0), 0);
    const avgProgress = projects.length > 0
      ? Math.round(projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length)
      : 0;
    return { active, risk, completedThisMonth, consumed, budget, avgProgress };
  }, []);

  const statCards = [
    {
      label: "Projets actifs",
      value: stats.active,
      icon: FolderKanban,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "À risque",
      value: stats.risk,
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
      danger: true,
    },
    {
      label: "Terminés ce mois",
      value: stats.completedThisMonth,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Heures consommées",
      value: `${stats.consumed.toFixed(0)} h`,
      icon: Timer,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Heures budgétées",
      value: `${stats.budget.toFixed(0)} h`,
      icon: Clock,
      color: "text-slate-600",
      bg: "bg-slate-50",
    },
    {
      label: "Avancement moyen",
      value: `${stats.avgProgress}%`,
      icon: TrendingUp,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
  ];

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
              Projets clients
            </h1>
            <span className="inline-flex h-6 items-center rounded-full bg-slate-100 px-2.5 text-[11.5px] font-semibold text-slate-600 tabular-nums">
              {projects.length}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Suivez l&apos;avancement de vos projets clients
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau projet
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={cn(
                "rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                s.danger ? "border-red-200/80" : "border-slate-200/80"
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">
                  {s.label}
                </p>
                <div
                  className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center",
                    s.bg
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", s.color)} />
                </div>
              </div>
              <p
                className={cn(
                  "mt-2 text-[22px] font-semibold tracking-tight tabular-nums",
                  s.danger ? "text-red-600" : "text-slate-900"
                )}
              >
                {s.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Input
            iconLeft={<Search className="h-4 w-4" />}
            placeholder="Rechercher un projet, code, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <MultiSelect
          options={statusOptions}
          selected={statusFilter}
          onChange={setStatusFilter}
          placeholder="Statut"
          width={170}
        />
        <MultiSelect
          options={orgOptions}
          selected={orgFilter}
          onChange={setOrgFilter}
          placeholder="Organisation"
          width={200}
        />
        <MultiSelect
          options={managerOptions}
          selected={managerFilter}
          onChange={setManagerFilter}
          placeholder="Responsable"
          width={190}
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {PROJECT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200/80 mb-5">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => {
            const count = projects.filter(tab.filter).length;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "text-blue-600"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums",
                      isActive
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {count}
                  </span>
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Project cards grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 py-16 text-center">
          <FolderKanban className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-[13.5px] text-slate-500">
            Aucun projet ne correspond aux filtres.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      {createOpen && (
        <NewProjectModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); loadProjects(); }}
        />
      )}
    </div>
  );
}

function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [type, setType] = useState<string>("internal");
  const [description, setDescription] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [budgetHours, setBudgetHours] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string; isInternal?: boolean }[]>([]);
  const [projectTypes, setProjectTypes] = useState<{ key: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setOrgs(list.map((o: any) => ({ id: o.id, name: o.name })));
      })
      .catch(() => {});
    fetch("/api/v1/settings/project-types")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setProjectTypes(data);
        else setProjectTypes(Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => ({ key: k, label: v })));
      })
      .catch(() => {
        setProjectTypes(Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => ({ key: k, label: v })));
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !orgId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          organizationId: orgId,
          organizationName: orgs.find((o) => o.id === orgId)?.name ?? "",
          type,
          description,
          status: "planning",
          startDate: new Date().toISOString().split("T")[0],
          isInternal,
          budgetHours: budgetHours ? Number(budgetHours) : undefined,
          budgetAmount: budgetAmount ? Number(budgetAmount) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">
            Nouveau projet
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Nom du projet"
            placeholder="Migration Exchange → M365"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Organisation
            </label>
            <OrgAutocomplete
              orgs={orgs}
              value={orgId}
              onChange={setOrgId}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Type
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {projectTypes.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Décrivez le projet..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Budget heures (optionnel)"
              type="number"
              placeholder="40"
              value={budgetHours}
              onChange={(e) => setBudgetHours(e.target.value)}
            />
            <Input
              label="Budget $ (optionnel)"
              type="number"
              placeholder="5000"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-[13px] font-medium text-slate-900">Projet interne (Cetix)</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                Le projet sera exclu des vues clients et apparaîtra dans « Projets internes ».
              </p>
            </div>
          </label>
          {error && (
            <p className="text-[12px] text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={saving || !name.trim() || !orgId}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Créer le projet
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Autocomplete combobox pour sélectionner une organisation. Permet la saisie
// libre avec filtrage en direct sur le nom — pratique quand on a 50+ clients.
function OrgAutocomplete({
  orgs,
  value,
  onChange,
}: {
  orgs: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = orgs.find((o) => o.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open && selected) setQuery(selected.name);
  }, [selected, open]);

  const filtered = query.trim()
    ? orgs.filter((o) => o.name.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
    : orgs.slice(0, 20);

  function pick(id: string) {
    const o = orgs.find((x) => x.id === id);
    onChange(id);
    if (o) setQuery(o.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && filtered[highlight]) { e.preventDefault(); pick(filtered[highlight].id); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        placeholder="Rechercher une organisation..."
        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.id)}
              className={cn(
                "w-full text-left px-3 py-2 text-[13px] transition-colors",
                i === highlight ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700",
              )}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg p-3 text-[12.5px] text-slate-500">
          Aucune organisation trouvée.
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const statusCfg = PROJECT_STATUS_COLORS[p.status];
  const isAtRisk = p.isAtRisk || p.status === "at_risk";

  return (
    <Link
      href={`/projects/${p.id}`}
      className="group block rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-slate-300 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.08)]"
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] font-medium text-slate-400 tabular-nums">
            {p.code}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1",
              statusCfg.bg,
              statusCfg.text,
              statusCfg.ring
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
            {PROJECT_STATUS_LABELS[p.status]}
          </span>
        </div>
        {isAtRisk && (
          <div className="flex items-center gap-1 text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[10.5px] font-semibold">À risque</span>
          </div>
        )}
      </div>

      {/* Name */}
      <h3 className="text-[15px] font-semibold text-slate-900 leading-tight tracking-tight group-hover:text-blue-600 transition-colors">
        {p.name}
      </h3>
      <p className="mt-1 text-[12.5px] text-slate-500 line-clamp-2 leading-relaxed">
        {p.description}
      </p>

      {/* Org row */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <OrgLogo name={p.organizationName} size={24} rounded="full" />
          <span className="text-[12.5px] font-medium text-slate-700 truncate">
            {p.organizationName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <span>Resp.</span>
          <span className="font-medium text-slate-700">{p.managerName}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Avancement
          </span>
          <span
            className={cn(
              "text-[12px] font-semibold tabular-nums",
              isAtRisk ? "text-red-600" : "text-slate-700"
            )}
          >
            {p.progressPercent}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isAtRisk
                ? "bg-gradient-to-r from-red-500 to-red-600"
                : "bg-gradient-to-r from-blue-500 to-blue-600"
            )}
            style={{ width: `${p.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-3 text-[11.5px] text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {fmtProjectDate(p.startDate)} → {fmtProjectDate(p.targetEndDate)}
          </span>
          <span className="flex items-center gap-1">
            <ListChecks className="h-3 w-3" />
            {p.completedTaskCount}/{p.taskCount}
          </span>
          {p.linkedTicketCount > 0 && (
            <span className="flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              {p.linkedTicketCount}
            </span>
          )}
        </div>
        <div className="flex -space-x-1.5">
          {Array.from({ length: Math.min(p.memberCount, 4) }).map((_, i) => (
            <div
              key={i}
              className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 ring-2 ring-white flex items-center justify-center text-white text-[9px] font-semibold"
            >
              {String.fromCharCode(65 + i)}
            </div>
          ))}
          {p.memberCount > 4 && (
            <div className="h-6 w-6 rounded-full bg-slate-100 ring-2 ring-white flex items-center justify-center text-slate-600 text-[9px] font-semibold">
              +{p.memberCount - 4}
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      {p.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-slate-200/70"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
