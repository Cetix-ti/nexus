"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ChevronRight,
  Edit3,
  MoreHorizontal,
  AlertTriangle,
  Calendar,
  Clock,
  Timer,
  Link2,
  ListChecks,
  CheckCircle2,
  Circle,
  CircleDot,
  Ban,
  Star,
  Plus,
  Eye,
  EyeOff,
  Mail,
  MessageSquare,
  FileText,
  UserPlus,
  Activity,
  Flag,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PHASE_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  PROJECT_ROLE_LABELS,
  type ProjectVisibilitySettings,
  type ProjectTask,
  type TaskStatus,
  type Project,
  type ProjectRole,
  type PhaseStatus,
  type MilestoneStatus,
} from "@/lib/projects/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/mock-data";
import { useTicketsStore } from "@/stores/tickets-store";
import { ProjectKanbanView } from "@/components/projects/project-kanban-view";

const TABS = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "phases", label: "Phases" },
  { key: "milestones", label: "Jalons" },
  { key: "tasks", label: "Tâches" },
  { key: "kanban", label: "Kanban" },
  { key: "tickets", label: "Tickets liés" },
  { key: "activity", label: "Activité" },
  { key: "team", label: "Équipe" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const VISIBILITY_LABELS: Record<keyof ProjectVisibilitySettings, string> = {
  showProject: "Projet visible",
  showPhases: "Phases",
  showMilestones: "Jalons",
  showTasks: "Tâches",
  showLinkedTickets: "Tickets liés",
  showTimeConsumed: "Heures consommées",
  showBudgetVsActual: "Budget vs réel",
  showInternalNotes: "Notes internes",
  showActivity: "Activité",
  showTeamMembers: "Membres",
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<TabKey>("kanban");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/v1/projects/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        const d = json.data;
        const proj: Project = {
          id: d.id,
          code: d.code,
          name: d.name,
          description: d.description ?? "",
          organizationId: d.organizationId,
          organizationName: d.organizationName,
          type: d.type,
          status: d.status,
          priority: d.priority,
          managerId: d.managerId,
          managerName: d.managerName,
          startDate: d.startDate,
          targetEndDate: d.targetEndDate,
          actualEndDate: d.actualEndDate ?? undefined,
          progressPercent: d.progressPercent,
          budgetHours: d.budgetHours ?? undefined,
          consumedHours: d.consumedHours,
          budgetAmount: d.budgetAmount ?? undefined,
          consumedAmount: d.consumedAmount ?? 0,
          isVisibleToClient: d.isVisibleToClient,
          visibilitySettings: {
            showProject: d.isVisibleToClient,
            showPhases: false,
            showMilestones: false,
            showTasks: false,
            showLinkedTickets: false,
            showTimeConsumed: false,
            showBudgetVsActual: false,
            showInternalNotes: false,
            showActivity: false,
            showTeamMembers: false,
          },
          phaseCount: 0,
          milestoneCount: 0,
          taskCount: d.taskCount ?? 0,
          completedTaskCount: d.completedTaskCount ?? 0,
          linkedTicketCount: 0,
          memberCount: 0,
          tags: d.tags ?? [],
          isAtRisk: d.isAtRisk ?? false,
          riskNotes: d.riskNotes ?? undefined,
          isArchived: d.isArchived ?? false,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        };
        setProject(proj);
        setTasks(
          (d.tasks ?? []).map((t: Record<string, unknown>) => ({
            id: t.id as string,
            projectId: d.id,
            phaseId: null,
            name: t.name as string,
            description: (t.description as string) ?? "",
            status: t.status as TaskStatus,
            priority: t.priority as string,
            assigneeId: t.assigneeId as string | null,
            assigneeName: null,
            startDate: t.startDate as string | null,
            dueDate: t.dueDate as string | null,
            completedAt: t.completedAt as string | null,
            estimatedHours: t.estimatedHours as number | null,
            actualHours: t.actualHours as number | null,
            progressPercent: t.progressPercent as number,
            isVisibleToClient: t.isVisibleToClient as boolean,
            order: (t.order as number) ?? 0,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [params.id]);

  const allTickets = useTicketsStore((s) => s.tickets);
  const loadAllTickets = useTicketsStore((s) => s.loadAll);
  const ticketsLoaded = useTicketsStore((s) => s.loaded);
  useEffect(() => {
    if (!ticketsLoaded) loadAllTickets();
  }, [ticketsLoaded, loadAllTickets]);

  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-slate-500 text-[14px]">Chargement du projet...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-slate-500 text-[14px]">Projet introuvable.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour
        </Button>
      </div>
    );
  }

  const linkedTickets = allTickets
    .filter((t) => t.organizationName === project.organizationName)
    .slice(0, 7);

  const statusCfg = PROJECT_STATUS_COLORS[project.status];
  const isAtRisk = project.isAtRisk || project.status === "at_risk";

  const tabCounts: Record<TabKey, number | undefined> = {
    overview: undefined,
    phases: 0,
    milestones: 0,
    tasks: tasks.length,
    kanban: undefined,
    tickets: linkedTickets.length,
    activity: undefined,
    team: undefined,
  };

  return (
    <div className="min-h-full">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200/80">
        <div className="px-6 py-3 flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <Link href="/projects" className="hover:text-slate-700 transition-colors">
              Projets
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="font-mono text-slate-700 font-medium">{project.code}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const newStatus = prompt("Nouveau statut (draft, planning, active, on_hold, at_risk, completed, cancelled) :", project.status);
              if (newStatus && newStatus !== project.status) {
                fetch(`/api/v1/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) })
                  .then((r) => { if (r.ok) setProject((p) => p ? { ...p, status: newStatus as any } : p); });
              }
            }}>
              <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Modifier le statut
            </Button>
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => {
              if (confirm("Archiver ce projet ?")) {
                fetch(`/api/v1/projects/${project.id}`, { method: "DELETE" })
                  .then((r) => { if (r.ok) router.push("/projects"); });
              }
            }}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-[1600px] mx-auto">
        {/* Header */}
        <Card className="mb-5">
          <CardContent className="p-6">
            <div className="flex flex-col xl:flex-row xl:items-start gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1",
                      statusCfg.bg,
                      statusCfg.text,
                      statusCfg.ring
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)} />
                    {PROJECT_STATUS_LABELS[project.status]}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">{project.code}</span>
                  {isAtRisk && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                      <AlertTriangle className="h-3 w-3" /> À risque
                    </span>
                  )}
                </div>
                <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 leading-tight">
                  {project.name}
                </h1>
                <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed max-w-3xl">
                  {project.description}
                </p>
                {project.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/70"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* KPI mini-cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:w-[560px]">
                <Kpi
                  label="Avancement"
                  value={`${project.progressPercent}%`}
                  icon={Activity}
                  color={isAtRisk ? "red" : "blue"}
                />
                <Kpi
                  label="Tâches"
                  value={`${project.completedTaskCount}/${project.taskCount}`}
                  icon={ListChecks}
                  color="violet"
                />
                <Kpi
                  label="Heures"
                  value={`${project.consumedHours}/${project.budgetHours ?? "—"}`}
                  icon={Timer}
                  color="emerald"
                />
                <Kpi
                  label="Tickets liés"
                  value={String(project.linkedTicketCount)}
                  icon={Link2}
                  color="indigo"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="sticky top-[56px] z-10 bg-white/90 backdrop-blur border-b border-slate-200/80 mb-5 -mx-6 px-6">
          <div className="flex items-center gap-1 max-w-[1600px] mx-auto">
            {TABS.map((t) => {
              const isActive = tab === t.key;
              const count = tabCounts[t.key];
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative px-3.5 py-3 text-[13px] font-medium transition-colors",
                    isActive ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {t.label}
                    {count !== undefined && (
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums",
                          isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-blue-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        {tab === "overview" && (
          <OverviewTab
            project={project}
            phases={[]}
            members={[]}
            activities={[]}
          />
        )}
        {tab === "phases" && <PhasesTab phases={[]} />}
        {tab === "milestones" && <MilestonesTab milestones={[]} />}
        {tab === "tasks" && <TasksTab tasks={tasks} phases={[]} />}
        {tab === "kanban" && <ProjectKanbanView projectId={project.id} />}
        {tab === "tickets" && <TicketsTab tickets={linkedTickets} />}
        {tab === "activity" && <ActivityTab activities={[]} />}
        {tab === "team" && <TeamTab members={[]} />}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// KPI mini-card
// ----------------------------------------------------------------------------
function Kpi({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "blue" | "violet" | "emerald" | "indigo" | "red";
}) {
  const colors = {
    blue: { bg: "bg-blue-50", text: "text-blue-600" },
    violet: { bg: "bg-violet-50", text: "text-violet-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
    red: { bg: "bg-red-50", text: "text-red-600" },
  }[color];
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", colors.bg)}>
          <Icon className={cn("h-3.5 w-3.5", colors.text)} />
        </div>
      </div>
      <p className="text-[20px] font-semibold text-slate-900 tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// OVERVIEW TAB
// ----------------------------------------------------------------------------
function OverviewTab({
  project,
  phases,
  members,
  activities,
}: {
  project: Project;
  phases: { id: string; name: string; progressPercent: number }[];
  members: { id: string; agentName: string; role: ProjectRole }[];
  activities: { id: string; authorName: string; content: string; createdAt: string }[];
}) {
  const isAtRisk = project.isAtRisk || project.status === "at_risk";
  const recent = activities.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left */}
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Détails du projet</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
              <Detail label="Client">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-[9px] font-semibold">
                    {getInitials(project.organizationName)}
                  </div>
                  <span className="font-medium text-slate-800">{project.organizationName}</span>
                </div>
              </Detail>
              <Detail label="Type">{PROJECT_TYPE_LABELS[project.type]}</Detail>
              <Detail label="Priorité">{PROJECT_PRIORITY_LABELS[project.priority]}</Detail>
              <Detail label="Responsable">{project.managerName}</Detail>
              <Detail label="Date de début">
                {project.startDate ? format(new Date(project.startDate), "d MMMM yyyy", { locale: fr }) : "Non définie"}
              </Detail>
              <Detail label="Date cible">
                {project.targetEndDate ? format(new Date(project.targetEndDate), "d MMMM yyyy", { locale: fr }) : "Non définie"}
              </Detail>
              {project.actualEndDate && (
                <Detail label="Date de fin réelle">
                  {format(new Date(project.actualEndDate), "d MMMM yyyy", { locale: fr })}
                </Detail>
              )}
              <Detail label="Budget heures">
                {project.consumedHours} / {project.budgetHours ?? "—"} h
              </Detail>
              <Detail label="Budget montant">
                {project.consumedAmount.toLocaleString("fr-CA")} /{" "}
                {project.budgetAmount?.toLocaleString("fr-CA") ?? "—"} $
              </Detail>
            </dl>
          </CardContent>
        </Card>

        {isAtRisk && (
          <Card className="border-red-200">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-red-700 mb-1">Risques identifiés</h3>
                  <p className="text-[13px] text-red-600 leading-relaxed">
                    {project.riskNotes ?? "Ce projet est marqué comme étant à risque."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Activité récente</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-[13px] text-slate-400 italic">Aucune activité.</p>
            ) : (
              <ul className="space-y-3.5">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                      {getInitials(a.authorName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-slate-700">
                        <span className="font-semibold text-slate-900">{a.authorName}</span>{" "}
                        {a.content}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-slate-400">
                        {formatDistanceToNow(new Date(a.createdAt), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right */}
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Avancement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[36px] font-semibold text-slate-900 tracking-tight tabular-nums leading-none">
                {project.progressPercent}%
              </span>
              <span className="text-[12px] text-slate-500">global</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  isAtRisk
                    ? "bg-gradient-to-r from-red-500 to-red-600"
                    : "bg-gradient-to-r from-blue-500 to-blue-600"
                )}
                style={{ width: `${project.progressPercent}%` }}
              />
            </div>
            {phases.length > 0 && (
              <div className="mt-5 space-y-3">
                <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                  Par phase
                </h4>
                {phases.map((ph) => (
                  <div key={ph.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] text-slate-700 truncate">{ph.name}</span>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0 ml-2">
                        {ph.progressPercent}%
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${ph.progressPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Équipe</CardTitle>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-[13px] text-slate-400 italic">Aucun membre.</p>
            ) : (
              <ul className="space-y-3">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[11px] font-semibold">
                      {getInitials(m.agentName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-900 truncate">
                        {m.agentName}
                      </p>
                      <p className="text-[11.5px] text-slate-500">
                        {PROJECT_ROLE_LABELS[m.role]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visibilité client</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(Object.keys(VISIBILITY_LABELS) as (keyof ProjectVisibilitySettings)[]).map((k) => {
                const visible = project.visibilitySettings[k];
                return (
                  <li
                    key={k}
                    className="flex items-center justify-between text-[12.5px]"
                  >
                    <span className="text-slate-600">{VISIBILITY_LABELS[k]}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1",
                        visible
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-slate-50 text-slate-500 ring-slate-200"
                      )}
                    >
                      {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {visible ? "Visible" : "Caché"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </dt>
      <dd className="text-[13px] text-slate-800">{children}</dd>
    </div>
  );
}

// ----------------------------------------------------------------------------
// PHASES TAB
// ----------------------------------------------------------------------------
function PhasesTab({ phases }: { phases: { id: string; name: string; order: number; status: PhaseStatus; description: string; progressPercent: number; startDate?: string | null; endDate?: string | null; taskIds: string[] }[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Phases du projet</h2>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Ajouter une phase
        </Button>
      </div>
      {phases.length === 0 ? (
        <EmptyBlock label="Aucune phase définie pour ce projet." />
      ) : (
        <div className="space-y-3">
          {phases.map((ph) => {
            const statusColor =
              ph.status === "completed"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : ph.status === "in_progress"
                ? "bg-blue-50 text-blue-700 ring-blue-200"
                : ph.status === "blocked"
                ? "bg-red-50 text-red-700 ring-red-200"
                : "bg-slate-50 text-slate-600 ring-slate-200";
            return (
              <Card key={ph.id}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-9 w-9 rounded-lg bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center text-[13px] font-semibold text-slate-600 shrink-0">
                      {ph.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <h3 className="text-[14.5px] font-semibold text-slate-900">{ph.name}</h3>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1",
                            statusColor
                          )}
                        >
                          {PHASE_STATUS_LABELS[ph.status]}
                        </span>
                      </div>
                      <p className="text-[13px] text-slate-500 mb-3">{ph.description}</p>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                          Avancement
                        </span>
                        <span className="text-[12px] font-semibold text-slate-700 tabular-nums">
                          {ph.progressPercent}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                          style={{ width: `${ph.progressPercent}%` }}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-[11.5px] text-slate-500">
                        {ph.startDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(ph.startDate), "d MMM", { locale: fr })} →{" "}
                            {ph.endDate && format(new Date(ph.endDate), "d MMM", { locale: fr })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <ListChecks className="h-3 w-3" />
                          {ph.taskIds.length} tâche{ph.taskIds.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// MILESTONES TAB
// ----------------------------------------------------------------------------
function MilestonesTab({ milestones }: { milestones: { id: string; name: string; description: string; status: MilestoneStatus; targetDate: string; achievedDate?: string | null; isCriticalPath: boolean }[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Jalons du projet</h2>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Ajouter un jalon
        </Button>
      </div>
      {milestones.length === 0 ? (
        <EmptyBlock label="Aucun jalon défini." />
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="relative pl-8">
              <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />
              <ul className="space-y-6">
                {milestones.map((m) => {
                  const statusColor =
                    m.status === "achieved"
                      ? "bg-emerald-500"
                      : m.status === "missed"
                      ? "bg-red-500"
                      : m.status === "approaching"
                      ? "bg-amber-500"
                      : "bg-slate-300";
                  const badgeColor =
                    m.status === "achieved"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : m.status === "missed"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : m.status === "approaching"
                      ? "bg-amber-50 text-amber-700 ring-amber-200"
                      : "bg-slate-50 text-slate-600 ring-slate-200";
                  return (
                    <li key={m.id} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white",
                          statusColor
                        )}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[14px] font-semibold text-slate-900">{m.name}</h3>
                            {m.isCriticalPath && (
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                            )}
                          </div>
                          <p className="mt-0.5 text-[12.5px] text-slate-500">{m.description}</p>
                          <div className="mt-2 flex items-center gap-3 text-[11.5px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Flag className="h-3 w-3" />
                              Cible : {format(new Date(m.targetDate), "d MMMM yyyy", { locale: fr })}
                            </span>
                            {m.achievedDate && (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" />
                                Atteint :{" "}
                                {format(new Date(m.achievedDate), "d MMMM yyyy", { locale: fr })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 shrink-0",
                            badgeColor
                          )}
                        >
                          {MILESTONE_STATUS_LABELS[m.status]}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// TASKS TAB
// ----------------------------------------------------------------------------
function TaskStatusIcon({ status }: { status: TaskStatus }) {
  const cls = "h-4 w-4";
  switch (status) {
    case "completed":
      return <CheckCircle2 className={cn(cls, "text-emerald-500")} />;
    case "in_progress":
      return <CircleDot className={cn(cls, "text-blue-500")} />;
    case "in_review":
      return <CircleDot className={cn(cls, "text-violet-500")} />;
    case "blocked":
      return <Ban className={cn(cls, "text-red-500")} />;
    case "cancelled":
      return <Ban className={cn(cls, "text-slate-300")} />;
    default:
      return <Circle className={cn(cls, "text-slate-300")} />;
  }
}

function TasksTab({
  tasks,
  phases,
}: {
  tasks: ProjectTask[];
  phases: { id: string; name: string; order: number }[];
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    tasks.forEach((t) => {
      const key = t.phaseId ?? "none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    map.forEach((arr) => arr.sort((a, b) => a.order - b.order));
    return map;
  }, [tasks]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Tâches</h2>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Ajouter une tâche
        </Button>
      </div>
      {tasks.length === 0 ? (
        <EmptyBlock label="Aucune tâche pour ce projet." />
      ) : (
        <div className="space-y-5">
          {phases.map((ph) => {
            const list = grouped.get(ph.id) ?? [];
            if (list.length === 0) return null;
            return (
              <Card key={ph.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-slate-100 px-1 text-[11px] font-semibold text-slate-600">
                      {ph.order}
                    </span>
                    {ph.name}
                    <span className="ml-auto text-[11.5px] font-normal text-slate-500">
                      {list.length} tâche{list.length > 1 ? "s" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-slate-100">
                    {list.map((t) => {
                      const cfg = TASK_STATUS_COLORS[t.status];
                      return (
                        <li
                          key={t.id}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors"
                        >
                          <TaskStatusIcon status={t.status} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-slate-900 truncate">
                              {t.name}
                            </p>
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
                                  cfg.bg,
                                  cfg.text
                                )}
                              >
                                {TASK_STATUS_LABELS[t.status]}
                              </span>
                              <span>{PROJECT_PRIORITY_LABELS[t.priority]}</span>
                              {t.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(t.dueDate), "d MMM", { locale: fr })}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Timer className="h-3 w-3" />
                                {t.actualHours ?? 0}/{t.estimatedHours ?? "—"} h
                              </span>
                            </div>
                          </div>
                          <div className="hidden md:block w-32">
                            <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${t.progressPercent}%` }}
                              />
                            </div>
                          </div>
                          {t.assigneeName && (
                            <div
                              className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-white"
                              title={t.assigneeName}
                            >
                              {getInitials(t.assigneeName)}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// TICKETS TAB
// ----------------------------------------------------------------------------
function TicketsTab({ tickets }: { tickets: import("@/lib/mock-data").Ticket[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Tickets liés</h2>
        <Button variant="outline" size="sm">
          <Link2 className="h-3.5 w-3.5 mr-1.5" /> Lier un ticket
        </Button>
      </div>
      {tickets.length === 0 ? (
        <EmptyBlock label="Aucun ticket lié." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {tickets.map((t) => {
                const sCfg = STATUS_CONFIG[t.status];
                const pCfg = PRIORITY_CONFIG[t.priority];
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors group"
                    >
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums w-16">
                        #{t.number}
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-slate-900 truncate group-hover:text-blue-600">
                        {t.subject}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 bg-slate-50 text-slate-600 ring-slate-200">
                        <span className={cn("h-1.5 w-1.5 rounded-full", sCfg.dotClass)} />
                        {sCfg.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 bg-slate-50 text-slate-600 ring-slate-200">
                        <span className={cn("h-1.5 w-1.5 rounded-full", pCfg.dotClass)} />
                        {pCfg.label}
                      </span>
                      {t.assigneeName && (
                        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] font-semibold">
                          {getInitials(t.assigneeName)}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// ACTIVITY TAB
// ----------------------------------------------------------------------------
function ActivityTab({ activities }: { activities: { id: string; type: string; authorName: string; content: string; createdAt: string; isVisibleToClient: boolean }[] }) {
  const iconFor = (type: string) => {
    switch (type) {
      case "task_completed":
        return CheckCircle2;
      case "milestone_achieved":
        return Flag;
      case "ticket_linked":
        return Link2;
      case "comment":
        return MessageSquare;
      case "file_uploaded":
        return FileText;
      case "member_added":
        return UserPlus;
      default:
        return Activity;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal d&apos;activité</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-[13px] text-slate-400 italic">Aucune activité enregistrée.</p>
        ) : (
          <ul className="space-y-4">
            {activities.map((a) => {
              const Icon = iconFor(a.type);
              return (
                <li key={a.id} className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] text-slate-700">
                        <span className="font-semibold text-slate-900">{a.authorName}</span>{" "}
                        {a.content}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 shrink-0",
                          a.isVisibleToClient
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-slate-50 text-slate-500 ring-slate-200"
                        )}
                      >
                        {a.isVisibleToClient ? (
                          <Eye className="h-2.5 w-2.5" />
                        ) : (
                          <EyeOff className="h-2.5 w-2.5" />
                        )}
                        {a.isVisibleToClient ? "Client" : "Interne"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      {formatDistanceToNow(new Date(a.createdAt), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// TEAM TAB
// ----------------------------------------------------------------------------
function TeamTab({ members }: { members: { id: string; agentName: string; agentEmail: string; role: ProjectRole; allocatedHoursPerWeek?: number | null }[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Équipe du projet</h2>
        <Button variant="outline" size="sm">
          <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Ajouter un membre
        </Button>
      </div>
      {members.length === 0 ? (
        <EmptyBlock label="Aucun membre dans l'équipe." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[14px] font-semibold shrink-0">
                    {getInitials(m.agentName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-semibold text-slate-900 truncate">
                      {m.agentName}
                    </h3>
                    <span className="mt-1 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 ring-1 ring-blue-200">
                      {PROJECT_ROLE_LABELS[m.role]}
                    </span>
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500 truncate">
                      <Mail className="h-3 w-3" />
                      {m.agentEmail}
                    </p>
                    {m.allocatedHoursPerWeek && (
                      <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        {m.allocatedHoursPerWeek} h / semaine
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 py-12 text-center">
      <p className="text-[13px] text-slate-500">{label}</p>
    </div>
  );
}
