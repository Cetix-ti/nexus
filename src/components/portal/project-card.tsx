"use client";

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Project,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
  PROJECT_TYPE_LABELS,
} from "@/lib/projects/types";

interface ProjectCardProps {
  project: Project;
  compact?: boolean;
}

export function ProjectCard({ project, compact = false }: ProjectCardProps) {
  const colors = PROJECT_STATUS_COLORS[project.status];

  if (compact) {
    return (
      <Link
        href={`/portal/projects/${project.id}`}
        className="group block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              colors.bg,
              colors.text,
              colors.ring
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
            {PROJECT_STATUS_LABELS[project.status]}
          </span>
          {project.isAtRisk && (
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          )}
        </div>
        <h3 className="mt-2.5 text-sm font-semibold text-neutral-900 line-clamp-1 group-hover:text-[#2563EB] transition-colors">
          {project.name}
        </h3>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1.5">
            <span>Avancement</span>
            <span className="font-semibold text-neutral-700">
              {project.progressPercent}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-[#2563EB] transition-all"
              style={{ width: `${project.progressPercent}%` }}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-400">
          <span className="flex items-center gap-1">
            <CalendarCheck className="h-3 w-3" />
            {format(new Date(project.targetEndDate), "d MMM yyyy", {
              locale: fr,
            })}
          </span>
          <span className="flex items-center gap-1 text-[#2563EB] group-hover:gap-1.5 transition-all">
            Voir <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/portal/projects/${project.id}`}
      className="group block rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all"
    >
      <div className="flex items-start justify-between gap-4">
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
          <span className="inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
            {PROJECT_TYPE_LABELS[project.type]}
          </span>
          {project.isAtRisk && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              <AlertTriangle className="h-3 w-3" />À risque
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-neutral-400">
          {project.code}
        </span>
      </div>

      <h2 className="mt-4 text-lg font-semibold text-neutral-900 group-hover:text-[#2563EB] transition-colors">
        {project.name}
      </h2>
      <p className="mt-1.5 text-sm text-neutral-500 line-clamp-2 leading-relaxed">
        {project.description}
      </p>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
          <span>Avancement</span>
          <span className="text-sm font-semibold text-neutral-800">
            {project.progressPercent}%
          </span>
        </div>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              project.isAtRisk ? "bg-red-500" : "bg-[#2563EB]"
            )}
            style={{ width: `${project.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-neutral-400" />
          Début{" "}
          <span className="font-medium text-neutral-700">
            {format(new Date(project.startDate), "d MMM yyyy", { locale: fr })}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarCheck className="h-3.5 w-3.5 text-neutral-400" />
          Cible{" "}
          <span className="font-medium text-neutral-700">
            {format(new Date(project.targetEndDate), "d MMM yyyy", {
              locale: fr,
            })}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <UserIcon className="h-3.5 w-3.5 text-neutral-400" />
          <span className="font-medium text-neutral-700">
            {project.managerName}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1 text-sm font-medium text-[#2563EB] group-hover:gap-1.5 transition-all">
          Voir le projet <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
