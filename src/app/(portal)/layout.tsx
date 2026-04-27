"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  Home,
  Ticket,
  ChevronDown,
  LogOut,
  User,
  Menu,
  X,
  FolderKanban,
  BarChart3,
  Monitor,
  Users,
  DollarSign,
  PanelLeftClose,
  PanelLeft,
  Lightbulb,
  ShieldCheck,
  Package,
  GitCommit,
  CalendarClock,
  Wallet,
} from "lucide-react";
import { usePortalUser } from "@/lib/portal/use-portal-user";
import { PortalImpersonationBanner } from "@/components/portal/impersonation-banner";
import { LanguageSelector } from "@/components/layout/language-selector";
import { useLocaleStore } from "@/stores/locale-store";

interface NavItem {
  labelKey: string;
  label?: string;
  href: string;
  icon: any;
  adminOnly?: boolean;
  /** Nom de la clé de permission (ex: canSeeParticularities) requise pour afficher l'entrée. */
  requiresPermission?: string;
}

const navItems: NavItem[] = [
  { labelKey: "portal.nav.home", href: "/portal", icon: Home },
  { labelKey: "portal.nav.tickets", href: "/portal/tickets", icon: Ticket },
  { labelKey: "portal.nav.assets", href: "/portal/assets", icon: Monitor },
  { labelKey: "portal.nav.projects", href: "/portal/projects", icon: FolderKanban, adminOnly: true },
  { labelKey: "portal.nav.reports", href: "/portal/reports", icon: BarChart3, adminOnly: true },
  { labelKey: "portal.nav.finances", href: "/portal/finances", icon: DollarSign, adminOnly: true },
  { labelKey: "portal.nav.contacts", href: "/portal/contacts", icon: Users, adminOnly: true },
  // Modules documentaires (gated par flag, ADMIN = défaut true via derive)
  { labelKey: "portal.nav.particularities", label: "Particularités", href: "/portal/particularities", icon: Lightbulb, requiresPermission: "canSeeParticularities" },
  { labelKey: "portal.nav.policies",        label: "Politiques",     href: "/portal/policies",        icon: ShieldCheck, requiresPermission: "canSeePolicies" },
  { labelKey: "portal.nav.software",        label: "Logiciels",      href: "/portal/software",        icon: Package,     requiresPermission: "canSeeSoftware" },
  { labelKey: "portal.nav.changes",         label: "Changements",    href: "/portal/changes",         icon: GitCommit,   requiresPermission: "canSeeChanges" },
  { labelKey: "portal.nav.renewals",        label: "Échéances",      href: "/portal/renewals",        icon: CalendarClock, requiresPermission: "canSeeRenewals" },
  { labelKey: "portal.nav.budget",          label: "Budget TI",      href: "/portal/budget",          icon: Wallet,      requiresPermission: "canSeeBudget" },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, organizationName, permissions } = usePortalUser();
  const t = useLocaleStore((s) => s.t);
  const isAdmin = permissions.portalRole === "admin";
  const visibleNav = navItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.requiresPermission) {
      const val = (permissions as unknown as Record<string, boolean>)[item.requiresPermission];
      if (!val) return false;
    }
    return true;
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isLoginPage = pathname === "/portal/login";

  // Re-vérifie en DB la validité de la session à chaque navigation portail.
  // Le JWT NextAuth garde un snapshot 24h ; sans ce check, désactiver un
  // contact dans Nexus ne lui coupe pas l'accès tant que son token n'a pas
  // expiré. La route /api/v1/portal/session-check vérifie isActive +
  // portalEnabled + statut de l'org. Sur 401 on déconnecte côté client.
  useEffect(() => {
    if (isLoginPage) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/v1/portal/session-check", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (cancelled) return;
        if (r.status === 401) {
          await signOut({ callbackUrl: "/portal/login" });
        }
      } catch {
        // Erreur réseau : on laisse passer plutôt que de déconnecter
        // intempestivement le user (un blip ne doit pas l'éjecter).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, isLoginPage]);

  if (isLoginPage) {
    return <div className="min-h-screen bg-[#F9FAFB]">{children}</div>;
  }

  const displayName = user?.name || t("portal.layout.defaultUser");
  const displayEmail = user?.email || "";
  const orgName = organizationName || t("portal.layout.defaultOrg");
  const accentGradient = "from-blue-500 to-blue-700";

  // Branding: load MSP branding + org logo
  const [brand, setBrand] = useState<{
    logo: string | null;
    primaryColor: string;
    companyName: string;
  } | null>(null);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/settings/portal-branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setBrand(data); })
      .catch(() => {});
    fetch("/api/v1/portal/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.orgLogo) setOrgLogo(data.orgLogo);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F9FAFB]"
      style={
        brand?.primaryColor
          ? ({ ["--portal-primary" as string]: brand.primaryColor } as React.CSSProperties)
          : undefined
      }
    >
      {/* Impersonation banner — pinned at the very top when an agent
          is viewing the portal as a client contact. Kept OUTSIDE the
          sidebar/main flex-row so it can't be stretched by flex layout. */}
      <PortalImpersonationBanner />

      {/* Main layout: fixed sidebar + flexible content */}
      <div className="flex flex-1 min-h-0 relative">

      {/* ================================================================ */}
      {/* SIDEBAR — desktop                                                */}
      {/* ================================================================ */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed inset-y-0 left-0 z-30 bg-white border-r border-neutral-200 transition-all duration-200",
          sidebarCollapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-neutral-100 shrink-0">
          {!sidebarCollapsed ? (
            <Link href="/portal" className="flex items-center gap-2.5 min-w-0">
              <Image
                src="/images/cetix-logo-email.png"
                alt="Cetix"
                width={120}
                height={36}
                className="h-8 w-auto"
                priority
              />
            </Link>
          ) : (
            <Link href="/portal" className="mx-auto">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-[11px] font-bold">
                C
              </div>
            </Link>
          )}
        </div>

        {/* Org badge */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3 border-b border-neutral-100">
            <div className="flex items-center gap-2.5">
              {orgLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={orgLogo}
                  alt={orgName}
                  className="h-8 w-8 rounded-lg object-contain bg-white ring-1 ring-slate-200 shrink-0"
                />
              ) : (
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm shrink-0 text-white text-[12px] font-bold",
                    accentGradient,
                  )}
                  style={brand?.primaryColor ? { background: brand.primaryColor } : undefined}
                >
                  {(orgName || "N").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-neutral-900 truncate leading-tight">
                  {orgName}
                </p>
                <p className="text-[10.5px] text-neutral-400 uppercase tracking-wider font-medium">
                  {t("portal.layout.clientPortal")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const isActive =
              item.href === "/portal"
                ? pathname === "/portal"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? (item.label ?? t(item.labelKey)) : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition-colors",
                  sidebarCollapsed && "justify-center px-2.5",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!sidebarCollapsed && <span>{item.label ?? t(item.labelKey)}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="flex items-center justify-center h-10 mx-2.5 mb-1 rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors"
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        {/* User section at bottom */}
        <div className="border-t border-neutral-100 p-2.5">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-neutral-50 transition-colors",
                sidebarCollapsed && "justify-center px-2",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white text-[10.5px] font-semibold shrink-0",
                  accentGradient,
                )}
              >
                {getInitials(displayName)}
              </div>
              {!sidebarCollapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-neutral-900 truncate">
                      {displayName}
                    </p>
                    <p className="text-[10px] text-neutral-400 truncate">
                      {displayEmail}
                    </p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                </>
              )}
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-1 z-40 w-56 rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg">
                  <div className="px-4 py-3 border-b border-neutral-100">
                    <p className="text-[13px] font-semibold text-neutral-900">{displayName}</p>
                    <p className="text-[11.5px] text-neutral-500 truncate">{displayEmail}</p>
                  </div>
                  <Link
                    href="/portal"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
                  >
                    <User className="h-4 w-4 text-neutral-400" />
                    {t("portal.layout.myProfile")}
                  </Link>
                  <div className="px-4 py-2 border-t border-neutral-100">
                    <p className="text-[10.5px] font-medium text-neutral-400 uppercase tracking-wider mb-1.5">{t("portal.layout.language")}</p>
                    <LanguageSelector />
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      signOut({ callbackUrl: "/portal/login" });
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-[13px] text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("portal.layout.signOut")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ================================================================ */}
      {/* MOBILE HEADER                                                    */}
      {/* ================================================================ */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-200",
          sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[260px]",
        )}
      >
        {/* Accent bar */}
        <div
          className={cn(
            "h-1 w-full",
            !brand?.primaryColor && "bg-gradient-to-r",
            !brand?.primaryColor && accentGradient,
          )}
          style={brand?.primaryColor ? { backgroundColor: brand.primaryColor } : undefined}
        />

        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 bg-white border-b border-neutral-200">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5 text-neutral-600" />
                ) : (
                  <Menu className="h-5 w-5 text-neutral-600" />
                )}
              </button>
              <Image
                src="/images/cetix-logo-email.png"
                alt="Cetix"
                width={100}
                height={30}
                className="h-6 w-auto"
              />
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white text-[10.5px] font-semibold",
                  accentGradient,
                )}
              >
                {getInitials(displayName)}
              </div>
            </div>
          </div>

          {/* Mobile nav panel */}
          {mobileMenuOpen && (
            <div className="border-t border-neutral-100 bg-white">
              <div className="px-4 py-3 space-y-1">
                {/* Org badge */}
                <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-neutral-100">
                  {orgLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={orgLogo} alt={orgName} className="h-8 w-8 rounded-lg object-contain ring-1 ring-slate-200" />
                  ) : (
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white text-[12px] font-bold", accentGradient)}>
                      {(orgName || "N").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-900">{orgName}</p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wider">{t("portal.layout.clientPortal")}</p>
                  </div>
                </div>

                {visibleNav.map((item) => {
                  const isActive =
                    item.href === "/portal"
                      ? pathname === "/portal"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-blue-50 text-blue-700"
                          : "text-neutral-600 hover:bg-neutral-50",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label ?? t(item.labelKey)}
                    </Link>
                  );
                })}
                <div className="border-t border-neutral-100 pt-2 mt-2">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white text-[10.5px] font-semibold", accentGradient)}>
                      {getInitials(displayName)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{displayName}</p>
                      <p className="text-xs text-neutral-500">{displayEmail}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      signOut({ callbackUrl: "/portal/login" });
                    }}
                    className="w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("portal.layout.signOut")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">{children}</div>
        </main>

        {/* Footer */}
        <footer className="border-t border-neutral-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4" />
        </footer>
      </div>
      </div>
    </div>
  );
}
