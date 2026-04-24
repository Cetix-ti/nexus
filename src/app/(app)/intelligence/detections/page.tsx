"use client";

// ============================================================================
// /intelligence/detections — page consolidée "ce que l'IA détecte".
// Onglets : Anomalies requester, Patterns récurrents, Chaînes sécurité.
// ============================================================================

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import RecurringPage from "../recurring/page";
import SecurityChainsPage from "../security-chains/page";

const TABS = [
  { key: "recurring",  label: "Patterns récurrents",   component: RecurringPage },
  { key: "security",   label: "Chaînes sécurité",      component: SecurityChainsPage },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function DetectionsInner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const active = (params.get("tab") as TabKey) || "recurring";
  const Current = (TABS.find((t) => t.key === active) ?? TABS[0]).component;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Détections</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signaux repérés automatiquement : volumétrie, récurrences, enchaînements sécurité.
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

export default function DetectionsPage() {
  return (
    <Suspense fallback={null}>
      <DetectionsInner />
    </Suspense>
  );
}
