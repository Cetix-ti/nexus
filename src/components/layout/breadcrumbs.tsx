"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Home } from "lucide-react";

const labelMap: Record<string, string> = {
  dashboard: "Tableau de bord",
  tickets: "Tickets",
  kanban: "Kanban",
  new: "Nouveau",
  organizations: "Organisations",
  contacts: "Contacts",
  assets: "Actifs",
  knowledge: "Base de connaissances",
  reports: "Rapports",
  automations: "Automatisations",
  settings: "Paramètres",
  portal: "Portail",
  projects: "Projets",
  scheduling: "Planificateur",
  billing: "Facturation",
};

// cuid pattern (Prisma default IDs)
function isCuid(s: string): boolean {
  return /^c[a-z0-9]{24,}$/i.test(s);
}

// Cache resolved labels for the current navigation
const labelCache = new Map<string, string>();

async function resolveLabel(parent: string, id: string): Promise<string | null> {
  const cacheKey = `${parent}/${id}`;
  if (labelCache.has(cacheKey)) return labelCache.get(cacheKey)!;

  let url = "";
  let extract: (data: any) => string | null = () => null;

  switch (parent) {
    case "organizations":
      url = `/api/v1/organizations/${id}`;
      extract = (d) => d?.name || null;
      break;
    case "tickets":
      url = `/api/v1/tickets/${id}`;
      extract = (d) => d?.subject || d?.number || null;
      break;
    case "projects":
      url = `/api/v1/projects/${id}`;
      extract = (d) => d?.name || null;
      break;
    default:
      return null;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const label = extract(data);
    if (label) {
      labelCache.set(cacheKey, label);
      return label;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const updates: Record<string, string> = {};
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!isCuid(seg)) continue;
        const parent = segments[i - 1];
        if (!parent) continue;
        const label = await resolveLabel(parent, seg);
        if (label) updates[seg] = label;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setDynamicLabels((prev) => ({ ...prev, ...updates }));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    let label = labelMap[segment];
    if (!label && isCuid(segment)) {
      label = dynamicLabels[segment] || "…";
    }
    if (!label) label = decodeURIComponent(segment);
    const isLast = index === segments.length - 1;
    return { href, label, isLast, segment };
  });

  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      <Link
        href="/dashboard"
        className="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <Home className="w-4 h-4" />
      </Link>

      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          {crumb.isLast ? (
            <span className="font-medium text-slate-700">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
