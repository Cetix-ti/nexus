"use client";

import { useEffect, useState } from "react";
import { Wallet, TrendingUp, Calendar, Info } from "lucide-react";
import { Card } from "@/components/ui/card";

type Category =
  | "SUBSCRIPTIONS" | "LICENSES" | "HARDWARE" | "OBSOLESCENCE"
  | "WARRANTIES" | "SUPPORT" | "EXTERNAL_SERVICES" | "PROJECTS"
  | "TRAINING" | "TELECOM" | "CONTINGENCY" | "OTHER";

interface BudgetLine {
  id: string;
  label: string;
  category: Category;
  vendor: string | null;
  plannedAmount: string | number;
  committedAmount: string | number | null;
  actualAmount: string | number | null;
  currency: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
}

interface BudgetResponse {
  budget?: {
    id: string;
    fiscalYear: number;
    title: string;
    summary: string | null;
    status: "APPROVED" | "EXECUTING" | "CLOSED";
    currency: string;
    targetAmount: string | number | null;
    contingencyPct: number;
    lines: BudgetLine[];
    approvedAt: string | null;
  };
  summary?: {
    totalPlanned: number;
    totalCommitted: number;
    totalActual: number;
    byCategory: Record<string, { planned: number; committed: number; actual: number; count: number }>;
    amountsVisible: boolean;
  };
  upcoming?: Array<{ id: string; label: string; category: Category; dueDate: string; amount: number | null; currency: string }>;
  fiscalYear?: number;
  status?: "UNAVAILABLE";
  message?: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  SUBSCRIPTIONS: "Abonnements",
  LICENSES: "Licences",
  HARDWARE: "Matériel",
  OBSOLESCENCE: "Désuétude",
  WARRANTIES: "Garanties",
  SUPPORT: "Contrats de support",
  EXTERNAL_SERVICES: "Services externes",
  PROJECTS: "Projets",
  TRAINING: "Formations",
  TELECOM: "Télécom",
  CONTINGENCY: "Contingence",
  OTHER: "Autre",
};

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}
function fmt(v: number | null | undefined, currency = "CAD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  try { return new Intl.NumberFormat("fr-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${Math.round(v)} ${currency}`; }
}

export default function PortalBudgetPage() {
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/portal/budget")
      .then(async (r) => {
        if (r.status === 403) {
          setError("Accès refusé. Le budget n'est pas activé pour votre compte.");
          return;
        }
        if (!r.ok) { setError(`Erreur HTTP ${r.status}`); return; }
        setData(await r.json());
      })
      .catch(() => setError("Erreur réseau"));
  }, []);

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <Card><div className="p-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded">{error}</div></Card>
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-slate-500">Chargement…</div>;

  if (data.status === "UNAVAILABLE" || !data.budget) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <Card>
          <div className="p-6 text-center">
            <Wallet className="h-10 w-10 mx-auto text-slate-300 mb-2" />
            <h1 className="text-base font-semibold text-slate-900">Budget IT {data.fiscalYear}</h1>
            <p className="text-sm text-slate-600 mt-1">{data.message}</p>
            <p className="text-[12px] text-slate-500 mt-3">
              Le budget est visible ici dès qu&apos;il a été approuvé. Contactez Cetix pour un statut.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const b = data.budget;
  const s = data.summary!;
  const upcoming = data.upcoming ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-blue-600" /> {b.title}
        </h1>
        <p className="text-[12.5px] text-slate-500 mt-1">
          Année fiscale {b.fiscalYear} ·{" "}
          {b.status === "APPROVED" ? "Approuvé" : b.status === "EXECUTING" ? "En exécution" : "Fermé"}
          {b.approvedAt && ` · signé le ${new Date(b.approvedAt).toLocaleDateString("fr-CA")}`}
        </p>
        {b.summary && <p className="text-[13px] text-slate-700 mt-2">{b.summary}</p>}
      </div>

      {!s.amountsVisible && (
        <Card>
          <div className="p-3 text-[12.5px] text-slate-600 bg-amber-50 border-l-4 border-amber-300 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <span>Les montants détaillés ne vous sont pas accessibles. Seuls les libellés et catégories sont affichés.</span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Prévu" value={s.amountsVisible ? fmt(s.totalPlanned, b.currency) : "—"} />
        <KPI label="Engagé" value={s.amountsVisible ? fmt(s.totalCommitted, b.currency) : "—"} tone="amber" />
        <KPI label="Réalisé" value={s.amountsVisible ? fmt(s.totalActual, b.currency) : "—"} tone="emerald" />
        <KPI label="Cible" value={s.amountsVisible && b.targetAmount != null ? fmt(num(b.targetAmount), b.currency) : "—"} tone="slate" />
      </div>

      <Card>
        <div className="p-4 space-y-3">
          <h2 className="text-[14px] font-semibold text-slate-900">Répartition par catégorie</h2>
          <div className="space-y-1.5">
            {Object.entries(s.byCategory)
              .sort((a, b) => b[1].planned - a[1].planned)
              .map(([k, v]) => {
                const pct = s.totalPlanned > 0 ? Math.round((v.planned / s.totalPlanned) * 100) : 0;
                return (
                  <div key={k} className="flex items-center gap-3 text-[13px]">
                    <div className="w-40 shrink-0 text-slate-700">{CATEGORY_LABELS[k as Category] ?? k}</div>
                    <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-24 text-right text-slate-900 font-medium">
                      {s.amountsVisible ? fmt(v.planned, b.currency) : `${v.count} items`}
                    </div>
                    <div className="w-10 text-right text-[11px] text-slate-500">{pct}%</div>
                  </div>
                );
              })}
          </div>
        </div>
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <div className="p-4 space-y-2">
            <h2 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600" /> Prochaines échéances (90 jours)
            </h2>
            <div className="space-y-1.5">
              {upcoming.map((u) => (
                <div key={u.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0 text-[13px]">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{u.label}</div>
                    <div className="text-[11.5px] text-slate-500">{CATEGORY_LABELS[u.category] ?? u.category}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-slate-900">{new Date(u.dueDate).toLocaleDateString("fr-CA")}</div>
                    {u.amount != null && <div className="text-[11.5px] text-slate-600">{fmt(u.amount, u.currency)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 space-y-2">
          <h2 className="text-[14px] font-semibold text-slate-900">Détail des lignes</h2>
          <div className="divide-y divide-slate-100">
            {b.lines.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-3 py-2 text-[13px]">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{l.label}</div>
                  <div className="text-[11.5px] text-slate-500">
                    {CATEGORY_LABELS[l.category] ?? l.category}
                    {l.vendor && ` · ${l.vendor}`}
                    {l.dueDate && ` · échéance ${new Date(l.dueDate).toLocaleDateString("fr-CA")}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {s.amountsVisible ? (
                    <>
                      <div className="font-medium text-slate-900">{fmt(num(l.plannedAmount), l.currency)}</div>
                      {num(l.actualAmount) > 0 && (
                        <div className="text-[11px] text-emerald-700">Réalisé : {fmt(num(l.actualAmount), l.currency)}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-[11px] text-slate-400">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" | "slate" }) {
  const cls = tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : tone === "slate" ? "text-slate-600" : "text-slate-900";
  return (
    <Card>
      <div className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`text-base sm:text-lg font-semibold ${cls}`}>{value}</div>
      </div>
    </Card>
  );
}
