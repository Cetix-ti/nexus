"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Sparkles, Check, X, GitMerge, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/page-loader";
import { CATEGORY_LABELS, IMPACT_LABELS, STATUS_LABELS } from "./change-helpers";
import type { ChangeCategory, ChangeImpact, ChangeStatus } from "@prisma/client";

interface ChangeRow {
  id: string; title: string; summary: string | null;
  category: ChangeCategory; impact: ChangeImpact; status: ChangeStatus;
  changeDate: string; publishedAt: string | null; aiConfidence: number | null;
  manualEntry: boolean;
  linkedTicketIds: string[];
}

export function OrgChangesTab({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [items, setItems] = useState<ChangeRow[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/changes?orgId=${organizationId}`);
    if (r.ok) setItems(await r.json());
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  async function detect() {
    setDetecting(true); setDetectMsg(null);
    const r = await fetch(`/api/v1/changes/detect`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: organizationId, sinceDays: 14 }),
    });
    setDetecting(false);
    if (r.ok) {
      const d = await r.json();
      setDetectMsg(`${d.changesProposed} suggestion(s) générée(s) · ${d.signalsCreated} source(s) analysée(s)`);
      await load();
    } else {
      setDetectMsg("Erreur lors de l'analyse IA");
    }
  }

  if (!items) return <PageLoader />;

  const suggestions = items.filter((i) => i.status === "AI_SUGGESTED");
  const official = items.filter((i) => i.status !== "AI_SUGGESTED" && i.status !== "REJECTED" && i.status !== "ARCHIVED");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">Changements</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Fil chronologique des évolutions significatives de l'environnement de {organizationName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={detect} disabled={detecting} className="gap-1.5">
            <Sparkles className={`h-4 w-4 ${detecting ? "animate-pulse" : ""}`} />
            {detecting ? "Analyse IA…" : "Détecter changements"}
          </Button>
          <Link href={`/changes/new?orgId=${organizationId}`}>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Ajouter</Button>
          </Link>
        </div>
      </div>

      {detectMsg && (
        <div className="rounded-md bg-violet-50 border border-violet-200 text-violet-800 text-[12.5px] px-3 py-2">{detectMsg}</div>
      )}

      {/* Suggestions IA */}
      {suggestions.length > 0 && (
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-violet-50 flex items-center justify-center"><Sparkles className="h-4 w-4 text-violet-600" /></div>
              <div>
                <h3 className="text-[13.5px] font-semibold text-slate-900">Suggestions IA en attente ({suggestions.length})</h3>
                <p className="text-[11.5px] text-slate-500">Approuvez, rejetez ou fusionnez avant publication dans le fil officiel.</p>
              </div>
            </div>
            <div className="space-y-2">
              {suggestions.map((s) => <SuggestionCard key={s.id} change={s} onAction={load} />)}
            </div>
          </div>
        </Card>
      )}

      {/* Fil officiel */}
      <Card>
        <div className="p-4">
          <h3 className="text-[13.5px] font-semibold text-slate-900 mb-3">Fil officiel ({official.length})</h3>
          {official.length === 0 ? (
            <p className="text-[12.5px] text-slate-500">Aucun changement publié. Créez-en un manuellement ou approuvez une suggestion IA.</p>
          ) : (
            <ol className="space-y-4">
              {official.map((c) => <Timeline key={c.id} change={c} />)}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

function SuggestionCard({ change, onAction }: { change: ChangeRow; onAction: () => Promise<void> }) {
  const cat = CATEGORY_LABELS[change.category];
  const imp = IMPACT_LABELS[change.impact];
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    await fetch(`/api/v1/changes/${change.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    setBusy(false);
    await onAction();
  }
  async function reject() {
    setBusy(true);
    await fetch(`/api/v1/changes/${change.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reject: true }),
    });
    setBusy(false);
    await onAction();
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: cat.color }}><span>{cat.icon}</span>{cat.label}</span>
            <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${imp.color}`}>{imp.label}</span>
            {change.aiConfidence !== null && (
              <span className="text-[11px] text-violet-700">confiance {Math.round((change.aiConfidence ?? 0) * 100)}%</span>
            )}
          </div>
          <h4 className="mt-1 text-[13.5px] font-medium text-slate-900">{change.title}</h4>
          {change.summary && <p className="mt-0.5 text-[12px] text-slate-600">{change.summary}</p>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Link href={`/changes/${change.id}`}><Button size="sm" variant="outline" className="h-7 text-[11.5px] gap-1"><GitMerge className="h-3.5 w-3.5" /> Ouvrir</Button></Link>
        <Button size="sm" variant="outline" className="h-7 text-[11.5px] gap-1" onClick={reject} disabled={busy}><X className="h-3.5 w-3.5" /> Rejeter</Button>
        <Button size="sm" className="h-7 text-[11.5px] gap-1" onClick={approve} disabled={busy}><Check className="h-3.5 w-3.5" /> Approuver</Button>
      </div>
    </div>
  );
}

function Timeline({ change }: { change: ChangeRow }) {
  const cat = CATEGORY_LABELS[change.category];
  const imp = IMPACT_LABELS[change.impact];
  const st = STATUS_LABELS[change.status];
  return (
    <li className="flex gap-3">
      <div className="shrink-0 w-[110px] text-right">
        <div className="text-[11.5px] font-semibold text-slate-700">
          {new Date(change.changeDate).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" })}
        </div>
        {change.publishedAt && (
          <div className="text-[10px] text-slate-400">publié {new Date(change.publishedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</div>
        )}
      </div>
      <div className="relative shrink-0">
        <div className="h-2 w-2 rounded-full mt-1.5" style={{ backgroundColor: cat.color }} />
        <div className="absolute left-1/2 top-4 -translate-x-1/2 w-px h-full bg-slate-200" />
      </div>
      <Link href={`/changes/${change.id}`} className="flex-1 min-w-0 pb-3 -mt-0.5 hover:bg-slate-50/60 rounded px-2 py-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: cat.color }}><span>{cat.icon}</span>{cat.label}</span>
          <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${imp.color}`}>{imp.label}</span>
          <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${st.color}`}>{st.label}</span>
          {change.manualEntry && <span className="text-[10.5px] text-slate-500">manuel</span>}
        </div>
        <h4 className="mt-0.5 text-[13.5px] font-medium text-slate-900">{change.title}</h4>
        {change.summary && <p className="mt-0.5 text-[12px] text-slate-600">{change.summary}</p>}
      </Link>
    </li>
  );
}
