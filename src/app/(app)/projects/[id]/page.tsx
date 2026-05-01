"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
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
  X,
  Save,
  Loader2,
  Sparkles,
  Trash2,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PHASE_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  PROJECT_ROLE_LABELS,
  type ProjectVisibilitySettings,
  type ProjectTask,
  type TaskStatus,
  type Project,
  type ProjectRole,
  type PhaseStatus,
  type MilestoneStatus,
  type ProjectStatus,
  type ProjectType,
  type ProjectPriority,
} from "@/lib/projects/types";
import { ProjectKanbanView } from "@/components/projects/project-kanban-view";
import { DuplicateProjectModal } from "@/components/projects/duplicate-project-modal";

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------
// "Tâches" (tab) retiré : toutes les tâches sont maintenant des tickets
// gérés dans le Kanban. Les sous-tâches d'un ticket seront ajoutées au
// niveau du ticket lui-même (feature à venir).
const TABS = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "phases", label: "Phases" },
  { key: "milestones", label: "Jalons" },
  { key: "kanban", label: "Kanban" },
  { key: "similar", label: "Projets similaires" },
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

const DEFAULT_VISIBILITY: ProjectVisibilitySettings = {
  showProject: false,
  showPhases: false,
  showMilestones: false,
  showTasks: false,
  showLinkedTickets: false,
  showTimeConsumed: false,
  showBudgetVsActual: false,
  showInternalNotes: false,
  showActivity: false,
  showTeamMembers: false,
};

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------
interface Phase {
  id: string;
  name: string;
  description: string;
  status: PhaseStatus;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  estimatedHours: number | null;
}

interface Milestone {
  id: string;
  name: string;
  description: string;
  status: MilestoneStatus;
  targetDate: string;
  achievedDate: string | null;
  isCriticalPath: boolean;
  phaseId?: string | null;
  taskId?: string | null;
  validatedByTicketId?: string | null;
}

interface Member {
  id: string;
  userId: string | null;
  contactId?: string | null;
  /** "agent" (User interne) ou "contact" (Contact côté client). */
  memberType?: "agent" | "contact";
  agentName: string;
  agentEmail: string;
  agentAvatar?: string | null;
  role: ProjectRole;
  allocatedHoursPerWeek: number | null;
}

interface SimilarProjectEntry {
  id: string;
  source: "manual" | "ai";
  createdAt: string;
  project: {
    id: string;
    code: string;
    name: string;
    status: string;
    organizationName: string;
  };
}

