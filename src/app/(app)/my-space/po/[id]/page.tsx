"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, ShoppingCart, Package, Truck, CheckCircle2, Clock,
  Building2, DollarSign, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PoDetail {
  id: string; poNumber: string; title: string; status: string;
  vendorName: string; vendorContact: string | null;
  requestedBy: { firstName: string; lastName: string };
  organization: { id: string; name: string } | null;
  subtotal: number; taxAmount: number; totalAmount: number; currency: string;
  notes: string | null; expectedDate: string | null; receivedDate: string | null;
  submittedAt: string | null; approvedAt: string | null; createdAt: string;
  items: { id: string; description: string; partNumber: string | null; quantity: number; unitPrice: number; totalPrice: number; receivedQty: number }[];
}

const PO_STATUS: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: "Brouillon", variant: "default" }, SUBMITTED: { label: "Soumis — en attente d'approbation", variant: "warning" },
  APPROVED: { label: "Approuvé", variant: "success" }, ORDERED: { label: "Commandé", variant: "primary" },
  PARTIAL: { label: "Reçu partiellement", variant: "warning" }, RECEIVED: { label: "Reçu", variant: "success" },
  CANCELLED: { label: "Annulé", variant: "danger" },
};

function fmtMoney(v: number) { return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("fr-CA"); }

export default function PoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/purchase-orders/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  if (!data) return <div className="text-center py-20 text-slate-400">Bon de commande introuvable</div>;

  const st = PO_STATUS[data.status] ?? { label: data.status, variant: "default" };
  const receivedAll = data.items.every((i) => i.receivedQty >= i.quantity);
  const receivedCount = data.items.filter((i) => i.receivedQty >= i.quantity).length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/my-space" className="text-blue-600 hover:text-blue-700 flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Mon espace</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">Bon de commande</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-medium text-blue-600 tabular-nums">{data.poNumber}</span>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">{data.title}</h1>
          </div>
          <Badge variant={st.variant as any} className="text-[11px] mt-2">{st.label}</Badge>
        </div>
        <div className="text-right text-[13px] text-slate-500 space-y-0.5">
          <p>Créé le {fmtDate(data.createdAt)}</p>
          {data.submittedAt && <p>Soumis le {fmtDate(data.submittedAt)}</p>}
          {data.approvedAt && <p className="text-emerald-600">Approuvé le {fmtDate(data.approvedAt)}</p>}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500 flex items-center gap-1"><Building2 className="h-3 w-3" /> Fournisseur</p>
          <p className="text-[14px] font-semibold text-slate-900 mt-0.5">{data.vendorName}</p>
          {data.vendorContact && <p className="text-[11px] text-slate-500">{data.vendorContact}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500 flex items-center gap-1"><User className="h-3 w-3" /> Demandé par</p>
          <p className="text-[14px] font-semibold text-slate-900 mt-0.5">{data.requestedBy.firstName} {data.requestedBy.lastName}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500 flex items-center gap-1"><Building2 className="h-3 w-3" /> Client</p>
          <p className="text-[14px] font-semibold text-slate-900 mt-0.5">{data.organization?.name ?? "Achat interne"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500 flex items-center gap-1"><Package className="h-3 w-3" /> Articles reçus</p>
          <p className={cn("text-[14px] font-semibold mt-0.5", receivedAll ? "text-emerald-700" : "text-amber-700")}>{receivedCount} / {data.items.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500 flex items-center gap-1"><Truck className="h-3 w-3" /> Livraison</p>
          <p className="text-[14px] font-semibold text-slate-900 mt-0.5">
            {data.receivedDate ? <span className="text-emerald-700">{fmtDate(data.receivedDate)}</span> : data.expectedDate ? fmtDate(data.expectedDate) : "—"}
          </p>
        </CardContent></Card>
      </div>

      {data.notes && (
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-slate-500 mb-1">Notes</p>
          <p className="text-[13px] text-slate-700">{data.notes}</p>
        </CardContent></Card>
      )}

      {/* Items table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-slate-500" /> Articles</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                <th className="px-4 py-3 font-medium text-slate-500">Description</th>
                <th className="px-4 py-3 font-medium text-slate-500">N° pièce</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-center">Quantité</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-right">Prix unitaire</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-right">Total</th>
                <th className="px-4 py-3 font-medium text-slate-500 text-center">Reçu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.description}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">{item.partNumber || "—"}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-3 tabular-nums text-right text-slate-600">{fmtMoney(item.unitPrice)}</td>
                  <td className="px-4 py-3 font-medium tabular-nums text-right text-slate-800">{fmtMoney(item.totalPrice)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("tabular-nums font-medium", item.receivedQty >= item.quantity ? "text-emerald-600" : item.receivedQty > 0 ? "text-amber-600" : "text-slate-400")}>
                      {item.receivedQty}/{item.quantity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td colSpan={4} className="px-4 py-2 text-right text-[12px] text-slate-500">Sous-total</td>
                <td className="px-4 py-2 font-medium tabular-nums text-right text-slate-800">{fmtMoney(data.subtotal)}</td>
                <td></td>
              </tr>
              <tr className="bg-slate-50/60">
                <td colSpan={4} className="px-4 py-2 text-right text-[12px] text-slate-500">Taxes (TPS+TVQ)</td>
                <td className="px-4 py-2 tabular-nums text-right text-slate-600">{fmtMoney(data.taxAmount)}</td>
                <td></td>
              </tr>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-slate-700">Total</td>
                <td className="px-4 py-3 font-bold text-lg tabular-nums text-right text-slate-900">{fmtMoney(data.totalAmount)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
