"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Ticket,
  Building2,
  Users,
  Monitor,
  FolderKanban,
  CalendarDays,
  BookOpen,
  BarChart3,
  Zap,
  PieChart,
  FileBarChart,
  Bell,
  HardDrive,
  DollarSign,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  LogOut,
  UserCircle,
  ShieldAlert,
  Brain,
  Lightbulb,
  ShieldCheck,
  Package,
  GitCommit,
  Search,
  TrendingUp,
  CheckSquare,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar";
import { useUserAvatarStore } from "@/stores/user-avatar-store";
import { useSession, signOut } from "next-auth/react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children?: { label: string; href: string; matchPrefix?: string[] }[];
  minRole?: string;
  /** Capacité requise (en plus du rôle). SUPER_ADMIN bypass implicite. */
  requiredCapability?: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const ROLE_LEVELS: Record<string, number> = {
  SUPER_ADMIN: 0, MSP_ADMIN: 1, SUPERVISOR: 2, TECHNICIAN: 3, READ_ONLY: 4,
};
function hasNavAccess(userRole: string, minRole?: string): boolean {
  if (!minRole) return true;
  return (ROLE_LEVELS[userRole] ?? 99) <= (ROLE_LEVELS[minRole] ?? 99);
}

const NAV_SECTIONS: NavSection[] = [
  // Navigation principale « à plat » : on met en haut les entrées que l'agent
  // ouvre le plus souvent, sans les noyer dans des sections. Le Calendrier
  // est intégré au Tableau de bord (plus d'entrée propre ici).
  // Préfacturation a été retirée — toutes les vues de facturation sont gérées
  // depuis Analytique → Rapports (modèles "facturation").
  {
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
      { label: "Recherche", href: "/search", icon: Search },
      {
        label: "Tickets",
        href: "/tickets",
        icon: Ticket,
        children: [
          { label: "Liste", href: "/tickets" },
          { label: "Kanban", href: "/tickets/kanban" },
          { label: "Ma journée", href: "/tickets/my-day" },
        ],
      },
      { label: "Projets clients", href: "/projects", icon: FolderKanban },
      { label: "Mon espace", href: "/my-space", icon: UserCircle },
    ],
  },
  // Regroupement des vues de surveillance (SOC, monitoring, sauvegardes) —
  // toutes sont des flux d'alertes critiques que l'équipe technique surveille
  // en continu, donc on les aligne visuellement.
  {
    label: "Alertes de surveillance",
    items: [
      // Cybersécurité (ex-« Centre de sécurité ») — SOC : AD lockouts,
      // Wazuh, Bitdefender, etc. Placé en tête car c'est le flux le plus
      // critique.
      {
        label: "Cybersécurité",
        href: "/security-center",
        icon: ShieldAlert,
        minRole: "TECHNICIAN",
      },
      // Infrastructure (ex-« Alertes monitoring ») — supervision matériel,
      // serveurs, réseaux, services.
      { label: "Infrastructure", href: "/monitoring", icon: Bell },
      { label: "Sauvegardes", href: "/backups", icon: HardDrive },
    ],
  },
  // Données annexes du côté client — gardées groupées car consultées moins
  // souvent qu'un ticket ou un projet.
  {
    label: "Clients",
    items: [
      { label: "Organisations", href: "/organisations", icon: Building2 },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Actifs", href: "/assets", icon: Monitor },
    ],
  },
  // TECHNICIAN+ : exclut les CLIENT_* / READ_ONLY. La section Équipe contient
  // les données opérationnelles Cetix (rencontres, tickets admin, projets
  // admin) — aucun client ne doit y accéder. Supervision est ici car c'est
  // un outil de gestion d'équipe.
  {
    label: "Équipe",
    items: [
      { label: "Tickets internes", href: "/internal-tickets", icon: Ticket, minRole: "TECHNICIAN" },
      { label: "Projets internes", href: "/internal-projects", icon: FolderKanban, minRole: "TECHNICIAN" },
      { label: "Rencontres", href: "/calendar/meetings", icon: CalendarDays, minRole: "TECHNICIAN" },
      // Supervision — visible uniquement pour les agents qui supervisent
      // d'autres agents. La visibilité effective est aussi contrôlée côté
      // client par l'existence de la clé supervisedAgents dans le profil,
      // en plus du rôle minimum.
      { label: "Supervision", href: "/supervision", icon: BarChart3, minRole: "SUPERVISOR" },
    ],
  },
  // Bibliothèques — contenu documentaire à consulter (catalogues + KB).
  // Workflows opérationnels (approbations, changements, baseline) déplacés
  // dans "Gouvernance" pour séparer "contenu à consulter" de "actions à faire".
  {
    label: "Bibliothèques",
    items: [
      { label: "Logiciels",               href: "/software",        icon: Package,     minRole: "TECHNICIAN" },
      { label: "Politiques",              href: "/policies",        icon: ShieldCheck, minRole: "TECHNICIAN" },
      { label: "Particularités clientes", href: "/particularities", icon: Lightbulb,   minRole: "TECHNICIAN" },
      { label: "Base de connaissances",   href: "/knowledge",       icon: BookOpen },
    ],
  },
  // Gouvernance — workflows d'approbation, change mgmt, évaluation de
  // maturité. Ces items imposent une action ou un suivi, contrairement aux
  // Bibliothèques qui sont du contenu de référence.
  {
    label: "Gouvernance",
    items: [
      { label: "Approbations",         href: "/approvals", icon: CheckSquare, minRole: "TECHNICIAN" },
      { label: "Changements",          href: "/changes",   icon: GitCommit,   minRole: "TECHNICIAN" },
      { label: "Baseline de maturité", href: "/baseline",  icon: TrendingUp,  minRole: "SUPERVISOR" },
    ],
  },
  {
    label: "Ressources",
    items: [
      { label: "Finances", href: "/finances", icon: DollarSign, minRole: "SUPERVISOR", requiredCapability: "finances" },
      {
        label: "Analytique",
        href: "/analytics/dashboards",
        icon: BarChart3,
        // Accès aux rapports/dashboards analytiques = données financières
        // agrégées (revenus par client, rentabilité, etc.). On gate derrière
        // la même capabilité que Finances pour éviter que n'importe quel
        // tech voie les taux ou les revenus.
        requiredCapability: "finances",
        children: [
          {
            label: "Rapports",
            href: "/analytics/dashboards",
            matchPrefix: ["/analytics/dashboards", "/analytics/reports", "/analytics/monthly-reports"],
          },
          {
            label: "Données",
            href: "/analytics/widgets",
            matchPrefix: ["/analytics/widgets", "/analytics/data", "/analytics/datasets", "/analytics/variables"],
          },
        ],
      },
    ],
  },
  {
    label: "Système",
    items: [
      { label: "Paramètres", href: "/settings", icon: Settings, minRole: "MSP_ADMIN" },
      // Automatisation (ex-« Planificateur ») — tickets récurrents, tâches
      // planifiées, jobs cron internes. En bas du menu car c'est un outil
      // de configuration qu'on visite rarement une fois les règles posées.
      { label: "Automatisation", href: "/scheduling", icon: Zap },
      {
        label: "Intelligence IA",
        href: "/intelligence",
        icon: Brain,
        minRole: "SUPER_ADMIN",
        children: [
          { label: "Vue d'ensemble", href: "/intelligence" },
          { label: "Apprentissage", href: "/intelligence/learning" },
          { label: "Détections", href: "/intelligence/detections" },
          { label: "Propositions", href: "/intelligence/proposals" },
          { label: "Coaching techs", href: "/intelligence/techs" },
        ],
      },
      {
        label: "Bug reports",
        href: "/admin/bugs",
        icon: Bug,
        minRole: "MSP_ADMIN",
      },
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
  // For items with children, consider active if any child matches
  const hasChildren = !!item.children?.length;
  const childActiveFlag = hasChildren
    ? item.children!.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"))
    : false;
  const isActive = hasChildren
    ? childActiveFlag
    : pathname === item.href || pathname.startsWith(item.href + "/");

  // Sous-items repliables : DÉPLIÉS par défaut pour que les sous-onglets
  // soient immédiatement visibles sans clic supplémentaire. L'utilisateur
  // peut replier/déplier manuellement via le chevron. S'il navigue sur
  // une route enfant, on s'assure que la section reste dépliée (même si
  // l'user l'avait repliée auparavant).
  const [expanded, setExpanded] = useState<boolean>(true);
  useEffect(() => {
    if (childActiveFlag) setExpanded(true);
  }, [childActiveFlag]);

  const Icon = item.icon;

  // When collapsed and the item has children with a "Kanban" option, point to kanban
  // (per UX preference: collapsed nav prefers kanban view for Tickets)
  const kanbanChild = item.children?.find((c) => c.label.toLowerCase() === "kanban");
  const effectiveHref = collapsed && kanbanChild ? kanbanChild.href : item.href;

  return (
    <div>
      <div
        className={cn(
          "group relative flex items-center rounded-lg transition-all duration-150",
          collapsed ? "h-10 w-10 mx-auto" : "h-10",
          isActive
            ? "bg-white/[0.07]"
            : "hover:bg-white/[0.04]",
        )}
      >
        {/* Active indicator bar */}
        {isActive && !collapsed && (
          <span className="absolute -left-[11px] top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-blue-500" />
        )}

        <Link
          href={effectiveHref}
          className={cn(
            "flex items-center gap-3 text-[13.5px] font-medium transition-colors",
            collapsed
              ? "w-full h-full justify-center"
              : "flex-1 min-w-0 h-full pl-3",
            // Quand l'item a des enfants, on laisse un padding-right plus
            // petit pour laisser la place au bouton chevron.
            !collapsed && hasChildren ? "pr-1" : "pr-3",
            isActive ? "text-white" : "text-slate-400 group-hover:text-slate-100",
          )}
          title={collapsed ? item.label : undefined}
        >
          <Icon
            className={cn(
              "shrink-0 transition-colors h-[18px] w-[18px]",
              isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300",
            )}
            strokeWidth={2}
          />
          {!collapsed && (
            <span className="flex-1 truncate tracking-tight">{item.label}</span>
          )}
        </Link>

        {/* Chevron pour replier/déplier les sous-items. Pas affiché en
            mode sidebar rétractée (déjà icône-seule). */}
        {hasChildren && !collapsed && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Replier" : "Déplier"}
            className={cn(
              "h-full px-2 flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors",
            )}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-150",
                expanded ? "rotate-0" : "-rotate-90",
              )}
              strokeWidth={2}
            />
          </button>
        )}
      </div>

      {/* Sub-items — affichés seulement quand la section est dépliée. */}
      {hasChildren && expanded && !collapsed && (
        <div className="mt-1 ml-[30px] space-y-0.5 border-l border-slate-800 pl-4 py-1">
          {item.children!.map((child) => {
            const childActive = child.matchPrefix
              ? child.matchPrefix.some((p) => pathname === p || pathname.startsWith(p + "/"))
              : pathname === child.href;
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

export function Sidebar({ forceExpanded = false }: { forceExpanded?: boolean } = {}) {
  // Le drawer mobile passe `forceExpanded` pour ignorer l'état "collapsed"
  // du store global (la version 76 px icônes-seules n'a aucun sens dans
  // un drawer 280 px de large).
  const { collapsed: storedCollapsed, toggle } = useSidebarStore();
  const collapsed = forceExpanded ? false : storedCollapsed;
  const { data: session, status: sessionStatus } = useSession();

  const user = session?.user;
  // Don't filter until session is loaded — show all items while loading
  const userRole = sessionStatus === "authenticated" ? ((user as any)?.role ?? "TECHNICIAN") : "SUPER_ADMIN";
  // Capabilities chargées depuis /api/v1/me (pas depuis le JWT — les
  // capabilities changent sans re-login et le JWT ne se rafraîchit pas
  // automatiquement quand un admin modifie les tags d'un user).
  const [userCapabilities, setUserCapabilities] = useState<string[]>([]);
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/v1/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        // effectiveCapabilities = union des capabilities personnelles
        // (overrides) + permissions accordées au rôle (rolePermissions).
        // Sans ça, un SUPER_ADMIN dont les perms finances/billing/
        // purchasing viennent du rôle (et non d'un override perso) voit
        // ces sections cachées dans la sidebar — alors que le serveur
        // les autorise via hasCapability.
        const caps: string[] | undefined = d?.effectiveCapabilities ?? d?.capabilities;
        if (caps) setUserCapabilities(caps);
      })
      .catch(() => {});
  }, [sessionStatus]);
  const avatar = useUserAvatarStore((s) => s.avatar);
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`
    : "NX";

  // Filter nav items by role + capabilities
  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!hasNavAccess(userRole, item.minRole)) return false;
      if (item.requiredCapability) {
        if (!userCapabilities.includes(item.requiredCapability)) return false;
      }
      return true;
    }),
  })).filter((section) => section.items.length > 0);

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
        {filteredSections.map((section, idx) => (
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
        {/* Collapse toggle — caché dans le drawer mobile (forceExpanded) */}
        {!forceExpanded && (
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
        )}

        {/* User info */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg",
            collapsed ? "p-2 justify-center" : "p-2.5"
          )}
        >
          <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[11px] font-semibold ring-2 ring-blue-500/20 overflow-hidden">
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initials}
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
