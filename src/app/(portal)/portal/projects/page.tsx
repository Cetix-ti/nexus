"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  FolderKanban,
  Clock,
  Flag,
  Inbox,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalUser } from "@/lib/portal/use-portal-user";
import { ProjectCard } from "@/components/portal/project-card";
import type { Project } from "@/lib/projects/types";

/** Partial Project shape returned by the portal API (no visibilitySettings). */
type PortalProject = Omit<Project, "visibilitySettings" | "managerId" | "consumedAmount" | "budgetAmount" | "actualEndDate" | "riskNotes" | "isArchived" | "linkedTicketCount" | "memberCount" | "phaseCount" | "milestoneCount"> & {
  phaseCount?: number;
  milestoneCount?: number;
};

type Filter = "all" | "active" | "upcoming" | "completed" | "at_risk";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "active", label: "En cours" },
  { key: "upcoming", label: "À venir" },
  { key: "completed", label: "Terminés" },
  { key: "at_risk", label: "À risque" },
];

function matchesFilter(p: PortalProject, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "active":
      return p.status === "active";
    case "upcoming":
      return p.status === "planning" || p.status === "draft";
    case "completed":
      return p.status === "completed";
    case "at_risk":
      return p.isAtRisk || p.status === "at_risk";
  }
}

export default function PortalProjectsPage() {
  const { organizationName } = usePortalUser();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/portal/projects");
      if (!res.ok) throw new Error("Erreur lors du chargement des projets");
      const json = await res.json();
      setProjects(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (!matchesFilter(p, filter)) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q)
          );
        }
        return true;
      }),
    [projects, filter, search]
  );

  const activeCount = projects.filter((p) => p.status === "active").length;
  const totalConsumedHours = projects.reduce(
    (s, p) => s + p.consumedHours,
    0
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-dashed border-red-300 bg-white p-12 text-center">
          <h3 className="text-base font-semibold text-red-700">{error}</h3>
          <button
            onClick={fetchProjects}
            className="mt-4 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Mes projets</h1>
        <p className="mt-2 text-base text-neutral-500">
          Suivez l&apos;avancement des projets en cours pour{" "}
          <span className="font-medium text-neutral-700">
            {organizationName}
          </span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">Projets en cours</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">
                {activeCount}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">Heures consommées</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">
                {totalConsumedHours.toFixed(1)} h
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Flag className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Total projets</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">
                {projects.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-[#2563EB] text-white shadow-sm"
                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un projet..."
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Project list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB]">
            <Inbox className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-neutral-900">
            Aucun projet à afficher
          </h3>
          <p className="mt-1.5 text-sm text-neutral-500">
            Aucun projet ne correspond à vos critères pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p as Project} />
          ))}
        </div>
      )}
    </div>
  );
}
