"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  Home,
  Ticket,
  PlusCircle,
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
} from "lucide-react";
import { usePortalUser } from "@/lib/portal/use-portal-user";
import { PortalImpersonationBanner } from "@/components/portal/impersonation-banner";
import { LanguageSelector } from "@/components/layout/language-selector";

interface NavItem {
  label: string;
  href: string;
  icon: any;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Accueil", href: "/portal", icon: Home },
  { label: "Billets", href: "/portal/tickets", icon: Ticket },
  { label: "Actifs", href: "/portal/assets", icon: Monitor },
  { label: "Projets", href: "/portal/projects", icon: FolderKanban, adminOnly: true },
  { label: "Rapports", href: "/portal/reports", icon: BarChart3, adminOnly: true },
  { label: "Finances", href: "/portal/finances", icon: DollarSign, adminOnly: true },
  { label: "Contacts", href: "/portal/contacts", icon: Users, adminOnly: true },
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
  const isAdmin = permissions.portalRole === "admin";
  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isLoginPage = pathname === "/portal/login";

  if (isLoginPage) {
    return <div className="min-h-screen bg-[#F9FAFB]">{children}</div>;
  }

  const displayName = user?.name || "Utilisateur";
  const displayEmail = user?.email || "";
  const orgName = organizationName || "Portail client";
  const accentGradient = "from-blue-500 to-blue-700";
  const orgInitial = (orgName || "N").charAt(0).toUpperCase();

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
    // Load the client org's own logo
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
          ? ({
              ["--portal-primary" as string]: brand.primaryColor,
            } as React.CSSProperties)
          : undefined
      }
    >
      <PortalImpersonationBanner />
      {/* Bandeau de branding (couleur principale du tenant si définie, sinon gradient legacy) */}
      <div
        className={cn(
          "h-1 w-full",
          !brand?.primaryColor && "bg-gradient-to-r",
          !brand?.primaryColor && accentGradient
        )}
        style={
          brand?.primaryColor
            ? { backgroundColor: brand.primaryColor }
            : undefined
        }
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            {/* Logo + Org */}
            <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
              <Link href="/portal" className="flex items-center gap-3">
                {orgLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={orgLogo}
                    alt={orgName}
                    className="h-10 w-10 rounded-xl object-contain bg-white ring-1 ring-slate-200 shadow-sm"
                  />
                ) : brand?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logo}
                    alt={brand.companyName || orgName}
                    className="h-10 w-10 rounded-xl object-contain bg-white ring-1 ring-slate-200 shadow-sm"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm",
                      accentGradient
                    )}
                    style={
                      brand?.primaryColor
                        ? { background: brand.primaryColor }
                        : undefined
                    }
                  >
                    <span className="text-[14px] font-bold text-white">
                      {orgInitial}
                    </span>
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-[15px] font-semibold text-neutral-900 leading-tight">
                    {brand?.companyName || orgName}
                  </span>
                  <span className="text-[10.5px] text-neutral-400 leading-tight mt-0.5 uppercase tracking-wider font-medium">
                    Portail client
                  </span>
                </div>
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1">
                {visibleNav.map((item) => {
                  const isActive =
                    item.href === "/portal"
                      ? pathname === "/portal"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
                        isActive
                          ? "bg-blue-50 text-[#2563EB]"
                          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-neutral-50 transition-colors"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white text-[10.5px] font-semibold shadow-sm",
                      accentGradient
                    )}
                  >
                    {getInitials(displayName)}
                  </div>
                  <span className="font-medium text-neutral-700 text-[13px]">
                    {displayName}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg">
                      <div className="px-4 py-3 border-b border-neutral-100">
                        <p className="text-[13px] font-semibold text-neutral-900">
                          {displayName}
                        </p>
                        <p className="text-[11.5px] text-neutral-500 truncate">
                          {displayEmail}
                        </p>
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200/60">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {orgName}
                        </div>
                      </div>
                      <Link
                        href="/portal"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
                      >
                        <User className="h-4 w-4 text-neutral-400" />
                        Mon profil
                      </Link>
                      <div className="px-4 py-2 border-t border-neutral-100">
                        <p className="text-[10.5px] font-medium text-neutral-400 uppercase tracking-wider mb-1.5">Langue</p>
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
                        Se déconnecter
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5 text-neutral-600" />
                ) : (
                  <Menu className="h-5 w-5 text-neutral-600" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-neutral-100 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-3 space-y-1">
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
                        ? "bg-blue-50 text-[#2563EB]"
                        : "text-neutral-600 hover:bg-neutral-50"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="border-t border-neutral-100 pt-2 mt-2">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-white text-[10.5px] font-semibold",
                      accentGradient
                    )}
                  >
                    {getInitials(displayName)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {displayName}
                    </p>
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
                  Se déconnecter
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
  );
}
