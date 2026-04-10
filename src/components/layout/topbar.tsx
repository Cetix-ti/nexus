"use client";

import { useState, useEffect } from "react";
import { Search, Plus } from "lucide-react";
import { Breadcrumbs } from "./breadcrumbs";
import { NotificationsDropdown } from "./notifications-dropdown";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { CommandPalette } from "./command-palette";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";

export function Topbar() {
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd/Ctrl+K to open search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 h-[76px] shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between gap-4 px-8">
        {/* Left: Breadcrumbs */}
        <div className="flex items-center min-w-0 flex-1">
          <Breadcrumbs />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Quick create ticket button */}
          <button
            onClick={() => setNewTicketOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Nouveau ticket</span>
          </button>

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2.5 h-10 pl-3.5 pr-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg text-[13px] text-slate-500 transition-colors cursor-pointer min-w-[260px]"
            title="Rechercher (Cmd+K)"
          >
            <Search className="w-4 h-4 text-slate-400" strokeWidth={2.25} />
            <span className="flex-1 text-left">Rechercher...</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 h-5 px-1.5 bg-white rounded border border-slate-200 text-[10px] font-medium text-slate-400 shadow-sm">
              <span>⌘</span>K
            </kbd>
          </button>

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
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}
