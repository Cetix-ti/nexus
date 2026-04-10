"use client";

import { useMemo, useState } from "react";
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
import { mockProjects } from "@/lib/projects/mock-data";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [orgFilter, setOrgFilter] = useState<string[]>([]);
  const [managerFilter, setManagerFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("all");

  const orgOptions = useMemo(() => {
    const map = new Map<string, string>();
    mockProjects.forEach((p) => map.set(p.organizationId, p.organizationName));
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, []);

  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    mockProjects.forEach((p) => map.set(p.managerId, p.managerName));
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, []);

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
    return mockProjects.filter((p) => {
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
  }, [search, statusFilter, orgFilter, managerFilter, typeFilter, tabFilter]);

  const stats = useMemo(() => {
    const active = mockProjects.filter(
      (p) => p.status === "active" || p.status === "planning"
    ).length;
    const risk = mockProjects.filter((p) => p.isAtRisk || p.status === "at_risk").length;
    const now = new Date();
    const completedThisMonth = mockProjects.filter((p) => {
      if (p.status !== "completed" || !p.actualEndDate) return false;
      const d = new Date(p.actualEndDate);
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    }).length;
    const consumed = mockProjects.reduce((s, p) => s + (p.consumedHours || 0), 0);
    const budget = mockProjects.reduce((s, p) => s + (p.budgetHours || 0), 0);
    const avgProgress = Math.round(
      mockProjects.reduce((s, p) => s + p.progressPercent, 0) / mockProjects.length
    );
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
              Projets
            </h1>
            <span className="inline-flex h-6 items-center rounded-full bg-slate-100 px-2.5 text-[11.5px] font-semibold text-slate-600 tabular-nums">
              {mockProjects.length}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Suivez l&apos;avancement de vos projets clients
          </p>
        </div>
        <Button variant="primary" size="md">
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
            const count = mockProjects.filter(tab.filter).length;
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
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
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
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-[9px] font-semibold ring-2 ring-white shadow-sm">
            {getInitials(p.organizationName)}
          </div>
          <span className="text-[12.5px] font-medium text-slate-700">
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
            {format(new Date(p.startDate), "d MMM", { locale: fr })} →{" "}
            {format(new Date(p.targetEndDate), "d MMM", { locale: fr })}
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
