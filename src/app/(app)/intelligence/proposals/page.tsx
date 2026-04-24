"use client";

// ============================================================================
// /intelligence/proposals — page consolidée "ce que l'IA propose aux humains".
// Onglets : Maintenance proposée, Articles KB à écrire, Playbooks.
// ============================================================================

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import MaintenancePage from "../maintenance/page";
import KbGapsPage from "../kb-gaps/page";
import PlaybooksPage from "../playbooks/page";

const TABS = [
  { key: "maintenance",  label: "Maintenance proposée",  component: MaintenancePage },
  { key: "kb-gaps",      label: "Articles KB à écrire",  component: KbGapsPage },
  { key: "playbooks",    label: "Playbooks",              component: PlaybooksPage },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ProposalsInner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const active = (params.get("tab") as TabKey) || "maintenance";
  const Current = (TABS.find((t) => t.key === active) ?? TABS[0]).component;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Propositions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Actions et contenus suggérés par l&apos;IA, en attente de validation humaine.
        </p>
      </div>

      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                onClick={() =>
                  router.replace(`${pathname}?tab=${t.key}`, { scroll: false })
                }
                className={cn(
                  "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  isActive
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      <Current />
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <Suspense fallback={null}>
      <ProposalsInner />
    </Suspense>
  );
}
