"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, Check, X, MinusCircle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CheckResult {
  id: string; title: string; description: string; category: string;
  weight: number; passed: boolean; applicable: boolean;
  detail?: string;
  suggestion?: { label: string; url: string };
}
interface Report {
  score: number; passedCount: number; applicableCount: number; totalCount: number;
  checks: CheckResult[];
}

const CATEGORY_LABELS: Record<string, string> = {
  environnement: "Environnement",
  documentation: "Documentation",
  gouvernance: "Gouvernance",
  exploitation: "Exploitation",
};

export function OrgMaturitySection({ organizationId }: { organizationId: string }) {
  const [r, setR] = useState<Report | null>(null);

  useEffect(() => {
    void fetch(`/api/v1/organizations/${organizationId}/maturity`).then(async (res) => {
      if (res.ok) setR(await res.json());
    });
  }, [organizationId]);

  if (!r) return null;

  const scoreColor = r.score >= 80 ? "text-emerald-600" : r.score >= 50 ? "text-amber-600" : "text-red-600";
  const scoreRingColor = r.score >= 80 ? "stroke-emerald-500" : r.score >= 50 ? "stroke-amber-500" : "stroke-red-500";

  const failed = r.checks.filter((c) => c.applicable && !c.passed);
  const byCat = new Map<string, CheckResult[]>();
  for (const c of r.checks) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category)!.push(c);
  }

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Baseline de maturité</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {r.passedCount} sur {r.applicableCount} critère{r.applicableCount > 1 ? "s" : ""} applicable{r.applicableCount > 1 ? "s" : ""} passé{r.passedCount > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
              <circle cx="36" cy="36" r="28" strokeWidth="6" className="stroke-slate-100" fill="none" />
              <circle
                cx="36" cy="36" r="28" strokeWidth="6" fill="none"
                strokeLinecap="round"
                className={scoreRingColor}
                strokeDasharray={`${(r.score / 100) * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
              />
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center text-[18px] font-bold ${scoreColor}`}>
              {r.score}%
            </div>
          </div>
        </div>

        {failed.length > 0 && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-[12px] font-semibold text-amber-900 mb-2">Points à compléter</p>
            <ul className="space-y-1.5">
              {failed.slice(0, 3).map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-slate-900">{c.title}</div>
                    {c.detail && <div className="text-[11.5px] text-slate-600">{c.detail}</div>}
                  </div>
                  {c.suggestion && (
                    <Link href={c.suggestion.url} className="shrink-0 text-[11.5px] text-blue-600 hover:text-blue-700 inline-flex items-center">
                      {c.suggestion.label} <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {failed.length > 3 && <p className="mt-2 text-[11px] text-amber-700">+{failed.length - 3} autres</p>}
          </div>
        )}

        <details className="group">
          <summary className="cursor-pointer text-[12px] text-slate-600 hover:text-slate-900 select-none">
            Voir tous les critères ({r.totalCount})
          </summary>
          <div className="mt-3 space-y-4">
            {Array.from(byCat.entries()).map(([cat, checks]) => (
              <div key={cat}>
                <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{CATEGORY_LABELS[cat] ?? cat}</h4>
                <ul className="space-y-1">
                  {checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
                      {!c.applicable ? <MinusCircle className="h-3.5 w-3.5 text-slate-300 mt-0.5 shrink-0" />
                        : c.passed ? <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        : <X className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className={`${c.applicable ? "text-slate-900" : "text-slate-400"}`}>{c.title}</div>
                        {c.detail && <div className="text-[11px] text-slate-500">{c.detail}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </div>
    </Card>
  );
}
