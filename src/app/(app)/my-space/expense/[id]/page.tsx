"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Wallet, Calendar, FileText, Building2, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ExpenseDetail {
  id: string; title: string; status: string; totalAmount: number; notes: string | null;
  submitter: { name: string; email: string };
  periodStart: string | null; periodEnd: string | null;
  submittedAt: string | null; approvedAt: string | null; createdAt: string;
  entries: {
    id: string; date: string; category: string; description: string; amount: number;
    currency: string; vendor: string | null; isBillable: boolean; organizationName: string | null;
  }[];
}

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: "Brouillon", variant: "default" }, SUBMITTED: { label: "Soumis", variant: "warning" },
  APPROVED: { label: "Approuvé", variant: "success" }, REJECTED: { label: "Rejeté", variant: "danger" },
  REIMBURSED: { label: "Remboursé", variant: "success" },
};

function fmtMoney(v: number) { return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("fr-CA"); }

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/expense-reports/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  if (!data) return <div className="text-center py-20 text-slate-400">Rapport introuvable</div>;

  const billable = data.entries.filter((e) => e.isBillable);
  const billableTotal = billable.reduce((s, e) => s + e.amount, 0);
  const st = STATUS_MAP[data.status] ?? { label: data.status, variant: "default" };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/my-space" className="text-blue-600 hover:text-blue-700 flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Mon espace</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">Rapport de dépenses</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">{data.title}</h1>
            <Badge variant={st.variant as any} className="text-[11px]">{st.label}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">Par {data.submitter.name} — Créé le {fmtDate(data.createdAt)}</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500">Total</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{fmtMoney(data.totalAmount)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500">Facturable</p>
          <p className="text-lg font-bold text-emerald-700 tabular-nums">{fmtMoney(billableTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500">Entrées</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{data.entries.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500">Période</p>
          <p className="text-[13px] font-medium text-slate-700">
            {data.periodStart ? fmtDate(data.periodStart) : "—"} — {data.periodEnd ? fmtDate(data.periodEnd) : "—"}
          </p>
        </CardContent></Card>
      </div>

      {data.notes && (
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500 mb-1">Notes</p>
          <p className="text-[13px] text-slate-700">{data.notes}</p>
        </CardContent></Card>
      )}

      {/* Entries table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><Wallet className="h-4 w-4 text-slate-500" /> Détail des entrées</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                <th className="px-4 py-3 font-medium text-slate-500">Catégorie</th>
                <th className="px-4 py-3 font-medium text-slate-500">Description</th>
                <th className="px-4 py-3 font-medium text-slate-500">Fournisseur</th>
                <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-center">Facturable</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3"><Badge variant="default" className="text-[10px]">{e.category}</Badge></td>
                  <td className="px-4 py-3 text-slate-700">{e.description}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">{e.vendor || "—"}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">{e.organizationName || "—"}</td>
                  <td className="px-4 py-3 text-center">{e.isBillable ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 font-bold tabular-nums text-right text-slate-800">{fmtMoney(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={6} className="px-4 py-3 font-semibold text-slate-700 text-right">Total</td>
                <td className="px-4 py-3 font-bold text-lg tabular-nums text-right text-slate-900">{fmtMoney(data.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
