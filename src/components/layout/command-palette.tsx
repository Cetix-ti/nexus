"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Ticket as TicketIcon,
  Building2,
  Users,
  FolderKanban,
  BookOpen,
  BarChart3,
  Settings,
  LayoutDashboard,
  ArrowRight,
  Receipt,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  category: "Page" | "Ticket" | "Organisation" | "Projet" | "Action";
  icon: typeof Search;
  title: string;
  subtitle?: string;
  href: string;
  shortcut?: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  clientCode?: string | null;
}

interface Project {
  id: string;
  name: string;
  code: string;
  organizationName?: string;
}

const PAGES: SearchResult[] = [
  { id: "p-dash", category: "Page", icon: LayoutDashboard, title: "Tableau de bord", href: "/dashboard" },
  { id: "p-tickets", category: "Page", icon: TicketIcon, title: "Tickets", href: "/tickets" },
  { id: "p-kanban", category: "Page", icon: TicketIcon, title: "Vue Kanban des tickets", href: "/tickets/kanban" },
  { id: "p-orgs", category: "Page", icon: Building2, title: "Organisations", href: "/organizations" },
  { id: "p-contacts", category: "Page", icon: Users, title: "Contacts", href: "/contacts" },
  { id: "p-projects", category: "Page", icon: FolderKanban, title: "Projets", href: "/projects" },
  { id: "p-assets", category: "Page", icon: Monitor, title: "Actifs", href: "/assets" },
  { id: "p-kb", category: "Page", icon: BookOpen, title: "Base de connaissances", href: "/knowledge" },
  { id: "p-reports", category: "Page", icon: BarChart3, title: "Rapports", href: "/reports" },
  { id: "p-billing", category: "Page", icon: Receipt, title: "Préfacturation", href: "/billing" },
  { id: "p-settings", category: "Page", icon: Settings, title: "Paramètres", href: "/settings" },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Data loaded once on mount
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // API search results for tickets
  const [ticketResults, setTicketResults] = useState<SearchResult[]>([]);

  // Load organizations and projects once on mount
  useEffect(() => {
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const orgs = Array.isArray(data) ? data : data.data ?? [];
        setOrganizations(orgs);
      })
      .catch(() => setOrganizations([]));

    fetch("/api/v1/projects")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((data) => {
        setProjects(data.data ?? []);
      })
      .catch(() => setProjects([]));
  }, []);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTicketResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced ticket search
  const searchTickets = useCallback(async (q: string) => {
    if (q.length < 2) {
      setTicketResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/tickets?search=${encodeURIComponent(q)}&limit=5`
      );
      if (!res.ok) {
        setTicketResults([]);
        return;
      }
      const json = await res.json();
      const tickets = json.data ?? json ?? [];
      const items: SearchResult[] = (
        Array.isArray(tickets) ? tickets : []
      )
        .slice(0, 5)
        .map((t: Record<string, string>) => ({
          id: `t-${t.id}`,
          category: "Ticket" as const,
          icon: TicketIcon,
          title: t.subject ?? t.title ?? "",
          subtitle: `${t.number ? `#${t.number}` : ""} • ${t.organizationName ?? ""}`.trim(),
          href: `/tickets/${t.id}`,
        }));
      setTicketResults(items);
    } catch {
      setTicketResults([]);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setTicketResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => searchTickets(q), 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, searchTickets]);

  // Compute results: pages (static), orgs & projects (client-side filter), tickets (API)
  const results: SearchResult[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    const all: SearchResult[] = [];

    // Pages
    for (const p of PAGES) {
      if (!q || p.title.toLowerCase().includes(q)) all.push(p);
    }

    // Tickets (from API)
    if (q) {
      all.push(...ticketResults);
    }

    // Organizations (client-side filter)
    if (q) {
      for (const o of organizations) {
        if (o.name.toLowerCase().includes(q)) {
          all.push({
            id: `o-${o.id}`,
            category: "Organisation",
            icon: Building2,
            title: o.name,
            subtitle: `/${o.slug}`,
            href: `/organisations/${encodeURIComponent(o.slug || o.clientCode || o.id)}`,
          });
        }
      }
    }

    // Projects (client-side filter)
    if (q) {
      for (const p of projects) {
        if (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q)
        ) {
          all.push({
            id: `pr-${p.id}`,
            category: "Projet",
            icon: FolderKanban,
            title: p.name,
            subtitle: `${p.code}${p.organizationName ? ` • ${p.organizationName}` : ""}`,
            href: `/projects/${p.id}`,
          });
        }
      }
    }

    return all.slice(0, 30);
  }, [query, ticketResults, organizations, projects]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return Array.from(map.entries());
  }, [results]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[selectedIdx];
        if (r) {
          router.push(r.href);
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, results, selectedIdx, router, onClose]);

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="h-4 w-4 text-slate-400 shrink-0" strokeWidth={2.25} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            placeholder="Rechercher tickets, organisations, projets, pages..."
            className="flex-1 bg-transparent text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[480px] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-[13px] font-medium text-slate-500">
                Aucun résultat trouvé
              </p>
              <p className="text-[12px] text-slate-400 mt-1">
                Essayez une autre recherche
              </p>
            </div>
          ) : (
            grouped.map(([category, items]) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  {category}
                </div>
                {items.map((r) => {
                  runningIdx++;
                  const isSelected = runningIdx === selectedIdx;
                  const Icon = r.icon;
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        router.push(r.href);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIdx(runningIdx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 mx-1.5 rounded-lg text-left transition-colors",
                        isSelected
                          ? "bg-blue-50 ring-1 ring-blue-200/60"
                          : "hover:bg-slate-50"
                      )}
                    >
                      <div
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset",
                          isSelected
                            ? "bg-blue-100 text-blue-600 ring-blue-200/60"
                            : "bg-slate-100 text-slate-600 ring-slate-200/60"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-[13px] font-medium truncate",
                            isSelected ? "text-blue-700" : "text-slate-900"
                          )}
                        >
                          {r.title}
                        </p>
                        {r.subtitle && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {r.subtitle}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <ArrowRight className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-2 bg-slate-50/40 flex items-center justify-end text-[10.5px] text-slate-500">
          <span className="font-medium">{results.length} résultats</span>
        </div>
      </div>
    </div>
  );
}
