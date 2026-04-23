"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GitCommit, Search, Plus, Sparkles, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";
import { CATEGORY_LABELS, IMPACT_LABELS, STATUS_LABELS } from "@/components/changes/change-helpers";
import type { ChangeCategory, ChangeImpact, ChangeStatus } from "@prisma/client";

interface Row {
  id: string;
  title: string; summary: string | null;
  category: ChangeCategory; impact: ChangeImpact; status: ChangeStatus;
  changeDate: string; aiConfidence: number | null; manualEntry: boolean;
  organization: { id: string; name: string; slug: string };
}

function Content() {
  const search = useSearchParams();
  const orgFilter = search.get("orgId");
  const [items, setItems] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ChangeCategory | "">("");
  const [impact, setImpact] = useState<ChangeImpact | "">("");
  const [status, setStatus] = useState<ChangeStatus | "">("");

  async function load() {
    const p = new URLSearchParams();
    if (orgFilter) p.set("orgId", orgFilter);
    if (category) p.set("category", category);
    if (impact) p.set("impact", impact);
    if (status) p.set("status", status);
    const r = await fetch(`/api/v1/changes?${p.toString()}`);
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [category, impact, status]);

  const filtered = (items ?? []).filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return r.title.toLowerCase().includes(s) || (r.summary ?? "").toLowerCase().includes(s) || r.organization.name.toLowerCase().includes(s);
  });
  const aiCount = (items ?? []).filter((r) => r.status === "AI_SUGGESTED").length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><GitCommit className="h-5 w-5 text-blue-600" /></div>
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900">Changements</h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Fil transversal — évolutions significatives de l'environnement des clients.</p>
          </div>
        </div>
        <Link href="/changes/new"><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nouveau</Button></Link>
      </div>

      {aiCount > 0 && (
        <div className="rounded-lg bg-violet-50 border border-violet-200 px-3.5 py-2.5 flex items-center gap-2 text-[12.5px] text-violet-900">
          <Sparkles className="h-4 w-4" />
          {aiCount} suggestion{aiCount > 1 ? "s" : ""} IA en attente de validation.
          <button onClick={() => setStatus("AI_SUGGESTED")} className="ml-auto underline">Voir</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="pl-8" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value as ChangeCategory | "")} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          <option value="">Toutes catégories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={impact} onChange={(e) => setImpact(e.target.value as ChangeImpact | "")} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          <option value="">Tout impact</option>
          {Object.entries(IMPACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as ChangeStatus | "")} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {items === null ? <PageLoader />
      : filtered.length === 0 ? <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucun changement.</div></Card>
      : (
        <Card>
          <div className="divide-y divide-slate-100">
            {filtered.map((r) => {
              const cat = CATEGORY_LABELS[r.category];
              const imp = IMPACT_LABELS[r.impact];
              const st = STATUS_LABELS[r.status];
              return (
                <Link key={r.id} href={`/changes/${r.id}`} className="block px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: cat.color }}><span>{cat.icon}</span>{cat.label}</span>
                        <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${imp.color}`}>{imp.label}</span>
                        <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${st.color}`}>{st.label}</span>
                        <h3 className="text-[13.5px] font-medium text-slate-900 truncate">{r.title}</h3>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500">
                        <Building2 className="h-3 w-3" /> {r.organization.name}
                        {r.aiConfidence !== null && <span className="text-violet-700">conf. {Math.round((r.aiConfidence ?? 0) * 100)}%</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-400">{new Date(r.changeDate).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function ChangesListPage() {
  return <Suspense fallback={<PageLoader />}><Content /></Suspense>;
}
