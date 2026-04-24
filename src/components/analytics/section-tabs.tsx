"use client";

// Barre d'onglets partagée pour les sections "Rapports" et "Données"
// d'Analytique. Chaque page garde sa propre route (URLs inchangées),
// mais l'onglet actif est déterminé par le pathname courant.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Wrench, Database } from "lucide-react";
import { cn } from "@/lib/utils";

const REPORTS_TABS = [
  { label: "Dashboards", href: "/analytics/dashboards", matchPrefix: ["/analytics/dashboards"], icon: LayoutDashboard },
  { label: "Rapports programmés", href: "/analytics/reports", matchPrefix: ["/analytics/reports", "/analytics/monthly-reports"], icon: FileText },
];

const DATA_TABS = [
  { label: "Widgets", href: "/analytics/widgets", matchPrefix: ["/analytics/widgets"], icon: Wrench },
  { label: "Sources & Variables", href: "/analytics/data", matchPrefix: ["/analytics/data", "/analytics/datasets", "/analytics/variables"], icon: Database },
];

export function AnalyticsSectionTabs({ section }: { section: "reports" | "data" }) {
  const pathname = usePathname() ?? "";
  const tabs = section === "reports" ? REPORTS_TABS : DATA_TABS;
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 -mx-1 px-1 overflow-x-auto">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = t.matchPrefix.some((p) => pathname === p || pathname.startsWith(p + "/"));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
              active
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
            )}
          >
            <Icon className="h-4 w-4" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
