"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";

interface Row {
  organizationId: string; organizationName: string;
  score: number; passedCount: number; applicableCount: number;
}

function scoreClass(s: number) {
  if (s >= 80) return "bg-emerald-500";
  if (s >= 50) return "bg-amber-500";
  return "bg-red-500";
}
function scoreTextClass(s: number) {
  if (s >= 80) return "text-emerald-700";
  if (s >= 50) return "text-amber-700";
  return "text-red-700";
}

export default function BaselinePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"score-asc" | "score-desc" | "name">("score-asc");

  useEffect(() => {
    void fetch("/api/v1/maturity/summary").then(async (r) => {
      if (r.ok) setRows(await r.json());
    });
  }, []);

  if (rows === null) return <PageLoader />;

  const filtered = rows.filter((r) => !q.trim() || r.organizationName.toLowerCase().includes(q.toLowerCase()));
  filtered.sort((a, b) => {
    if (sort === "name") return a.organizationName.localeCompare(b.organizationName);
    if (sort === "score-desc") return b.score - a.score;
    return a.score - b.score;
  });

  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
  const low = rows.filter((r) => r.score < 50).length;
  const high = rows.filter((r) => r.score >= 80).length;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Baseline de maturité</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Couverture des standards MSP par client — {rows.length} organisations évaluées.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><div className="p-4"><p className="text-[11.5px] text-slate-500">Score moyen</p><p className={`mt-1 text-[22px] font-bold ${scoreTextClass(avg)}`}>{avg}%</p></div></Card>
        <Card><div className="p-4"><p className="text-[11.5px] text-slate-500">Clients matures (≥80%)</p><p className="mt-1 text-[22px] font-bold text-emerald-700">{high}</p></div></Card>
        <Card><div className="p-4"><p className="text-[11.5px] text-slate-500">Clients à risque (&lt;50%)</p><p className="mt-1 text-[22px] font-bold text-red-700">{low}</p></div></Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer un client…" className="max-w-xs" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          <option value="score-asc">Score croissant (à prioriser en haut)</option>
          <option value="score-desc">Score décroissant</option>
          <option value="name">Nom alphabétique</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucun client.</div></Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <Link key={r.organizationId} href={`/organisations/${r.organizationId}`} className="block px-4 py-3 hover:bg-slate-50/60">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium text-slate-900 truncate">{r.organizationName}</div>
                      <div className="text-[11.5px] text-slate-500">{r.passedCount} / {r.applicableCount} critères passés</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 w-64">
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={`${scoreClass(r.score)} h-full rounded-full transition-all`} style={{ width: `${r.score}%` }} />
                    </div>
                    <div className={`w-12 text-right text-[13.5px] font-bold ${scoreTextClass(r.score)}`}>{r.score}%</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
