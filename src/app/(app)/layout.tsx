"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { AiChatWidget } from "@/components/ai/ai-chat-widget";
import { NotificationToasts } from "@/components/layout/notification-toasts";
import { Topbar } from "@/components/layout/topbar";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationsDropdown } from "@/components/layout/notifications-dropdown";
import { UserPrefsSyncBoot } from "@/components/user-prefs-sync-boot";
import { IdleSecurityPrefetcher } from "@/components/security-center/idle-prefetcher";
import { BugReportFab } from "@/components/bugs/bug-report-fab";
import { useSidebarStore } from "@/stores/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebarStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Ferme le drawer mobile à chaque navigation — sinon il reste ouvert
  // par-dessus la page cible.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Keyboard shortcut: Ctrl/Cmd+B to toggle sidebar
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        // Avoid triggering while typing in inputs
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50">
      {/* Sync des préférences user (localStorage ↔ DB) — invisible */}
      <UserPrefsSyncBoot />
      {/* Warme le cache du Centre de sécurité en période d'inactivité
          (TECHNICIAN+ uniquement — les clients n'y ont pas accès) */}
      <IdleSecurityPrefetcher />
      {/* Desktop layout — sidebar + content */}
      <div
        className="hidden md:grid h-screen"
        style={{
          gridTemplateColumns: `${collapsed ? "76px" : "260px"} 1fr`,
          gridTemplateRows: "100%",
          transition: "grid-template-columns 300ms ease-in-out",
        }}
      >
        <div className="h-screen overflow-hidden">
          <Sidebar />
        </div>
        <div className="flex flex-col h-screen min-w-0 overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="px-4 lg:px-8 py-5 lg:py-7 min-w-0 max-w-[1800px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile layout — no sidebar, hamburger menu */}
      <div className="flex flex-col h-screen md:hidden">
        {/* Mobile topbar — inclut l'avatar (UserMenu) et la cloche
            (NotificationsDropdown) à droite. Sans ça les users mobiles
            n'avaient AUCUN accès à "Mon profil" ni aux notifications. */}
        <header className="sticky top-0 z-30 h-14 shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-[15px] font-semibold text-slate-900">
              Nexus
            </span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsDropdown />
            <UserMenu />
          </div>
        </header>

        {/* Mobile content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50">
          <div className="px-3 py-3 min-w-0">{children}</div>
        </main>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-slate-900/50"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-[min(280px,85vw)] h-full">
              <Sidebar forceExpanded />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 z-10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Chat Widget — floating */}
      <AiChatWidget />

      {/* Bug report FAB — floating bottom-right, above AiChat */}
      <BugReportFab />

      {/* Toast notifications — bottom-right */}
      <NotificationToasts />
    </div>
  );
}
