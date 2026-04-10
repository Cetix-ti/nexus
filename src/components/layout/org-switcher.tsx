"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, ChevronDown, Check, Search, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: "Standard" | "Premium" | "Enterprise";
  isMSP?: boolean;
  ticketCount: number;
  color: string;
}

const ORGANIZATIONS: Organization[] = [
  {
    id: "org_cetix",
    name: "Cetix",
    slug: "cetix",
    plan: "Enterprise",
    isMSP: true,
    ticketCount: 0,
    color: "from-blue-500 to-blue-700",
  },
  {
    id: "org_acme",
    name: "Acme Corp",
    slug: "acme",
    plan: "Premium",
    ticketCount: 142,
    color: "from-violet-500 to-violet-700",
  },
  {
    id: "org_techstart",
    name: "TechStart Inc",
    slug: "techstart",
    plan: "Standard",
    ticketCount: 87,
    color: "from-emerald-500 to-emerald-700",
  },
  {
    id: "org_global",
    name: "Global Finance",
    slug: "global-finance",
    plan: "Enterprise",
    ticketCount: 198,
    color: "from-amber-500 to-amber-700",
  },
  {
    id: "org_health",
    name: "HealthCare Plus",
    slug: "healthcare-plus",
    plan: "Premium",
    ticketCount: 64,
    color: "from-rose-500 to-rose-700",
  },
  {
    id: "org_media",
    name: "MédiaCentre QC",
    slug: "mediacentre-qc",
    plan: "Standard",
    ticketCount: 32,
    color: "from-cyan-500 to-cyan-700",
  },
];

const PLAN_COLORS = {
  Enterprise: "bg-violet-50 text-violet-700 ring-violet-200/80",
  Premium: "bg-blue-50 text-blue-700 ring-blue-200/80",
  Standard: "bg-slate-50 text-slate-700 ring-slate-200/80",
};

export function OrgSwitcher() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Organization>(ORGANIZATIONS[0]);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = ORGANIZATIONS.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  function selectOrg(org: Organization) {
    setSelected(org);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2.5 h-10 pl-2 pr-3 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        title="Changer d'organisation"
      >
        <div
          className={cn(
            "w-7 h-7 rounded-md bg-gradient-to-br flex items-center justify-center shadow-sm text-white text-[10px] font-bold",
            selected.color
          )}
        >
          {selected.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)}
        </div>
        <span className="text-[13px] font-medium text-slate-700 hidden lg:inline max-w-[140px] truncate">
          {selected.name}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
          strokeWidth={2.25}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-10px_rgba(15,23,42,0.2)] overflow-hidden">
          {/* Header */}
          <div className="px-3 py-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une organisation..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                autoFocus
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[12px] text-slate-400">
                  Aucune organisation trouvée
                </p>
              </div>
            ) : (
              filtered.map((org) => {
                const isActive = selected.id === org.id;
                return (
                  <button
                    key={org.id}
                    onClick={() => selectOrg(org)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left",
                      isActive && "bg-blue-50/40"
                    )}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm text-white text-[11px] font-bold shrink-0",
                        org.color
                      )}
                    >
                      {org.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-slate-900 truncate">
                          {org.name}
                        </span>
                        {org.isMSP && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600">
                            MSP
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-px text-[9.5px] font-semibold ring-1 ring-inset",
                            PLAN_COLORS[org.plan]
                          )}
                        >
                          {org.plan}
                        </span>
                        {!org.isMSP && (
                          <span className="text-[10.5px] text-slate-400 tabular-nums">
                            {org.ticketCount} tickets
                          </span>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <Check className="h-4 w-4 text-blue-600 shrink-0" strokeWidth={2.5} />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 p-1.5 bg-slate-50/40">
            <Link
              href="/organizations"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-white hover:text-slate-900 transition-colors"
            >
              <Building2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              Voir toutes les organisations
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[12.5px] font-medium text-slate-700 hover:bg-white hover:text-slate-900 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={2.25} />
              Paramètres de l&apos;organisation
            </Link>
            <button
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[12.5px] font-medium text-blue-600 hover:bg-white hover:text-blue-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Ajouter une organisation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
