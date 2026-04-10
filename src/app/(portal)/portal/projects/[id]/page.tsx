"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Flag,
  Layers,
  ListChecks,
  Lock,
  Ticket as TicketIcon,
  Users,
  Activity as ActivityIcon,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectKanbanView } from "@/components/projects/project-kanban-view";
import {
  mockProjects,
  mockProjectPhases,
  mockProjectMilestones,
  mockProjectTasks,
  mockProjectActivities,
  mockProjectMembers,
} from "@/lib/projects/mock-data";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  PHASE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  MILESTONE_STATUS_LABELS,
  PROJECT_ROLE_LABELS,
} from "@/lib/projects/types";
import { usePortalUser } from "@/lib/portal/use-portal-user";

type Tab =
  | "overview"
  | "milestones"
  | "phases"
  | "tasks"
  | "kanban"
  | "tickets"
  | "activity";

export default function PortalProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { organizationId: orgId, permissions: portalPerms } = usePortalUser();
  const [tab, setTab] = useState<Tab>("overview");

  const project = mockProjects.find((p) => p.id === id);

  // Strict access control
  if (
    !project ||
    project.organizationId !== orgId ||
    !project.isVisibleToClient ||
    !project.visibilitySettings.showProject
  ) {
    return (
      <div className="mx-auto max-w-6xl">
        <Link
          href="/portal/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux projets
        </Link>
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">
            Projet introuvable
          </h2>
          <p className="mt-1.5 text-sm text-neutral-500">
            Ce projet n&apos;est pas disponible dans votre portail.
          </p>
        </div>
      </div>
    );
  }

  if (!portalPerms.canSeeProjectDetails) {
    return (
      <div className="mx-auto max-w-6xl">
        <Link
          href="/portal/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux projets
        </Link>
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">
            Accès limité
          </h2>
          <p className="mt-1.5 text-sm text-neutral-500">
            Vous n&apos;avez pas les permissions pour voir le détail des
            projets. Contactez votre administrateur.
          </p>
        </div>
      </div>
    );
  }

  const v = project.visibilitySettings;
  const colors = PROJECT_STATUS_COLORS[project.status];

  const phases = useMemo(
    () =>
      mockProjectPhases.filter(
        (p) => p.projectId === project.id && p.isVisibleToClient
      ),
    [project.id]
  );
  const milestones = useMemo(
    () =>
      mockProjectMilestones.filter(
        (m) => m.projectId === project.id && m.isVisibleToClient
      ),
    [project.id]
  );
  const tasks = useMemo(
    () =>
      mockProjectTasks.filter(
        (t) => t.projectId === project.id && t.isVisibleToClient
      ),
    [project.id]
  );
  const activities = useMemo(
    () =>
      mockProjectActivities.filter(
        (a) => a.projectId === project.id && a.isVisibleToClient
      ),
    [project.id]
  );
  const members = useMemo(
    () => mockProjectMembers.filter((m) => m.projectId === project.id),
    [project.id]
  );

  // Mock linked tickets
  const linkedTickets = [
    {
      id: "INC-1042",
      subject: "Problème de synchronisation Outlook",
      status: "En cours",
    },
    {
      id: "INC-1039",
      subject: "Demande de migration boîte partagée",
      status: "Résolu",
    },
  ];

  const tabs: { key: Tab; label: string; icon: typeof Layers; show: boolean }[] = [
    { key: "overview", label: "Vue d'ensemble", icon: Layers, show: true },
    {
      key: "milestones",
      label: "Jalons",
      icon: Flag,
      show: v.showMilestones && milestones.length > 0,
    },
    {
      key: "phases",
      label: "Phases",
      icon: Layers,
      show: v.showPhases && phases.length > 0,
    },
    {
      key: "tasks",
      label: "Tâches",
      icon: ListChecks,
      show:
        v.showTasks &&
        portalPerms.canSeeProjectTasks &&
        tasks.length > 0,
    },
    {
      key: "kanban",
      label: "Kanban",
      icon: Layers,
      show: portalPerms.canSeeProjectLinkedTickets,
    },
    {
      key: "tickets",
      label: "Tickets",
      icon: TicketIcon,
      show:
        v.showLinkedTickets &&
        portalPerms.canSeeProjectLinkedTickets,
    },
    {
      key: "activity",
      label: "Activité",
      icon: ActivityIcon,
      show: v.showActivity && activities.length > 0,
    },
  ];

  const upcomingMilestones = milestones
    .filter((m) => m.status === "upcoming" || m.status === "approaching")
    .sort(
      (a, b) =>
        new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
    )
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/portal/projects"
        className="inline-flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux projets
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
              colors.bg,
              colors.text,
              colors.ring
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
            {PROJECT_STATUS_LABELS[project.status]}
          </span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
            {PROJECT_TYPE_LABELS[project.type]}
          </span>
          {project.isAtRisk && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              <AlertTriangle className="h-3 w-3" />À risque
            </span>
          )}
          <span className="ml-auto font-mono text-xs text-neutral-400">
            {project.code}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-neutral-900">
          {project.name}
        </h1>
        <p className="mt-2 text-base text-neutral-500 leading-relaxed">
          {project.description}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-neutral-500">
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-neutral-400" /> Début{" "}
            <span className="font-medium text-neutral-800">
              {format(new Date(project.startDate), "d MMM yyyy", {
                locale: fr,
              })}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-neutral-400" /> Cible{" "}
            <span className="font-medium text-neutral-800">
              {format(new Date(project.targetEndDate), "d MMM yyyy", {
                locale: fr,
              })}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-neutral-400" /> Responsable{" "}
            <span className="font-medium text-neutral-800">
              {project.managerName}
            </span>
          </span>
        </div>
      </div>

      {/* Big progress */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-neutral-500">Avancement global</p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-5xl font-bold text-neutral-900">
                {project.progressPercent}
              </span>
              <span className="mb-1.5 text-2xl font-semibold text-neutral-400">
                %
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              {project.completedTaskCount} / {project.taskCount} tâches
              terminées
            </p>
          </div>
          <div className="flex-1 sm:max-w-md">
            <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  project.isAtRisk ? "bg-red-500" : "bg-[#2563EB]"
                )}
                style={{ width: `${project.progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200">
        <nav className="flex flex-wrap gap-1">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors -mb-px",
                  tab === t.key
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-neutral-500 hover:text-neutral-800"
                )}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">
              Informations du projet
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Type</dt>
                <dd className="font-medium text-neutral-800">
                  {PROJECT_TYPE_LABELS[project.type]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Statut</dt>
                <dd className="font-medium text-neutral-800">
                  {PROJECT_STATUS_LABELS[project.status]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Phases</dt>
                <dd className="font-medium text-neutral-800">
                  {project.phaseCount}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Jalons</dt>
                <dd className="font-medium text-neutral-800">
                  {project.milestoneCount}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">
              Prochaines étapes
            </h3>
            {upcomingMilestones.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-400">
                Aucun jalon à venir.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {upcomingMilestones.map((m) => (
                  <li key={m.id} className="flex items-start gap-3">
                    <Flag className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-neutral-800">
                        {m.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {format(new Date(m.targetDate), "d MMM yyyy", {
                          locale: fr,
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {v.showTimeConsumed && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900">
                Statistiques
              </h3>
              <div className="mt-4">
                <div className="flex items-center gap-2 text-neutral-500">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Heures consommées</span>
                </div>
                <p className="mt-2 text-3xl font-bold text-neutral-900">
                  {project.consumedHours.toFixed(1)}{" "}
                  <span className="text-base font-medium text-neutral-400">
                    h
                  </span>
                </p>
                {v.showBudgetVsActual && project.budgetHours && (
                  <p className="mt-1 text-xs text-neutral-500">
                    sur {project.budgetHours} h budgétées
                  </p>
                )}
              </div>
            </div>
          )}

          {v.showTeamMembers && portalPerms.canSeeTeamMembers && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-3">
              <h3 className="text-sm font-semibold text-neutral-900">
                Équipe Cetix
              </h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#2563EB] font-semibold text-sm">
                      {m.agentName
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">
                        {m.agentName}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {PROJECT_ROLE_LABELS[m.role]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "milestones" && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <ol className="relative space-y-6 border-l-2 border-neutral-100 pl-6">
            {milestones.map((m) => {
              const achieved = m.status === "achieved";
              return (
                <li key={m.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white",
                      achieved
                        ? "bg-emerald-500"
                        : m.status === "missed"
                        ? "bg-red-500"
                        : "bg-violet-500"
                    )}
                  >
                    {achieved ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    ) : (
                      <Flag className="h-3 w-3 text-white" />
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-neutral-900">
                      {m.name}
                    </h4>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                      {MILESTONE_STATUS_LABELS[m.status]}
                    </span>
                    {m.isCriticalPath && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        Chemin critique
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">{m.description}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Cible :{" "}
                    {format(new Date(m.targetDate), "d MMM yyyy", {
                      locale: fr,
                    })}
                    {m.achievedDate && (
                      <>
                        {" • "}Atteint :{" "}
                        {format(new Date(m.achievedDate), "d MMM yyyy", {
                          locale: fr,
                        })}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {tab === "phases" && (
        <div className="space-y-4">
          {phases.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-neutral-400">
                    Phase {p.order}
                  </p>
                  <h4 className="mt-0.5 text-base font-semibold text-neutral-900">
                    {p.name}
                  </h4>
                  <p className="mt-1 text-sm text-neutral-500">
                    {p.description}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 shrink-0">
                  {PHASE_STATUS_LABELS[p.status]}
                </span>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5">
                  <span>Avancement</span>
                  <span className="font-semibold text-neutral-700">
                    {p.progressPercent}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-[#2563EB]"
                    style={{ width: `${p.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-6">
          {phases.map((phase) => {
            const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
            if (phaseTasks.length === 0) return null;
            return (
              <div
                key={phase.id}
                className="rounded-2xl border border-neutral-200 bg-white shadow-sm"
              >
                <div className="border-b border-neutral-100 px-6 py-4">
                  <h4 className="text-sm font-semibold text-neutral-900">
                    {phase.name}
                  </h4>
                </div>
                <ul className="divide-y divide-neutral-100">
                  {phaseTasks.map((t) => {
                    const tc = TASK_STATUS_COLORS[t.status];
                    return (
                      <li
                        key={t.id}
                        className="flex items-center gap-4 px-6 py-4"
                      >
                        {t.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-neutral-300 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-800">
                            {t.name}
                          </p>
                          {t.dueDate && (
                            <p className="text-xs text-neutral-400">
                              Échéance :{" "}
                              {format(new Date(t.dueDate), "d MMM yyyy", {
                                locale: fr,
                              })}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                            tc.bg,
                            tc.text
                          )}
                        >
                          {TASK_STATUS_LABELS[t.status]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {tab === "kanban" && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <ProjectKanbanView projectId={project.id} />
        </div>
      )}

      {tab === "tickets" && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <ul className="divide-y divide-neutral-100">
            {linkedTickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-neutral-50"
              >
                <TicketIcon className="h-4 w-4 text-[#2563EB]" />
                <span className="font-mono text-xs text-neutral-400">
                  {t.id}
                </span>
                <span className="flex-1 text-sm font-medium text-neutral-800">
                  {t.subject}
                </span>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "activity" && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <ol className="relative space-y-5 border-l-2 border-neutral-100 pl-6">
            {activities.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[29px] flex h-4 w-4 items-center justify-center rounded-full bg-[#2563EB] ring-4 ring-white" />
                <p className="text-sm text-neutral-800">
                  <span className="font-semibold">{a.authorName}</span>{" "}
                  {a.content}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {format(new Date(a.createdAt), "d MMM yyyy 'à' HH:mm", {
                    locale: fr,
                  })}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Hidden value to satisfy unused lint */}
      <span className="hidden">{""}</span>
    </div>
  );
}
