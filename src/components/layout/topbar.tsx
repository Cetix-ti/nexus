"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Loader2, Ticket, Building2, User, FileText } from "lucide-react";
import { Breadcrumbs } from "./breadcrumbs";
import { NotificationsDropdown } from "./notifications-dropdown";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "ticket" | "organization" | "contact" | "project";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_ICONS = {
  ticket: Ticket,
  organization: Building2,
  contact: User,
  project: FileText,
};

const TYPE_LABELS = {
  ticket: "Ticket",
  organization: "Organisation",
  contact: "Contact",
  project: "Projet",
};

export function Topbar() {
  const router = useRouter();
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Cmd/Ctrl+K focuses the search input
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!focused) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [focused]);

  // Search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const [ticketsRes, orgsRes, contactsRes] = await Promise.all([
        fetch(`/api/v1/tickets?search=${encodeURIComponent(q)}&limit=5`).then((r) => r.ok ? r.json() : { data: [] }),
        fetch(`/api/v1/organizations?search=${encodeURIComponent(q)}&limit=5`).then((r) => r.ok ? r.json() : []),
        fetch(`/api/v1/contacts/search?q=${encodeURIComponent(q)}`).then((r) => r.ok ? r.json() : []),
      ]);

      const items: SearchResult[] = [];

      // Tickets
      const tickets = ticketsRes.data ?? ticketsRes ?? [];
      for (const t of (Array.isArray(tickets) ? tickets : []).slice(0, 5)) {
        items.push({
          type: "ticket",
          id: t.id,
          title: `${t.number ? `#${t.number}` : ""} ${t.subject ?? t.title ?? ""}`.trim(),
          subtitle: t.organizationName ?? t.status ?? "",
          href: `/tickets/${t.id}`,
        });
      }

      // Orgs
      const orgs = Array.isArray(orgsRes) ? orgsRes : orgsRes.data ?? [];
      for (const o of orgs.slice(0, 3)) {
        items.push({
          type: "organization",
          id: o.id,
          title: o.name,
          subtitle: o.domain ?? "",
          href: `/organizations/${o.id}`,
        });
      }

      // Contacts
      for (const c of (Array.isArray(contactsRes) ? contactsRes : []).slice(0, 3)) {
        items.push({
          type: "contact",
          id: c.id,
          title: `${c.firstName} ${c.lastName}`,
          subtitle: `${c.email} · ${c.organizationName ?? ""}`,
          href: `/organizations/${c.organizationId}`,
        });
      }

      setResults(items);
      setSelectedIdx(-1);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && selectedIdx >= 0 && results[selectedIdx]) {
      e.preventDefault();
      router.push(results[selectedIdx].href);
      setFocused(false);
      setQuery("");
    } else if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  function navigateTo(href: string) {
    router.push(href);
    setFocused(false);
    setQuery("");
  }

  const showDropdown = focused && (results.length > 0 || (query.length >= 2 && !searching));

  return (
    <>
      <header className="sticky top-0 z-30 h-[76px] shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between gap-4 px-8">
        {/* Left: Breadcrumbs */}
        <div className="flex items-center min-w-0 flex-1">
          <Breadcrumbs />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Quick create ticket */}
          <button
            onClick={() => setNewTicketOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Nouveau ticket</span>
          </button>

          {/* Inline search */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={2.25} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onKeyDown={handleKeyDown}
                placeholder="Rechercher..."
                className="h-10 w-[280px] pl-10 pr-12 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200/80 focus:border-blue-300 rounded-lg text-[13px] text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {searching ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
              ) : (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-0.5 h-5 px-1.5 bg-white rounded border border-slate-200 text-[10px] font-medium text-slate-400 shadow-sm">
                  <span>⌘</span>K
                </kbd>
              )}
            </div>

            {/* Results dropdown */}
            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full mt-1.5 w-[400px] max-h-[400px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-50"
              >
                {results.length > 0 ? (
                  <div className="py-1">
                    {results.map((r, i) => {
                      const Icon = TYPE_ICONS[r.type];
                      return (
                        <button
                          key={`${r.type}-${r.id}`}
                          onClick={() => navigateTo(r.href)}
                          onMouseEnter={() => setSelectedIdx(i)}
                          className={cn(
                            "flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors",
                            selectedIdx === i ? "bg-blue-50" : "hover:bg-slate-50",
                          )}
                        >
                          <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <Icon className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-slate-900 truncate">
                              {r.title}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {TYPE_LABELS[r.type]} · {r.subtitle}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-[13px] text-slate-400">
                    Aucun résultat pour « {query} »
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notifications */}
          <NotificationsDropdown />

          {/* Separator */}
          <div className="w-px h-6 bg-slate-200 mx-1.5" />

          {/* Organization switcher */}
          <OrgSwitcher />

          {/* User menu */}
          <UserMenu />
        </div>
      </header>

      <NewTicketModal
        open={newTicketOpen}
        onClose={() => setNewTicketOpen(false)}
      />
    </>
  );
}
