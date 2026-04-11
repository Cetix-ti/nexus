"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Clock,
  FileText,
  Loader2,
  Receipt,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface FinanceData {
  summary: {
    totalBilled: number;
    totalHours: number;
    pendingAmount: number;
    invoicedAmount: number;
  };
  recentEntries: {
    id: string;
    date: string;
    duration: number;
    description: string;
    amount: number | null;
    coverageStatus: string;
    isOnsite: boolean;
    approvalStatus: string;
  }[];
  contracts: {
    id: string;
    name: string;
    type: string;
    monthlyValue: number | null;
    startDate: string | null;
    endDate: string | null;
  }[];
}

const COVERAGE_LABELS: Record<string, string> = {
  billable: "Facturable",
  included_in_contract: "Inclus contrat",
  hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement",
  non_billable: "Non facturable",
  pending: "En attente",
};

function fmtMoney(v: number): string {
  return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`) : `${m}min`;
}

export default function PortalFinancesPage() {
  const { organizationName, permissions } = usePortalUser();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/portal/finances")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">Finances</h1>
        <Card><CardContent className="py-12 text-center text-[13px] text-slate-400">
          Aucune donnée financière disponible.
        </CardContent></Card>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Finances</h1>
        <p className="text-[13px] text-slate-500 mt-0.5">Relevé financier — {organizationName}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total facturé" value={fmtMoney(s.totalBilled)} icon={<DollarSign className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-50" />
        <StatCard label="Heures totales" value={`${s.totalHours}h`} icon={<Clock className="h-5 w-5 text-blue-600" />} bg="bg-blue-50" />
        <StatCard label="En attente" value={fmtMoney(s.pendingAmount)} icon={<AlertCircle className="h-5 w-5 text-amber-600" />} bg="bg-amber-50" />
        <StatCard label="Déjà facturé" value={fmtMoney(s.invoicedAmount)} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} bg="bg-emerald-50" />
      </div>

      {/* Contracts */}
      {data.contracts.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              Vos contrats
            </h3>
            <div className="space-y-3">
              {data.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-slate-900">{c.name}</p>
                    <p className="text-[11px] text-slate-500">{c.type} · {c.endDate ? `Expire le ${new Date(c.endDate).toLocaleDateString("fr-CA")}` : "Sans échéance"}</p>
                  </div>
                  {c.monthlyValue && (
                    <p className="text-[14px] font-bold text-slate-800 tabular-nums">{fmtMoney(c.monthlyValue)}/mois</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent entries */}
      {data.recentEntries.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-500" />
              Interventions récentes
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Description</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Durée</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Couverture</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString("fr-CA")}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-slate-700 truncate max-w-[300px]">
                      {e.description || "—"}
                    </td>
                    <td className="px-4 py-3 text-[12px] tabular-nums text-slate-600">
                      {fmtDuration(e.duration)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default" className="text-[10px]">
                        {COVERAGE_LABELS[e.coverageStatus] ?? e.coverageStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] font-medium tabular-nums text-slate-800">
                      {e.amount != null ? fmtMoney(e.amount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, bg }: { label: string; value: string; icon: React.ReactNode; bg: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", bg)}>{icon}</div>
        <div>
          <p className="text-[18px] font-bold text-slate-900 tabular-nums">{value}</p>
          <p className="text-[12px] text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
