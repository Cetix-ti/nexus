"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Calendar, TrendingUp, AlertCircle, Check, Clock, Archive, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BudgetRow {
  id: string;
  fiscalYear: number;
  title: string;
  summary: string | null;
  status: "DRAFT" | "PROPOSED" | "APPROVED" | "EXECUTING" | "CLOSED" | "REJECTED";
  currency: string;
  targetAmount: number | string | null;
  contingencyPct: number;
  createdAt: string;
  updatedAt: string;
  _count?: { lines: number; comments: number };
}

const STATUS_META: Record<BudgetRow["status"], { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: { label: "Brouillon", color: "bg-slate-100 text-slate-700 ring-slate-200", icon: Clock },
  PROPOSED: { label: "Proposé", color: "bg-amber-50 text-amber-700 ring-amber-200", icon: AlertCircle },
  APPROVED: { label: "Approuvé", color: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: Check },
  EXECUTING: { label: "En exécution", color: "bg-blue-50 text-blue-700 ring-blue-200", icon: TrendingUp },
  CLOSED: { label: "Fermé", color: "bg-slate-50 text-slate-600 ring-slate-200", icon: Archive },
  REJECTED: { label: "Rejeté", color: "bg-red-50 text-red-700 ring-red-200", icon: XCircle },
};

function fmtCurrency(n: number | string | null | undefined, currency = "CAD"): string {
  if (n == null) return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v.toFixed(0)} ${currency}`;
  }
}

export function OrgBudgetTab({ organizationId }: { organizationId: string; organizationName: string }) {
  const [budgets, setBudgets] = useState<BudgetRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newYear, setNewYear] = useState<number>(new Date().getUTCFullYear());
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/v1/budgets?orgId=${organizationId}`);
    if (r.ok) setBudgets(await r.json());
    else setBudgets([]);
  }

  useEffect(() => {
    setBudgets(null);
    void load();
  }, [organizationId]);

  async function createBudget() {
    setError(null);
    const r = await fetch(`/api/v1/budgets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId, fiscalYear: newYear }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setError(body?.error || `Erreur (HTTP ${r.status})`);
      return;
    }
    setCreating(false);
    await load();
  }

  if (budgets === null) {
    return <div className="p-6 text-sm text-slate-500">Chargement…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Budgets TI</h2>
          <p className="text-[12.5px] text-slate-500">
            Budget annuel construit par Cetix, approuvé par le client, suivi prévu vs réel en continu.
          </p>
        </div>
        {!creating ? (
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> Nouveau budget
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">Année&nbsp;fiscale</label>
            <input
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(parseInt(e.target.value) || newYear)}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
              min={2020} max={2040}
            />
            <Button size="sm" onClick={createBudget}>Créer</Button>
            <Button size="sm" variant="outline" onClick={() => { setCreating(false); setError(null); }}>
              Annuler
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Card><div className="p-3 text-[13px] text-red-700 bg-red-50 border border-red-100 rounded">{error}</div></Card>
      )}

      {budgets.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <Calendar className="h-10 w-10 mx-auto text-slate-300 mb-2" />
            <div className="text-sm text-slate-600 mb-1">Aucun budget pour ce client.</div>
            <div className="text-[12px] text-slate-500">
              Créez un budget annuel puis utilisez l&apos;ingestion automatique pour importer les renouvellements connus.
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {budgets.map((b) => {
            const meta = STATUS_META[b.status];
            const Icon = meta.icon;
            return (
              <Link key={b.id} href={`/budgets/${b.id}`} className="block">
                <Card className="hover:border-blue-300 transition-colors">
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500">FY {b.fiscalYear}</div>
                      <span className={`inline-flex items-center gap-1 text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </div>
                    <div className="text-[14px] font-semibold text-slate-900">{b.title}</div>
                    {b.targetAmount != null && (
                      <div className="text-[12.5px] text-slate-600">
                        Cible : <span className="font-medium text-slate-900">{fmtCurrency(b.targetAmount, b.currency)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span>{b._count?.lines ?? 0} ligne{(b._count?.lines ?? 0) > 1 ? "s" : ""}</span>
                      {(b._count?.comments ?? 0) > 0 && <span>{b._count?.comments} commentaires</span>}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
