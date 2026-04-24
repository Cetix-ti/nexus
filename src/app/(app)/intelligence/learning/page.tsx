"use client";

// ============================================================================
// /intelligence/learning — page consolidée "ce que l'IA apprend".
// Regroupe les 5 anciennes sous-pages en onglets URL-bindés via ?tab=.
// Les anciennes routes (/intelligence/activity, /feedback, etc.) restent
// accessibles comme redirects vers ?tab=<key>.
// ============================================================================

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import ActivityPage from "../activity/page";
import FeedbackPage from "../feedback/page";
import SimilarLearningPage from "../similar-learning/page";
import CategoryLearningPage from "../category-learning/page";
import TaxonomyPage from "../taxonomy/page";

const TABS = [
  { key: "activity",  label: "Journal d'apprentissage",  component: ActivityPage },
  { key: "feedback",  label: "Feedback collectif",       component: FeedbackPage },
  { key: "similar",   label: "Tickets similaires",       component: SimilarLearningPage },
  { key: "category",  label: "Suggestions catégorie",    component: CategoryLearningPage },
  { key: "taxonomy",  label: "Taxonomie dédoublée",      component: TaxonomyPage },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function LearningInner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const active = (params.get("tab") as TabKey) || "activity";
  const Current = (TABS.find((t) => t.key === active) ?? TABS[0]).component;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Apprentissage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ce que l&apos;IA apprend à partir des tickets, des corrections et des catégorisations.
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
                  router.replace(
                    `${pathname}?tab=${t.key}`,
                    { scroll: false },
                  )
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

export default function LearningPage() {
  return (
    <Suspense fallback={null}>
      <LearningInner />
    </Suspense>
  );
}
