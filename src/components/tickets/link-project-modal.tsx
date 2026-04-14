"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  FolderKanban,
  Loader2,
  CheckCircle2,
  Building2,
  Calendar,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Project {
  id: string;
  code: string;
  name: string;
  description?: string;
  organizationId: string;
  organizationName?: string;
  status?: string;
  type?: string;
  progressPercent?: number;
  startDate?: string | null;
  targetEndDate?: string | null;
  managerName?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  ticketOrgId?: string | null;
  ticketOrgName?: string | null;
  currentProjectId?: string | null;
  onLink: (project: Project) => Promise<void> | void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  planning: "Planification",
  active: "En cours",
  on_hold: "En pause",
  at_risk: "À risque",
  completed: "Terminé",
  cancelled: "Annulé",
};

const STATUS_VARIANTS: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  draft: "default",
  planning: "primary",
  active: "success",
  on_hold: "warning",
  at_risk: "danger",
  completed: "default",
  cancelled: "default",
};

export function LinkProjectModal({
  open,
  onClose,
  ticketOrgId,
  ticketOrgName,
  currentProjectId,
  onLink,
}: Props) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"org" | "all">("org");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setScope(ticketOrgId ? "org" : "all");
      setLinkingId(null);
    }
  }, [open, ticketOrgId]);

  // Load projects
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/v1/projects?active=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
        setProjects(list);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    let list = projects.filter((p) => p.id !== currentProjectId);
    if (scope === "org" && ticketOrgId) {
      list = list.filter((p) => p.organizationId === ticketOrgId);
    }
    if (search.length > 0) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        [p.code, p.name, p.description, p.managerName, p.organizationName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [projects, scope, ticketOrgId, search, currentProjectId]);

  async function handleLink(project: Project) {
    setLinkingId(project.id);
    try {
      await onLink(project);
    } finally {
      setLinkingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-3rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-slate-900">Lier le ticket à un projet</h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5 truncate">
              Choisissez un projet parmi ceux disponibles pour ce client ou tous les projets actifs
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scope toggle + search */}
        <div className="px-6 py-4 border-b border-slate-200 shrink-0 space-y-3">
          {ticketOrgId && (
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/60 p-1">
              <button
                onClick={() => setScope("org")}
                className={cn(
                  "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                  scope === "org"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Building2 className="inline h-3 w-3 mr-1 -mt-0.5" />
                {ticketOrgName ? `Projets de ${ticketOrgName}` : "Projets de cette org"}
              </button>
              <button
                onClick={() => setScope("all")}
                className={cn(
                  "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                  scope === "all"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <FolderKanban className="inline h-3 w-3 mr-1 -mt-0.5" />
                Tous les projets
              </button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par code, nom, gestionnaire…"
              autoFocus
              className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 pl-11 pr-4 text-[14px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
                <FolderKanban className="h-6 w-6" />
              </div>
              <p className="text-[13px] text-slate-500">
                {search
                  ? "Aucun projet ne correspond à votre recherche."
                  : scope === "org"
                    ? "Aucun projet disponible pour cette organisation."
                    : "Aucun projet actif disponible."}
              </p>
              {scope === "org" && !search && (
                <button
                  onClick={() => setScope("all")}
                  className="mt-3 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                >
                  Voir tous les projets →
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-[11.5px] text-slate-500 px-1 mb-2">
                {filtered.length} projet{filtered.length > 1 ? "s" : ""} disponible{filtered.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {filtered.map((p) => {
                  const isLinking = linkingId === p.id;
                  const statusKey = p.status ?? "draft";
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleLink(p)}
                      disabled={isLinking}
                      className="group w-full flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50/30 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="h-10 w-10 rounded-lg bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                        <FolderKanban className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-[11.5px] font-mono text-slate-400 shrink-0">{p.code}</span>
                          <span className="text-[13px] font-semibold text-slate-900 truncate">{p.name}</span>
                          <Badge variant={STATUS_VARIANTS[statusKey] ?? "default"} className="text-[10px] shrink-0">
                            {STATUS_LABELS[statusKey] ?? p.status}
                          </Badge>
                        </div>
                        {scope === "all" && p.organizationName && (
                          <p className="text-[11.5px] text-slate-500 truncate flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {p.organizationName}
                          </p>
                        )}
                        {p.description && (
                          <p className="text-[11.5px] text-slate-500 truncate mt-0.5">{p.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-[10.5px] text-slate-400">
                          {typeof p.progressPercent === "number" && (
                            <span className="flex items-center gap-0.5">
                              <span className="font-medium text-slate-600">{p.progressPercent}%</span>
                            </span>
                          )}
                          {p.managerName && p.managerName !== "—" && (
                            <span className="truncate">{p.managerName}</span>
                          )}
                          {p.targetEndDate && (
                            <span className="flex items-center gap-0.5 shrink-0">
                              <Calendar className="h-2.5 w-2.5" />
                              {new Date(p.targetEndDate).toLocaleDateString("fr-CA")}
                            </span>
                          )}
                        </div>
                      </div>
                      {isLinking ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0 mt-1" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-slate-300 group-hover:text-blue-500 shrink-0 mt-1" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-end shrink-0">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}