interface SimilarSuggestion {
  score: number;
  project: SimilarProjectEntry["project"];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const isInternalView = pathname?.startsWith("/internal-projects") ?? false;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  // Modal "Dupliquer le projet" — ouvert depuis le bouton Copy dans le
  // header. Permet de recréer un projet similaire pour un autre client.
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const loadProject = useCallback(async () => {
    const r = await fetch(`/api/v1/projects/${params.id}`);
    if (!r.ok) throw new Error("not found");
    const json = await r.json();
    const d = json.data;
    const vis: ProjectVisibilitySettings = d.visibilitySettings
      ? { ...DEFAULT_VISIBILITY, ...d.visibilitySettings }
      : { ...DEFAULT_VISIBILITY, showProject: d.isVisibleToClient };
    const proj: Project = {
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description ?? "",
      organizationId: d.organizationId,
      organizationName: d.organizationName,
      organizationLogo: d.organizationLogo ?? null,
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
      visibilitySettings: vis,
      phaseCount: (d.phases ?? []).length,
      milestoneCount: (d.milestones ?? []).length,
      taskCount: d.taskCount ?? 0,
      completedTaskCount: d.completedTaskCount ?? 0,
      linkedTicketCount: 0,
      memberCount: (d.members ?? []).length,
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
      })),
    );
    setPhases(d.phases ?? []);
    setMilestones(d.milestones ?? []);
    setMembers(d.members ?? []);
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    loadProject()
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadProject]);

  async function updateProject(patch: Record<string, unknown>) {
    if (!project) return;
    const prev = project;
    setProject({ ...project, ...patch } as Project);
    const res = await fetch(`/api/v1/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setProject(prev);
      alert("Impossible d'enregistrer la modification.");
    }
  }

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

  const statusCfg = PROJECT_STATUS_COLORS[project.status];
  const isAtRisk = project.isAtRisk || project.status === "at_risk";

  const tabCounts: Record<TabKey, number | undefined> = {
    overview: undefined,
    phases: phases.length,
    milestones: milestones.length,
    kanban: undefined,
    similar: undefined,
    activity: undefined,
    team: members.length,
  };

  return (
    <div className="min-h-full">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200/80">
        <div className="px-6 py-3 flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <Link
              href={isInternalView ? "/internal-projects" : "/projects"}
              className="hover:text-slate-700 transition-colors"
            >
              {isInternalView ? "Projets internes" : "Projets clients"}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="font-mono text-slate-700 font-medium">{project.code}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const newStatus = prompt("Nouveau statut (draft, planning, active, on_hold, at_risk, completed, cancelled) :", project.status);
              if (newStatus && newStatus !== project.status) {
                updateProject({ status: newStatus });
              }
            }}>
              <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Modifier le statut
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDuplicateOpen(true)}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Dupliquer
            </Button>
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => {
              if (confirm("Archiver ce projet ?")) {
                fetch(`/api/v1/projects/${project.id}`, { method: "DELETE" })
                  .then((r) => {
                    if (r.ok) router.push(isInternalView ? "/internal-projects" : "/projects");
                  });
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
                      statusCfg.ring,
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

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:w-[560px]">
                <Kpi label="Avancement" value={`${project.progressPercent}%`} icon={Activity} color={isAtRisk ? "red" : "blue"} />
                <Kpi label="Tâches" value={`${project.completedTaskCount}/${project.taskCount}`} icon={ListChecks} color="violet" />
                <Kpi label="Heures" value={`${project.consumedHours}/${project.budgetHours ?? "—"}`} icon={Timer} color="emerald" />
                <Kpi label="Membres" value={String(project.memberCount)} icon={UserPlus} color="indigo" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="sticky top-[56px] z-10 bg-white/90 backdrop-blur border-b border-slate-200/80 mb-5 -mx-6 px-6">
          <div className="flex items-center gap-1 max-w-[1600px] mx-auto overflow-x-auto">
            {TABS.map((t) => {
              const isActive = tab === t.key;
              const count = tabCounts[t.key];
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative px-3.5 py-3 text-[13px] font-medium transition-colors whitespace-nowrap",
                    isActive ? "text-blue-600" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {t.label}
                    {count !== undefined && (
                      <span className={cn("inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums", isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                        {count}
                      </span>
                    )}
                  </span>
                  {isActive && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-blue-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        {tab === "overview" && (
          <OverviewTab
            project={project}
            phases={phases}
            members={members}
            activities={[]}
            updateProject={updateProject}
          />
        )}
        {tab === "phases" && (
          <PhasesTab
            phases={phases}
            projectId={project.id}
            onChanged={loadProject}
          />
        )}
        {tab === "milestones" && (
          <MilestonesTab
            milestones={milestones}
            projectId={project.id}
            phases={phases}
            onChanged={loadProject}
          />
        )}
        {tab === "kanban" && <ProjectKanbanView projectId={project.id} />}
        {tab === "similar" && <SimilarProjectsTab projectId={project.id} />}
        {tab === "activity" && <ActivityTab activities={[]} />}
        {tab === "team" && (
          <TeamTab members={members} projectId={project.id} organizationId={project.organizationId} onChanged={loadProject} />
        )}
      </div>

      {/* Modal "Dupliquer le projet" — ouverte depuis le bouton Copy
          dans le header. Le serveur clone vers une autre organisation
          avec choix des éléments à inclure (phases / jalons / tâches /
          tickets). Comments et time entries jamais clonés. */}
      <DuplicateProjectModal
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        sourceProjectId={project.id}
        sourceProjectName={project.name}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------
function Kpi({ label, value, icon: Icon, color }: {
  label: string; value: string;
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
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", colors.bg)}>
          <Icon className={cn("h-3.5 w-3.5", colors.text)} />
        </div>
      </div>
      <p className="text-[20px] font-semibold text-slate-900 tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------
function OverviewTab({
  project, phases, members, activities, updateProject,
}: {
  project: Project;
  phases: Phase[];
  members: Member[];
  activities: { id: string; authorName: string; content: string; createdAt: string }[];
  updateProject: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const isAtRisk = project.isAtRisk || project.status === "at_risk";
  const recent = activities.slice(0, 5);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Détails du projet</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
              <Detail label="Client">
                <div className="flex items-center gap-2">
                  {project.organizationLogo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={project.organizationLogo}
                      alt={project.organizationName}
                      className="h-6 w-6 rounded-full object-cover border border-slate-200 bg-white"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-[9px] font-semibold">
                      {getInitials(project.organizationName)}
                    </div>
                  )}
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
                <EditableNumber
                  value={project.budgetHours ?? null}
                  suffix=" h"
                  prefix={`${project.consumedHours} / `}
                  onSave={(v) => updateProject({ budgetHours: v })}
                />
              </Detail>
              <Detail label="Budget montant">
                <EditableNumber
                  value={project.budgetAmount ?? null}
                  prefix={`${project.consumedAmount.toLocaleString("fr-CA")} / `}
                  suffix=" $"
                  onSave={(v) => updateProject({ budgetAmount: v })}
                />
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
          <CardHeader><CardTitle>Activité récente</CardTitle></CardHeader>
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
                        <span className="font-semibold text-slate-900">{a.authorName}</span> {a.content}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-slate-400">
                        {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Avancement</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[36px] font-semibold text-slate-900 tracking-tight tabular-nums leading-none">
                {project.progressPercent}%
              </span>
              <span className="text-[12px] text-slate-500">global</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={cn("h-full rounded-full", isAtRisk ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-blue-500 to-blue-600")} style={{ width: `${project.progressPercent}%` }} />
            </div>
            {phases.length > 0 && (
              <div className="mt-5 space-y-3">
                <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Par phase</h4>
                {phases.map((ph) => (
                  <div key={ph.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] text-slate-700 truncate">{ph.name}</span>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0 ml-2">
                        {ph.status === "completed" ? "100%" : ph.status === "in_progress" ? "—" : "0%"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Équipe</CardTitle></CardHeader>
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
                      <p className="text-[13px] font-medium text-slate-900 truncate">{m.agentName}</p>
                      <p className="text-[11.5px] text-slate-500">{PROJECT_ROLE_LABELS[m.role]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Visibilité client</CardTitle></CardHeader>
          <CardContent>
            {/* Raccourci : bascule tous les flags d'un coup. La majorité
                des projets sont soit "tout visible" soit "tout caché",
                ça évite 10 clics individuels. */}
            {(() => {
              const allKeys = Object.keys(VISIBILITY_LABELS) as (keyof ProjectVisibilitySettings)[];
              const allVisible = allKeys.every((k) => project.visibilitySettings[k]);
              const targetVisible = !allVisible;
              return (
                <button
                  type="button"
                  onClick={() => {
                    const next = allKeys.reduce(
                      (acc, k) => ({ ...acc, [k]: targetVisible }),
                      {} as ProjectVisibilitySettings,
                    );
                    updateProject({
                      visibilitySettings: next,
                      // showProject ↔ isVisibleToClient toujours synchronisés.
                      isVisibleToClient: targetVisible,
                    });
                  }}
                  className={cn(
                    "mb-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors",
                    targetVisible
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {targetVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {targetVisible ? "Tout rendre visible" : "Tout cacher"}
                </button>
              );
            })()}
            <ul className="space-y-2">
              {(Object.keys(VISIBILITY_LABELS) as (keyof ProjectVisibilitySettings)[]).map((k) => {
                const visible = project.visibilitySettings[k];
                return (
                  <li key={k} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-slate-600">{VISIBILITY_LABELS[k]}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...project.visibilitySettings, [k]: !visible };
                        updateProject({
                          visibilitySettings: next,
                          // showProject reste synchronisé avec isVisibleToClient
                          // pour cohérence avec le portail client.
                          ...(k === "showProject" ? { isVisibleToClient: !visible } : {}),
                        });
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 transition-colors cursor-pointer",
                        visible
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100",
                      )}
                    >
                      {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {visible ? "Visible" : "Caché"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {editOpen && (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSave={async (patch) => {
            await updateProject(patch);
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDIT PROJECT MODAL — modifie les métadonnées du projet (nom, description,
// statut, type, priorité, dates, manager, tags, riskNotes). Le PATCH
// /api/v1/projects/[id] accepte déjà tous ces champs.
// ---------------------------------------------------------------------------
function EditProjectModal({
  project,
  onClose,
  onSave,
}: {
  project: Project;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState(project.status);
  const [type, setType] = useState(project.type);
  const [priority, setPriority] = useState(project.priority);
  const [startDate, setStartDate] = useState(project.startDate ? project.startDate.slice(0, 10) : "");
  const [targetEndDate, setTargetEndDate] = useState(project.targetEndDate ? project.targetEndDate.slice(0, 10) : "");
  const [managerId, setManagerId] = useState(project.managerId);
  const [tagsInput, setTagsInput] = useState((project.tags ?? []).join(", "));
  const [isAtRisk, setIsAtRisk] = useState(project.isAtRisk);
  const [riskNotes, setRiskNotes] = useState(project.riskNotes ?? "");
  // Toggle "100% facturable" : quand activé, toute saisie de temps sur
  // un ticket de ce projet est forcée billable côté serveur.
  const [isFullyBillable, setIsFullyBillable] = useState(!!project.isFullyBillable);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liste des agents pour le select "Responsable". Chargée une fois à
  // l'ouverture, garde la valeur courante pré-sélectionnée même si
  // l'agent n'est plus dans la liste active (ex: désactivé).
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/v1/users?role=agent")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (!Array.isArray(arr)) return;
        const list = arr
          .map((u: any) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
          }))
          .filter((u: any) => u.id);
        setAgents(list);
      })
      .catch(() => {});
  }, []);

  async function save() {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await onSave({
        name: name.trim(),
        description: description.trim(),
        status,
        type,
        priority,
        startDate: startDate || null,
        targetEndDate: targetEndDate || null,
        managerId,
        tags,
        isAtRisk,
        riskNotes: riskNotes.trim() || null,
        isFullyBillable,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">Modifier le projet</h2>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Statut</label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(PROJECT_STATUS_LABELS) as [ProjectStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Priorité</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as ProjectPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(PROJECT_PRIORITY_LABELS) as [ProjectPriority, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Responsable</label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* Inclut le manager courant même s'il n'est plus dans agents (désactivé). */}
                  {agents.find((a) => a.id === managerId) === undefined && project.managerName && (
                    <SelectItem value={managerId}>{project.managerName}</SelectItem>
                  )}
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date de début" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Date cible" type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
          </div>
          <Input
            label="Tags (séparés par des virgules)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="ex : migration, urgent, m365"
          />
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAtRisk}
                onChange={(e) => setIsAtRisk(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-[13px] font-medium text-slate-700">Marquer le projet à risque</span>
            </label>
            {isAtRisk && (
              <TextArea
                label="Notes sur les risques"
                value={riskNotes}
                onChange={(e) => setRiskNotes(e.target.value)}
                rows={2}
                placeholder="Décris brièvement le risque identifié…"
              />
            )}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFullyBillable}
                onChange={(e) => setIsFullyBillable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-[13px] font-medium text-emerald-900">Projet 100&nbsp;% facturable</span>
            </label>
            <p className="text-[11.5px] text-emerald-800/80 leading-snug">
              Toute saisie de temps sur les tickets de ce projet sera forcée
              «&nbsp;facturable&nbsp;», peu importe le contrat client (banque
              d&apos;heures, FTIG, inclusions). À utiliser pour les projets
              T&amp;M ou hors-contrat.
            </p>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</dt>
      <dd className="text-[13px] text-slate-800">{children}</dd>
    </div>
  );
}

// Champ numérique éditable inline. Click → input, Enter → save, Esc → cancel.
function EditableNumber({
  value, onSave, prefix, suffix,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<void> | void;
  prefix?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value?.toString() ?? "");
  }, [value, editing]);

  async function commit() {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) {
      setDraft(value?.toString() ?? "");
      setEditing(false);
      return;
    }
    if (parsed === value) { setEditing(false); return; }
    setSaving(true);
    await onSave(parsed);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-slate-50 text-left transition-colors"
      >
        <span>
          {prefix}
          {value ?? "—"}
          {suffix}
        </span>
        <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-slate-500">{prefix}</span>}
      <input
        type="number"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); setDraft(value?.toString() ?? ""); setEditing(false); }
        }}
        disabled={saving}
        className="w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {suffix && <span className="text-slate-500">{suffix}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PHASES
// ---------------------------------------------------------------------------
function PhasesTab({ phases, projectId, onChanged }: { phases: Phase[]; projectId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  // Phase en cours d'édition. Null = mode création (modale d'ajout).
  // Sinon la modale s'ouvre pré-remplie avec les valeurs de la phase.
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  // Liste locale pour permettre le drag-and-drop sans attendre un rerender
  // serveur. Synchronisée avec `phases` (props) à chaque changement parent.
  const [orderedPhases, setOrderedPhases] = useState<Phase[]>(phases);
  useEffect(() => { setOrderedPhases(phases); }, [phases]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = orderedPhases.findIndex((p) => p.id === active.id);
    const toIdx = orderedPhases.findIndex((p) => p.id === over.id);
    if (fromIdx === -1 || toIdx === -1) return;
    // Reorder localement (optimiste).
    const next = arrayMove(orderedPhases, fromIdx, toIdx);
    setOrderedPhases(next);
    // Persiste sortOrder pour TOUTES les phases — simple et idempotent.
    // L'endpoint PATCH accepte déjà sortOrder dans le body.
    await Promise.all(
      next.map((p, i) =>
        p.sortOrder === i
          ? Promise.resolve()
          : fetch(`/api/v1/projects/${projectId}/phases/${p.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sortOrder: i }),
            })
      ),
    );
    onChanged();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Phases du projet</h2>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Ajouter une phase
        </Button>
      </div>
      {orderedPhases.length === 0 ? (
        <EmptyBlock label="Aucune phase définie pour ce projet." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedPhases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {orderedPhases.map((ph, idx) => (
                <SortablePhaseCard
                  key={ph.id}
                  phase={ph}
                  index={idx}
                  onClick={() => setEditingPhase(ph)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {open && <PhaseModal projectId={projectId} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onChanged(); }} />}
      {editingPhase && (
        <PhaseModal
          projectId={projectId}
          phase={editingPhase}
          onClose={() => setEditingPhase(null)}
          onSaved={() => { setEditingPhase(null); onChanged(); }}
          onDeleted={() => { setEditingPhase(null); onChanged(); }}
        />
      )}
    </div>
  );
}

// PhaseModal — création OU édition selon `phase` :
//   - phase=undefined → POST /phases (création)
//   - phase=Phase     → PATCH /phases/[id] (édition) + bouton Supprimer
// Card de phase draggable pour réordonner verticalement (haut en bas).
// Le drag handle est sur l'icône GripVertical à gauche — le reste de la
// card reste cliquable pour ouvrir la modale d'édition.
function SortablePhaseCard({
  phase,
  index,
  onClick,
}: {
  phase: Phase;
  index: number;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const statusColor =
    phase.status === "completed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : phase.status === "in_progress" ? "bg-blue-50 text-blue-700 ring-blue-200"
    : phase.status === "blocked" ? "bg-red-50 text-red-700 ring-red-200"
    : "bg-slate-50 text-slate-600 ring-slate-200";
  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
        onClick={onClick}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              className="h-9 w-6 inline-flex items-center justify-center rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-600 cursor-grab active:cursor-grabbing shrink-0"
              title="Glisser pour réordonner la phase"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="h-9 w-9 rounded-lg bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center text-[13px] font-semibold text-slate-600 shrink-0">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="text-[14.5px] font-semibold text-slate-900">{phase.name}</h3>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1", statusColor)}>
                  {PHASE_STATUS_LABELS[phase.status]}
                </span>
              </div>
              {phase.description && <p className="text-[13px] text-slate-500 mb-3">{phase.description}</p>}
              <div className="mt-2 flex items-center gap-4 text-[11.5px] text-slate-500">
                {phase.startDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(phase.startDate), "d MMM", { locale: fr })}
                    {phase.endDate && ` → ${format(new Date(phase.endDate), "d MMM", { locale: fr })}`}
                  </span>
                )}
                {phase.estimatedHours != null && phase.estimatedHours > 0 && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {phase.estimatedHours} h estimé{phase.estimatedHours > 1 ? "es" : "e"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PhaseModal({
  projectId,
  phase,
  onClose,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  phase?: Phase;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [name, setName] = useState(phase?.name ?? "");
  const [description, setDescription] = useState(phase?.description ?? "");
  const [status, setStatus] = useState<PhaseStatus>(phase?.status ?? "not_started");
  const [startDate, setStartDate] = useState(phase?.startDate ? phase.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(phase?.endDate ? phase.endDate.slice(0, 10) : "");
  const [estimatedHours, setEstimatedHours] = useState(
    phase?.estimatedHours != null ? String(phase.estimatedHours) : "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!phase;

  async function save() {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const url = isEdit
        ? `/api/v1/projects/${projectId}/phases/${phase!.id}`
        : `/api/v1/projects/${projectId}/phases`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          status,
          startDate: startDate || (isEdit ? null : undefined),
          endDate: endDate || (isEdit ? null : undefined),
          estimatedHours: estimatedHours.trim() === "" ? null : Number(estimatedHours),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!isEdit || !confirm(`Supprimer la phase « ${phase!.name} » ? Cette action est irréversible.`)) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/phases/${phase!.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onDeleted?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-md my-8 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">{isEdit ? "Modifier la phase" : "Nouvelle phase"}</h2>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Statut</label>
            <Select value={status} onValueChange={(v) => setStatus(v as PhaseStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PHASE_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Début" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Fin" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Input
              label="Heures estimées"
              type="number"
              step="0.5"
              min={0}
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="Vide = pas pondérée dans le calcul d'avancement"
            />
            <p className="mt-1 text-[11px] text-slate-500 leading-snug">
              Sert à pondérer le pourcentage d&apos;avancement du projet :
              quand cette phase passe en «&nbsp;Terminée&nbsp;», ses heures
              comptent dans le ratio (somme des heures terminées / total).
              Sans heures saisies sur aucune phase, fallback sur le ratio
              simple par nombre de phases.
            </p>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="flex justify-between gap-3 border-t border-slate-200 px-6 py-4">
          {isEdit ? (
            <Button variant="outline" size="sm" onClick={remove} disabled={deleting || saving} className="text-red-700 border-red-200 hover:bg-red-50">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Supprimer
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MILESTONES
// ---------------------------------------------------------------------------
function MilestonesTab({ milestones, projectId, phases, onChanged }: { milestones: Milestone[]; projectId: string; phases: Phase[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Jalons du projet</h2>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
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
                    m.status === "achieved" ? "bg-emerald-500"
                    : m.status === "missed" ? "bg-red-500"
                    : m.status === "approaching" ? "bg-amber-500"
                    : "bg-slate-300";
                  const badgeColor =
                    m.status === "achieved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : m.status === "missed" ? "bg-red-50 text-red-700 ring-red-200"
                    : m.status === "approaching" ? "bg-amber-50 text-amber-700 ring-amber-200"
                    : "bg-slate-50 text-slate-600 ring-slate-200";
                  return (
                    <li key={m.id} className="relative">
                      <span className={cn("absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white", statusColor)} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[14px] font-semibold text-slate-900">{m.name}</h3>
                            {m.isCriticalPath && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />}
                          </div>
                          {m.description && <p className="mt-0.5 text-[12.5px] text-slate-500">{m.description}</p>}
                          <div className="mt-2 flex items-center gap-3 text-[11.5px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Flag className="h-3 w-3" /> Cible : {format(new Date(m.targetDate), "d MMMM yyyy", { locale: fr })}
                            </span>
                            {m.achievedDate && (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" /> Atteint : {format(new Date(m.achievedDate), "d MMMM yyyy", { locale: fr })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 shrink-0", badgeColor)}>
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
      {open && <MilestoneModal projectId={projectId} phases={phases} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); onChanged(); }} />}
    </div>
  );
}

function MilestoneModal({
  projectId,
  phases,
  onClose,
  onCreated,
}: {
  projectId: string;
  phases: Phase[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isCriticalPath, setIsCriticalPath] = useState(false);
  const [phaseId, setPhaseId] = useState<string>("");
  const [validatedByTicketId, setValidatedByTicketId] = useState<string>("");
  // Tickets liés au projet — pour le sélecteur "Validé par le ticket".
  const [projectTickets, setProjectTickets] = useState<Array<{ id: string; number: number; subject: string }>>([]);
  useEffect(() => {
    fetch(`/api/v1/tickets?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (!Array.isArray(arr)) return;
        setProjectTickets(arr.map((t: any) => ({ id: t.id, number: t.number, subject: t.subject })));
      })
      .catch(() => {});
  }, [projectId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !targetDate) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          targetDate,
          isCriticalPath,
          phaseId: phaseId || null,
          validatedByTicketId: validatedByTicketId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell title="Nouveau jalon" onClose={onClose} onSubmit={save} saving={saving} disabled={!name.trim() || !targetDate}>
      <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      <Input label="Date cible" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
      {phases.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Phase liée (optionnel)</label>
          <Select value={phaseId || "__none__"} onValueChange={(v) => setPhaseId(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Aucune phase" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Aucune phase</SelectItem>
              {phases.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {projectTickets.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
            Validé par le ticket (optionnel)
          </label>
          <Select value={validatedByTicketId || "__none__"} onValueChange={(v) => setValidatedByTicketId(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Aucun ticket" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Aucun ticket</SelectItem>
              {projectTickets.map((t) => (
                <SelectItem key={t.id} value={t.id}>#{t.number} — {t.subject}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-slate-500 leading-snug">
            Quand ce ticket passera en «&nbsp;Résolu&nbsp;» ou
            «&nbsp;Fermé&nbsp;», le jalon basculera automatiquement en
            «&nbsp;Atteint&nbsp;».
          </p>
        </div>
      )}
      <label className="flex items-center gap-2 text-[13px] text-slate-700">
        <input type="checkbox" checked={isCriticalPath} onChange={(e) => setIsCriticalPath(e.target.checked)} />
        Chemin critique
      </label>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// TEAM
// ---------------------------------------------------------------------------
function TeamTab({ members, projectId, organizationId, onChanged }: { members: Member[]; projectId: string; organizationId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  // Membre en cours d'édition. Cliquer sur la card ouvre la modale
  // d'édition (rôle, allocation horaire). La suppression reste exposée
  // via la corbeille de la card pour rester accessible sans ouvrir la
  // modale.
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">Équipe du projet</h2>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Ajouter un membre
        </Button>
      </div>
      {members.length === 0 ? (
        <EmptyBlock label="Aucun membre dans l'équipe." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              onClick={() => setEditingMember(m)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  {m.agentAvatar ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.agentAvatar}
                      alt={m.agentName}
                      className="h-12 w-12 rounded-full object-cover shrink-0 border border-slate-200"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[14px] font-semibold shrink-0">
                      {getInitials(m.agentName)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[14px] font-semibold text-slate-900 truncate">{m.agentName}</h3>
                      <button
                        type="button"
                        onClick={async (e) => {
                          // Ne pas ouvrir la modale d'édition.
                          e.stopPropagation();
                          if (!confirm(`Retirer ${m.agentName} du projet ?`)) return;
                          const res = await fetch(`/api/v1/projects/${projectId}/members?memberId=${m.id}`, { method: "DELETE" });
                          if (res.ok) onChanged();
                        }}
                        className="text-slate-300 hover:text-red-500 shrink-0"
                        title="Retirer du projet"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="mt-1 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700 ring-1 ring-blue-200">
                      {PROJECT_ROLE_LABELS[m.role]}
                    </span>
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500 truncate">
                      <Mail className="h-3 w-3" /> {m.agentEmail}
                    </p>
                    {m.allocatedHoursPerWeek != null && (
                      <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                        <Clock className="h-3 w-3" /> {m.allocatedHoursPerWeek} h / semaine
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {open && (
        <MemberModal
          projectId={projectId}
          organizationId={organizationId}
          existingUserIds={new Set(members.map((m) => m.userId).filter((u): u is string => !!u))}
          existingContactIds={new Set(members.map((m) => m.contactId).filter((c): c is string => !!c))}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); onChanged(); }}
        />
      )}
      {editingMember && (
        <EditMemberModal
          projectId={projectId}
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => { setEditingMember(null); onChanged(); }}
        />
      )}
    </div>
  );
}

// EditMemberModal — édite rôle + allocation d'un membre existant.
// Suppression : passe par la corbeille de la card (déjà en place).
function EditMemberModal({
  projectId,
  member,
  onClose,
  onSaved,
}: {
  projectId: string;
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<ProjectRole>(member.role);
  const [hours, setHours] = useState(member.allocatedHoursPerWeek != null ? String(member.allocatedHoursPerWeek) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          allocatedHoursPerWeek: hours.trim() === "" ? null : Number(hours),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell title={`Modifier — ${member.agentName}`} onClose={onClose} onSubmit={save} saving={saving}>
      <div className="rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600">
        <Mail className="inline h-3 w-3 mr-1" />
        {member.agentEmail}
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Rôle</label>
        <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PROJECT_ROLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        label="Heures / semaine (vide = non spécifié)"
        type="number"
        step="0.5"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
      />
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </ModalShell>
  );
}

function MemberModal({
  projectId,
  organizationId,
  existingUserIds,
  existingContactIds,
  onClose,
  onCreated,
}: {
  projectId: string;
  organizationId: string;
  existingUserIds: Set<string>;
  existingContactIds: Set<string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  // Bascule "Agent (interne)" / "Contact (côté client)". Par défaut Agent
  // — c'est le cas d'usage majoritaire (équipe Cetix sur un projet).
  const [memberType, setMemberType] = useState<"agent" | "contact">("agent");
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; firstName: string; lastName: string; email: string; jobTitle: string | null }>>([]);
  const [userId, setUserId] = useState("");
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState<ProjectRole>("contributor");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/users?active=true")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setUsers((d.data ?? d ?? []).filter((u: any) => !existingUserIds.has(u.id))))
      .catch(() => {});
  }, [existingUserIds]);

  useEffect(() => {
    if (memberType !== "contact") return;
    fetch(`/api/v1/contacts?organizationId=${organizationId}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setContacts((d.data ?? d ?? []).filter((c: any) => !existingContactIds.has(c.id))))
      .catch(() => {});
  }, [memberType, organizationId, existingContactIds]);

  const canSave = memberType === "agent" ? !!userId : !!contactId;

  async function save() {
    if (!canSave) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: memberType === "agent" ? userId : undefined,
          contactId: memberType === "contact" ? contactId : undefined,
          role,
          allocatedHoursPerWeek: hours ? Number(hours) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell title="Ajouter un membre" onClose={onClose} onSubmit={save} saving={saving} disabled={!canSave}>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Type de membre</label>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
          <button
            type="button"
            onClick={() => { setMemberType("agent"); setContactId(""); }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
              memberType === "agent"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Agent (interne)
          </button>
          <button
            type="button"
            onClick={() => { setMemberType("contact"); setUserId(""); }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
              memberType === "contact"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Contact (côté client)
          </button>
        </div>
      </div>
      {memberType === "agent" ? (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Agent</label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} — {u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Contact</label>
          <Select value={contactId} onValueChange={setContactId}>
            <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
            <SelectContent>
              {contacts.length === 0 ? (
                <div className="px-2 py-1.5 text-[12px] text-slate-400 italic">
                  Aucun contact disponible pour cette organisation.
                </div>
              ) : (
                contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}{c.jobTitle ? ` — ${c.jobTitle}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Rôle</label>
        <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PROJECT_ROLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input label="Heures / semaine (optionnel)" type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// SIMILAR PROJECTS
// ---------------------------------------------------------------------------
function SimilarProjectsTab({ projectId }: { projectId: string }) {
  const [linked, setLinked] = useState<SimilarProjectEntry[]>([]);
  const [suggestions, setSuggestions] = useState<SimilarSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/v1/projects/${projectId}/similar`);
    if (r.ok) {
      const j = await r.json();
      setLinked(j.data.linked);
      // Seuil de pertinence : ne proposer que les projets avec un score
      // >= 0.5 (match fort). En dessous, la suggestion devient du bruit.
      // Si aucune suggestion ne passe → le bloc "Suggestions" disparaît
      // via le rendu conditionnel (cf. `suggestions.length === 0`).
      const MIN_SCORE = 0.5;
      setSuggestions((j.data.suggestions ?? []).filter((s: SimilarSuggestion) => (s.score ?? 0) >= MIN_SCORE));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function link(relatedProjectId: string, source: "manual" | "ai" = "manual") {
    setLinkingId(relatedProjectId);
    await fetch(`/api/v1/projects/${projectId}/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relatedProjectId, source }),
    });
    setLinkingId(null);
    await load();
  }

  async function unlink(linkId: string) {
    await fetch(`/api/v1/projects/${projectId}/similar?linkId=${linkId}`, { method: "DELETE" });
    await load();
  }

  // État local du feedback par suggestion pendant la session — la
  // recharge (load) ré-ordonne/filtre les suggestions selon les verdicts
  // persistés côté serveur.
  const [feedback, setFeedback] = useState<Record<string, "good" | "bad">>({});

  async function sendFeedback(suggestedProjectId: string, verdict: "good" | "bad") {
    setFeedback((s) => ({ ...s, [suggestedProjectId]: verdict }));
    await fetch(`/api/v1/projects/${projectId}/similar/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestedProjectId, verdict }),
    });
    // Recharge si "bad" → la suggestion doit disparaître. Si "good" →
    // elle remonte en tête (utile si l'agent donne du feedback en série).
    if (verdict === "bad") await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Projets liés</h2>
          <Button variant="outline" size="sm" onClick={() => setShowPicker(true)}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" /> Lier un projet
          </Button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400 text-[13px]">Chargement...</div>
        ) : linked.length === 0 ? (
          <EmptyBlock label="Aucun projet lié pour l'instant." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {linked.map((l) => (
                  <li key={l.id}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums w-20">{l.project.code}</span>
                      <Link href={`/projects/${l.project.id}`} className="flex-1 text-[13px] font-medium text-slate-900 truncate hover:text-blue-600">
                        {l.project.name}
                      </Link>
                      <span className="text-[11.5px] text-slate-500 hidden sm:inline">{l.project.organizationName}</span>
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1",
                        l.source === "ai"
                          ? "bg-violet-50 text-violet-700 ring-violet-200"
                          : "bg-slate-50 text-slate-600 ring-slate-200",
                      )}>
                        {l.source === "ai" ? (<><Sparkles className="h-3 w-3" /> IA</>) : "Manuel"}
                      </span>
                      <button type="button" onClick={() => unlink(l.id)} className="text-slate-300 hover:text-red-500" title="Retirer le lien">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bloc Suggestions masqué si aucune suggestion passe le seuil
          de pertinence. Préférence produit : pas de bruit visuel quand
          l'IA n'a rien de solide à proposer. */}
      {(loading || suggestions.length > 0) && (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h2 className="text-[15px] font-semibold text-slate-900">Suggestions</h2>
          <span className="text-[11.5px] text-slate-400">
            basées sur le nom, la description, l&apos;organisation et le type
          </span>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400 text-[13px]">Chargement...</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {suggestions.map((s) => {
                  const fb = feedback[s.project.id];
                  return (
                  <li key={s.project.id} className={cn(
                    "flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors",
                    fb === "bad" && "opacity-50",
                  )}>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums w-20">{s.project.code}</span>
                    <Link href={`/projects/${s.project.id}`} className="flex-1 text-[13px] font-medium text-slate-900 truncate hover:text-blue-600">
                      {s.project.name}
                    </Link>
                    <span className="text-[11.5px] text-slate-500 hidden sm:inline">{s.project.organizationName}</span>
                    <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700 ring-1 ring-violet-200 tabular-nums">
                      {Math.round(s.score * 100)}%
                    </span>

                    {/* Feedback humain : thumbs up/down. "good" boost la
                        suggestion dans les prochains calculs, "bad" la
                        retire de la liste. Améliore la pertinence au fil
                        du temps sans nécessiter d'embeddings. */}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => sendFeedback(s.project.id, "good")}
                        disabled={!!fb}
                        className={cn(
                          "h-6 w-6 inline-flex items-center justify-center rounded transition",
                          fb === "good"
                            ? "bg-emerald-100 text-emerald-700"
                            : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30",
                        )}
                        title="Suggestion pertinente — confirme au modèle"
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => sendFeedback(s.project.id, "bad")}
                        disabled={!!fb}
                        className={cn(
                          "h-6 w-6 inline-flex items-center justify-center rounded transition",
                          fb === "bad"
                            ? "bg-rose-100 text-rose-700"
                            : "text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30",
                        )}
                        title="Pas pertinent — retire-le des suggestions"
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                    </div>

                    <Button variant="outline" size="sm" onClick={() => link(s.project.id, "ai")} disabled={linkingId === s.project.id || fb === "bad"}>
                      {linkingId === s.project.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Lier
                    </Button>
                  </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      )}

      {showPicker && (
        <SimilarPickerModal
          projectId={projectId}
          excludeIds={new Set([projectId, ...linked.map((l) => l.project.id)])}
          onClose={() => setShowPicker(false)}
          onPicked={async (id) => { await link(id, "manual"); setShowPicker(false); }}
        />
      )}
    </div>
  );
}

function SimilarPickerModal({ projectId, excludeIds, onClose, onPicked }: {
  projectId: string;
  excludeIds: Set<string>;
  onClose: () => void;
  onPicked: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; code: string; name: string; organizationName: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`/api/v1/projects?search=${encodeURIComponent(query)}&limit=30`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => {
          if (cancelled) return;
          const list = (j.data ?? []).filter((p: any) => !excludeIds.has(p.id));
          setOptions(list.map((p: any) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            organizationName: p.organizationName ?? "",
          })));
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 150);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, excludeIds, projectId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-lg my-8 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">Lier un projet</h2>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Input placeholder="Rechercher par nom ou code..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 text-center text-slate-400 text-[13px]">Recherche...</div>
            ) : options.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-[13px]">Aucun résultat.</div>
            ) : (
              options.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPicked(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors text-left"
                >
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums w-20">{p.code}</span>
                  <span className="flex-1 text-[13px] font-medium text-slate-900 truncate">{p.name}</span>
                  <span className="text-[11.5px] text-slate-500 hidden sm:inline">{p.organizationName}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACTIVITY
// ---------------------------------------------------------------------------
function ActivityTab({ activities }: { activities: { id: string; type: string; authorName: string; content: string; createdAt: string; isVisibleToClient: boolean }[] }) {
  const iconFor = (type: string) => {
    switch (type) {
      case "task_completed": return CheckCircle2;
      case "milestone_achieved": return Flag;
      case "ticket_linked": return Link2;
      case "comment": return MessageSquare;
      case "file_uploaded": return FileText;
      case "member_added": return UserPlus;
      default: return Activity;
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Journal d&apos;activité</CardTitle></CardHeader>
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
                    <p className="text-[13px] text-slate-700">
                      <span className="font-semibold text-slate-900">{a.authorName}</span> {a.content}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: fr })}
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

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------
function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 py-12 text-center">
      <p className="text-[13px] text-slate-500">{label}</p>
    </div>
  );
}

function ModalShell({ title, children, onClose, onSubmit, saving, disabled }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-md my-8 rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="sm" onClick={onSubmit} disabled={saving || disabled}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

function TextArea({ label, ...rest }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</label>
      <textarea
        {...rest}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
      />
    </div>
  );
}
