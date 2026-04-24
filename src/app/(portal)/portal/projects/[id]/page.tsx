"use client";

import { use, useCallback, useEffect, useState } from "react";
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
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Ticket as TicketIcon,
  Users,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectKanbanView } from "@/components/projects/project-kanban-view";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
} from "@/lib/projects/types";
import { usePortalUser } from "@/lib/portal/use-portal-user";
import { useLocaleStore } from "@/stores/locale-store";

/** Shape returned by GET /api/v1/portal/projects/:id */
interface PortalProjectDetail {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  managerName: string;
  organizationName: string;
  startDate: string;
  targetEndDate: string;
  progressPercent: number;
  consumedHours: number;
  budgetHours: number | null;
  isAtRisk: boolean;
  tags: string[];
  taskCount: number;
  completedTaskCount: number;
  tasks: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    progressPercent: number;
  }[];
}

type Tab = "overview" | "tasks" | "kanban" | "tickets";

export default function PortalProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { permissions: portalPerms } = usePortalUser();
  const t = useLocaleStore((s) => s.t);
  const locale = useLocaleStore((s) => s.locale);
  const [tab, setTab] = useState<Tab>("overview");
  const [project, setProject] = useState<PortalProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      setLoading(true);
      setNotFound(false);
      const res = await fetch(`/api/v1/portal/projects/${id}`);
      if (res.status === 404 || res.status === 403 || res.status === 401) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(t("portal.projectDetail.serverError"));
      const json = await res.json();
      setProject(json.data ?? null);
      if (!json.data) setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="mx-auto max-w-6xl">
        <Link
          href="/portal/projects"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("portal.projectDetail.back")}
        </Link>
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">
            {t("portal.projectDetail.notFound")}
          </h2>
          <p className="mt-1.5 text-sm text-neutral-500">
            {t("portal.projectDetail.notFoundDesc")}
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
          <ArrowLeft className="h-4 w-4" /> {t("portal.projectDetail.back")}
        </Link>
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">
            {t("portal.projectDetail.accessLimited")}
          </h2>
          <p className="mt-1.5 text-sm text-neutral-500">
            {t("portal.projectDetail.accessLimitedDesc")}
          </p>
        </div>
      </div>
    );
  }

  const colors = PROJECT_STATUS_COLORS[project.status as keyof typeof PROJECT_STATUS_COLORS];
  const tasks = project.tasks ?? [];

  const tabs: { key: Tab; labelKey: string; icon: typeof Layers; show: boolean }[] = [
    { key: "overview", labelKey: "portal.projectDetail.tab.overview", icon: Layers, show: true },
    {
      key: "tasks",
      labelKey: "portal.projectDetail.tab.tasks",
      icon: ListChecks,
      show: portalPerms.canSeeProjectTasks && tasks.length > 0,
    },
    {
      key: "kanban",
      labelKey: "portal.projectDetail.tab.kanban",
      icon: Layers,
      show: portalPerms.canSeeProjectLinkedTickets,
    },
    {
      key: "tickets",
      labelKey: "portal.projectDetail.tab.tickets",
      icon: TicketIcon,
      show: portalPerms.canSeeProjectLinkedTickets,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/portal/projects"
        className="inline-flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" /> {t("portal.projectDetail.back")}
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
            {PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]}
          </span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
            {PROJECT_TYPE_LABELS[project.type as keyof typeof PROJECT_TYPE_LABELS]}
          </span>
          {project.isAtRisk && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              <AlertTriangle className="h-3 w-3" />{t("portal.projectDetail.atRisk")}
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
            <Calendar className="h-4 w-4 text-neutral-400" /> {t("portal.projectDetail.start")}{" "}
            <span className="font-medium text-neutral-800">
              {format(new Date(project.startDate), "d MMM yyyy", {
                locale: locale === "fr" ? fr : undefined,
              })}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-neutral-400" /> {t("portal.projectDetail.target")}{" "}
            <span className="font-medium text-neutral-800">
              {format(new Date(project.targetEndDate), "d MMM yyyy", {
                locale: locale === "fr" ? fr : undefined,
              })}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-neutral-400" /> {t("portal.projectDetail.manager")}{" "}
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
            <p className="text-sm text-neutral-500">{t("portal.projectDetail.progress")}</p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-5xl font-bold text-neutral-900">
                {project.progressPercent}
              </span>
              <span className="mb-1.5 text-xl sm:text-2xl font-semibold text-neutral-400">
                %
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              {t("portal.projectDetail.tasksCompleted", {
                done: project.completedTaskCount,
                total: project.taskCount,
              })}
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
            .map((tabDef) => (
              <button
                key={tabDef.key}
                onClick={() => setTab(tabDef.key)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors -mb-px",
                  tab === tabDef.key
                    ? "border-[#2563EB] text-[#2563EB]"
                    : "border-transparent text-neutral-500 hover:text-neutral-800"
                )}
              >
                <tabDef.icon className="h-4 w-4" /> {t(tabDef.labelKey)}
              </button>
            ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">
              {t("portal.projectDetail.info")}
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t("portal.projectDetail.infoType")}</dt>
                <dd className="font-medium text-neutral-800">
                  {PROJECT_TYPE_LABELS[project.type as keyof typeof PROJECT_TYPE_LABELS]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t("portal.projectDetail.infoStatus")}</dt>
                <dd className="font-medium text-neutral-800">
                  {PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t("portal.projectDetail.infoTasks")}</dt>
                <dd className="font-medium text-neutral-800">
                  {project.completedTaskCount} / {project.taskCount}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">
              {t("portal.projectDetail.stats")}
            </h3>
            <div className="mt-4">
              <div className="flex items-center gap-2 text-neutral-500">
                <Clock className="h-4 w-4" />
                <span className="text-sm">{t("portal.projectDetail.hoursConsumed")}</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-neutral-900">
                {project.consumedHours.toFixed(1)}{" "}
                <span className="text-base font-medium text-neutral-400">
                  h
                </span>
              </p>
              {project.budgetHours && (
                <p className="mt-1 text-xs text-neutral-500">
                  {t("portal.projectDetail.hoursBudgeted", { hours: project.budgetHours })}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">
              {t("portal.projectDetail.manager")}
            </h3>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#2563EB] font-semibold text-sm">
                {project.managerName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <p className="text-sm font-medium text-neutral-800">
                {project.managerName}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <ul className="divide-y divide-neutral-100">
            {tasks.map((task) => {
              const tc = TASK_STATUS_COLORS[task.status as keyof typeof TASK_STATUS_COLORS];
              return (
                <li
                  key={task.id}
                  className="flex items-center gap-4 px-6 py-4"
                >
                  {task.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-neutral-300 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800">
                      {task.name}
                    </p>
                    {task.dueDate && (
                      <p className="text-xs text-neutral-400">
                        {t("portal.projectDetail.dueDate")} :{" "}
                        {format(new Date(task.dueDate), "d MMM yyyy", {
                          locale: locale === "fr" ? fr : undefined,
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
                    {TASK_STATUS_LABELS[task.status as keyof typeof TASK_STATUS_LABELS]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === "kanban" && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <ProjectKanbanView projectId={project.id} />
        </div>
      )}

      {tab === "tickets" && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB]">
            <TicketIcon className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-neutral-900">
            {t("portal.projectDetail.linkedTickets")}
          </h3>
          <p className="mt-1.5 text-sm text-neutral-500">
            {t("portal.projectDetail.linkedTicketsSoon")}
          </p>
        </div>
      )}
    </div>
  );
}
