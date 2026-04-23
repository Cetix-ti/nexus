"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GitCommit, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CATEGORY_LABELS, IMPACT_LABELS } from "./change-helpers";
import type { ChangeCategory, ChangeImpact, ChangeStatus } from "@prisma/client";

interface Row {
  id: string; title: string; summary: string | null;
  category: ChangeCategory; impact: ChangeImpact; status: ChangeStatus;
  changeDate: string; aiConfidence: number | null;
}

/** Cartouche compact pour l'onglet Aperçu organisation. */
export function ChangesOverviewWidget({ organizationId }: { organizationId: string }) {
  const [items, setItems] = useState<Row[] | null>(null);
  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/v1/changes?orgId=${organizationId}&excludeSuggested=true`);
      if (r.ok) setItems(await r.json());
    })();
  }, [organizationId]);
  const [suggestions, setSuggestions] = useState<number>(0);
  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/v1/changes?orgId=${organizationId}&status=AI_SUGGESTED`);
      if (r.ok) { const d = await r.json(); setSuggestions(d.length); }
    })();
  }, [organizationId]);

  if (items === null) return null;
  const recent = items.slice(0, 5);
  const majorCount = items.filter((i) => i.impact === "MAJOR" || i.impact === "STRUCTURAL").length;

  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-blue-50 flex items-center justify-center"><GitCommit className="h-4 w-4 text-blue-600" /></div>
            <h3 className="text-[13.5px] font-semibold text-slate-900">Changements récents</h3>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {majorCount > 0 && <span className="text-amber-700">{majorCount} majeur{majorCount > 1 ? "s" : ""}</span>}
            {suggestions > 0 && (
              <span className="inline-flex items-center gap-1 text-violet-700">
                <Sparkles className="h-3 w-3" /> {suggestions} suggestion{suggestions > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        {recent.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">Aucun changement enregistré.</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((r) => {
              const cat = CATEGORY_LABELS[r.category];
              const imp = IMPACT_LABELS[r.impact];
              return (
                <Link key={r.id} href={`/changes/${r.id}`} className="block rounded-md px-2 py-1.5 hover:bg-slate-50/60">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: cat.color }}>{cat.icon} {cat.label}</span>
                    <span className={`text-[10px] rounded px-1.5 py-0.5 ring-1 ring-inset ${imp.color}`}>{imp.label}</span>
                    <span className="text-[10.5px] text-slate-400">{new Date(r.changeDate).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</span>
                  </div>
                  <div className="text-[12.5px] font-medium text-slate-900 truncate">{r.title}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
