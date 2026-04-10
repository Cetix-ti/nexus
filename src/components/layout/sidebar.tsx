"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Ticket,
  Building2,
  Users,
  Monitor,
  FolderKanban,
  CalendarDays,
  Receipt,
  BookOpen,
  BarChart3,
  Zap,
  Bell,
  HardDrive,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar";
import { useSession, signOut } from "next-auth/react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children?: { label: string; href: string }[];
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Tickets",
        href: "/tickets",
        icon: Ticket,
        children: [
          { label: "Tous les tickets", href: "/tickets" },
          { label: "Ma journée", href: "/tickets/my-day" },
          { label: "Vue Kanban", href: "/tickets/kanban" },
          { label: "Mes tickets", href: "/tickets?filter=mine" },
          { label: "Non assignés", href: "/tickets?filter=unassigned" },
        ],
      },
    ],
  },
  {
    label: "Gestion",
    items: [
      { label: "Organisations", href: "/organizations", icon: Building2 },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Actifs", href: "/assets", icon: Monitor },
      { label: "Projets", href: "/projects", icon: FolderKanban },
      { label: "Planificateur", href: "/scheduling", icon: CalendarDays },
      { label: "Préfacturation", href: "/billing", icon: Receipt },
    ],
  },
  {
    label: "Surveillance",
    items: [
      { label: "Alertes monitoring", href: "/monitoring", icon: Bell },
      { label: "Sauvegardes", href: "/backups", icon: HardDrive },
    ],
  },
  {
    label: "Ressources",
    items: [
      { label: "Base de connaissances", href: "/knowledge", icon: BookOpen },
      { label: "Rapports", href: "/reports", icon: BarChart3 },
      { label: "Automatisations", href: "/automations", icon: Zap },
    ],
  },
  {
    label: "Système",
    items: [
      { label: "Paramètres", href: "/settings", icon: Settings },
    ],
  },
];

function NavItemComponent({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  const hasChildren = !!item.children?.length;
  const [expanded, setExpanded] = useState(isActive && hasChildren);

  const Icon = item.icon;

  const handleClick = (e: React.MouseEvent) => {
    if (hasChildren && !collapsed) {
      e.preventDefault();
      setExpanded((s) => !s);
    }
  };

  return (
    <div>
      <Link
        href={item.href}
        onClick={handleClick}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg text-[13.5px] font-medium transition-all duration-150",
          collapsed ? "h-10 w-10 mx-auto justify-center" : "h-10 px-3",
          isActive
            ? "bg-white/[0.07] text-white"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
        )}
        title={collapsed ? item.label : undefined}
      >
        {/* Active indicator bar */}
        {isActive && !collapsed && (
          <span className="absolute -left-[11px] top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-blue-500" />
        )}

        <Icon
          className={cn(
            "shrink-0 transition-colors",
            "h-[18px] w-[18px]",
            isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
          )}
          strokeWidth={2}
        />

        {!collapsed && (
          <>
            <span className="flex-1 truncate tracking-tight">{item.label}</span>
            {hasChildren && (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-slate-500 transition-transform duration-200",
                  expanded ? "rotate-0" : "-rotate-90"
                )}
                strokeWidth={2.5}
              />
            )}
          </>
        )}
      </Link>

      {/* Sub-items */}
      {hasChildren && expanded && !collapsed && (
        <div className="mt-1 ml-[30px] space-y-0.5 border-l border-slate-800 pl-4 py-1">
          {item.children!.map((child) => {
            const childActive = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "block rounded-md py-2 px-3 text-[12.5px] transition-colors",
                  childActive
                    ? "text-blue-400 font-medium bg-white/[0.04]"
                    : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.03]"
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebarStore();
  const { data: session } = useSession();

  const user = session?.user;
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`
    : "NX";

  return (
    <aside
      className="h-full w-full flex flex-col bg-[#0b1222] border-r border-slate-800/80"
      style={{ fontFeatureSettings: '"cv11", "ss01"' }}
    >
      {/* Logo area */}
      <div
        className={cn(
          "flex items-center h-[76px] border-b border-slate-800/80 shrink-0",
          collapsed ? "justify-center px-2" : "px-4"
        )}
      >
        {collapsed ? (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-[15px] shadow-lg shadow-blue-900/30">
            N
          </div>
        ) : (
          <Image
            src="/images/cetix-logo-blanc-horizontal-HD.png"
            alt="Nexus"
            width={240}
            height={80}
            priority
            className="h-12 w-auto"
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto py-5 px-4">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={idx} className={cn(idx > 0 && "mt-6")}>
            {section.label && !collapsed && (
              <h3 className="px-3 mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                {section.label}
              </h3>
            )}
            {section.label && collapsed && idx > 0 && (
              <div className="my-3 mx-auto h-px w-6 bg-slate-800" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItemComponent
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: collapse + user */}
      <div className="border-t border-slate-800/80 p-3 space-y-1">
        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={cn(
            "flex items-center gap-2.5 w-full rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition-colors text-[12.5px]",
            collapsed ? "h-10 justify-center" : "h-9 px-3"
          )}
          title={collapsed ? "Étendre" : "Réduire"}
        >
          {collapsed ? (
            <ChevronsRight className="w-4 h-4" strokeWidth={2} />
          ) : (
            <>
              <ChevronsLeft className="w-4 h-4" strokeWidth={2} />
              <span>Réduire le menu</span>
            </>
          )}
        </button>

        {/* User info */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg",
            collapsed ? "p-2 justify-center" : "p-2.5"
          )}
        >
          <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[11px] font-semibold ring-2 ring-blue-500/20">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-slate-200 truncate leading-tight">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] rounded-md p-1.5 transition-colors"
                title="Déconnexion"
              >
                <LogOut className="w-4 h-4" strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
