"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WidgetSidebar } from "@/components/widgets/widget-sidebar";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Building2,
  FileText,
  Loader2,
  Receipt,
  MapPin,
  Moon,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Users,
  Plug,
  RefreshCw,
  ExternalLink,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  Briefcase,
  Car,
  Coffee,
  MoreHorizontal,
  ShoppingCart,
  Package,
  Plus,
  Truck,
  CheckCircle,
  XCircle,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ===========================================================================
// Types
// ===========================================================================
interface FinanceData {
  period: { days: number; since: string };
  kpis: {
    totalRevenue: number; prevRevenue: number; revenueTrend: number;
    totalHours: number; prevHours: number; billableHours: number;
    includedHours: number; nonBillableHours: number; billableRate: number;
    onsiteRevenue: number; afterHoursRevenue: number;
    activeContractsCount: number; monthlyContractValue: number; projectedMonthlyRevenue: number;
  };
  revenueByOrg: { organizationId: string; organizationName: string; revenue: number; hours: number }[];
  coverageBreakdown: { status: string; hours: number; revenue: number }[];
  contracts: { id: string; name: string; organizationName: string; type: string; status: string; monthlyValue: number | null; startDate: string | null; endDate: string | null }[];
}

interface QboStatus { isConnected: boolean; companyName: string | null; connectedAt: string | null; sandbox: boolean; hasCredentials: boolean }
interface QboSummary { totalReceivable: number; totalOverdue: number; recentPaymentsTotal: number; invoiceCount: number; customerCount: number; openInvoices: number; overdueInvoices: number }
interface QboInvoice { id: string; docNumber: string; customerName: string; totalAmount: number; balance: number; dueDate: string | null; txnDate: string; status: "Paid" | "Open" | "Overdue" }
interface QboPayment { id: string; totalAmount: number; txnDate: string; customerName: string }
interface QboCustomer { id: string; displayName: string; companyName: string | null; email: string | null; balance: number; active: boolean }
interface QboData { companyInfo: any; summary: QboSummary; invoices: QboInvoice[]; customers: QboCustomer[]; payments: QboPayment[] }

interface TimeEntryRow {
  id: string; ticketId: string; ticketNumber: number; ticketSubject: string;
  organizationId: string; organizationName: string; agentId: string; agentName: string;
  timeType: string; startedAt: string; endedAt: string | null; durationMinutes: number;
  description: string; isAfterHours: boolean; isWeekend: boolean; isUrgent: boolean; isOnsite: boolean;
  coverageStatus: string; hourlyRate: number | null; amount: number | null;
  approvalStatus: string; createdAt: string;
}

interface ExpenseReport {
  id: string; title: string; submitterName: string; submitterAvatar: string | null; submitterId: string;
  status: string; totalAmount: number; entryCount: number; periodStart: string | null; periodEnd: string | null;
  submittedAt: string | null; approvedAt: string | null; createdAt: string; categories: string[];
  billableAmount: number;
}

interface PurchaseOrderRow {
  id: string; poNumber: string; title: string; status: string; vendorName: string; vendorContact: string | null;
  organizationName: string | null; organizationId: string | null; requestedByName: string; requestedById: string;
  subtotal: number; taxAmount: number; totalAmount: number; currency: string; notes: string | null;
  expectedDate: string | null; receivedDate: string | null; submittedAt: string | null; approvedAt: string | null;
  createdAt: string; itemCount: number; receivedCount: number;
  items: { id: string; description: string; partNumber: string | null; quantity: number; unitPrice: number; totalPrice: number; receivedQty: number }[];
}

// ===========================================================================
// Constants
// ===========================================================================
const TABS = [
  { key: "overview", label: "Vue d'ensemble", icon: PieChart },
  { key: "invoices", label: "Facturation", icon: Receipt },
  { key: "time", label: "Saisies de temps", icon: Clock },
  { key: "expenses", label: "Dépenses", icon: Wallet },
  { key: "expense_reports", label: "Comptes de dépenses", icon: Briefcase },
  { key: "purchase_orders", label: "Bons de commande", icon: ShoppingCart },
  { key: "contracts", label: "Contrats", icon: FileText },
  { key: "receivables", label: "Comptes à recevoir", icon: DollarSign },
  { key: "qbo_dashboard", label: "QuickBooks", icon: BarChart3 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

interface QboDashboard {
  connected: boolean; companyName: string; sandbox: boolean;
  kpis: { totalReceivable: number; totalOverdue: number; totalPaid: number; recentPaymentsTotal: number; invoiceCount: number; openInvoices: number; overdueInvoices: number; customerCount: number; avgInvoiceAmount: number; avgDaysToPayment: number };
  aging: { current: number; days30: number; days60: number; days90: number; over90: number };
  revenueByCustomer: { name: string; invoiced: number; paid: number; balance: number; count: number }[];
  monthlyRevenue: { month: string; invoiced: number; paid: number; count: number }[];
  topOverdue: { id: string; docNumber: string; customerName: string; totalAmount: number; balance: number; dueDate: string | null; txnDate: string; status: string }[];
  recentPayments: { id: string; totalAmount: number; txnDate: string; customerName: string }[];
  customerBalances: { id: string; displayName: string; balance: number; email: string | null }[];
  pnlSummary: { totalIncome: number; totalCOGS: number; grossProfit: number; totalExpenses: number; netIncome: number; period: { start: string; end: string } | null } | null;
  bsSummary: { totalAssets: number; totalLiabilitiesAndEquity: number; asOf: string | null } | null;
}

const EXPENSE_CATEGORIES = [
  "Déplacement", "Hébergement", "Repas", "Transport", "Matériel", "Logiciel",
  "Télécom", "Formation", "Sous-traitance", "Autre",
];

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon", SUBMITTED: "Soumis", APPROVED: "Approuvé", REJECTED: "Rejeté", REIMBURSED: "Remboursé",
};
const EXPENSE_STATUS_VARIANTS: Record<string, string> = {
  DRAFT: "default", SUBMITTED: "warning", APPROVED: "success", REJECTED: "danger", REIMBURSED: "success",
};

const PO_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon", SUBMITTED: "Soumis", APPROVED: "Approuvé", ORDERED: "Commandé",
  PARTIAL: "Partiel", RECEIVED: "Reçu", CANCELLED: "Annulé",
};
const PO_STATUS_VARIANTS: Record<string, string> = {
  DRAFT: "default", SUBMITTED: "warning", APPROVED: "success", ORDERED: "primary",
  PARTIAL: "warning", RECEIVED: "success", CANCELLED: "danger",
};

const COVERAGE_LABELS: Record<string, string> = {
  billable: "Facturable", included_in_contract: "Inclus contrat", hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque", msp_overage: "Hors forfait", non_billable: "Non facturable",
  pending: "En attente", travel_billable: "Déplacement facturable",
};
const COVERAGE_COLORS: Record<string, string> = {
  billable: "bg-emerald-500", included_in_contract: "bg-blue-500", hour_bank: "bg-violet-500",
  hour_bank_overage: "bg-amber-500", msp_overage: "bg-orange-500", non_billable: "bg-slate-400",
  pending: "bg-slate-300", travel_billable: "bg-cyan-500",
};

function fmtMoney(v: number) { return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("fr-CA"); }

// ===========================================================================
// Main Page
// ===========================================================================
export default function FinancesPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [days, setDays] = useState("30");
  const [showWidgetSidebar, setShowWidgetSidebar] = useState(false);

  // Core finance data
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Time entries
  const [timeEntries, setTimeEntries] = useState<TimeEntryRow[]>([]);
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeSearch, setTimeSearch] = useState("");
  const [timeAgent, setTimeAgent] = useState("all");
  const [timeCoverage, setTimeCoverage] = useState("all");

  // QBO
  const [qboStatus, setQboStatus] = useState<QboStatus | null>(null);
  const [qboData, setQboData] = useState<QboData | null>(null);
  const [qboLoading, setQboLoading] = useState(false);
  const [qboError, setQboError] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "Open" | "Overdue" | "Paid">("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // QBO dashboard
  const [qboDash, setQboDash] = useState<QboDashboard | null>(null);
  const [qboDashLoading, setQboDashLoading] = useState(false);

  // Expense reports
  const [expenseReports, setExpenseReports] = useState<ExpenseReport[]>([]);
  const [expReportLoading, setExpReportLoading] = useState(false);
  const [expStatusFilter, setExpStatusFilter] = useState("all");

  // Purchase orders
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [poStatusFilter, setPoStatusFilter] = useState("all");
  const [poSearch, setPoSearch] = useState("");
  const [expandedPo, setExpandedPo] = useState<string | null>(null);
  const [poActionLoading, setPoActionLoading] = useState<string | null>(null);
  const [showPoForm, setShowPoForm] = useState(false);
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poForm, setPoForm] = useState({
    title: "", vendorName: "", vendorContact: "", organizationId: "", notes: "", expectedDate: "",
  });
  const [poItems, setPoItems] = useState<{ description: string; partNumber: string; quantity: number; unitPrice: number }[]>([
    { description: "", partNumber: "", quantity: 1, unitPrice: 0 },
  ]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  // Load orgs for PO form
  useEffect(() => {
    if (showPoForm && orgs.length === 0) {
      fetch("/api/v1/organizations").then((r) => r.ok ? r.json() : []).then((d) => setOrgs(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [showPoForm]);

  function addPoItem() {
    setPoItems((prev) => [...prev, { description: "", partNumber: "", quantity: 1, unitPrice: 0 }]);
  }
  function removePoItem(idx: number) {
    setPoItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updatePoItem(idx: number, field: string, value: string | number) {
    setPoItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const poFormSubtotal = poItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const poFormTax = Math.round(poFormSubtotal * 0.14975 * 100) / 100;
  const poFormTotal = Math.round((poFormSubtotal + poFormTax) * 100) / 100;

  async function submitPo() {
    if (!poForm.title.trim() || !poForm.vendorName.trim()) return;
    const validItems = poItems.filter((i) => i.description.trim());
    if (validItems.length === 0) return;
    setPoSubmitting(true);
    try {
      const res = await fetch("/api/v1/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...poForm,
          organizationId: poForm.organizationId || undefined,
          expectedDate: poForm.expectedDate || undefined,
          items: validItems,
        }),
      });
      if (res.ok) {
        setShowPoForm(false);
        setPoForm({ title: "", vendorName: "", vendorContact: "", organizationId: "", notes: "", expectedDate: "" });
        setPoItems([{ description: "", partNumber: "", quantity: 1, unitPrice: 0 }]);
        // Reload
        setPoStatusFilter("all");
        fetch("/api/v1/purchase-orders").then((r) => r.ok ? r.json() : []).then((d) => setPurchaseOrders(Array.isArray(d) ? d : []));
      }
    } catch {} finally {
      setPoSubmitting(false);
    }
  }

  async function handlePoAction(poId: string, action: "APPROVED" | "REJECTED" | "ORDERED" | "RECEIVED" | "CANCELLED") {
    setPoActionLoading(poId);
    try {
      const res = await fetch(`/api/v1/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        // Reload POs
        fetch(`/api/v1/purchase-orders${poStatusFilter !== "all" ? `?status=${poStatusFilter}` : ""}`)
          .then((r) => r.ok ? r.json() : [])
          .then((d) => setPurchaseOrders(Array.isArray(d) ? d : []));
      }
    } catch {} finally {
      setPoActionLoading(null);
    }
  }

  // Load core data
  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/finances?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Load time entries when tab is active
  useEffect(() => {
    if (tab === "time" || tab === "expenses") {
      setTimeLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - parseInt(days));
      fetch(`/api/v1/time-entries?from=${since.toISOString()}`)
        .then((r) => r.ok ? r.json() : [])
        .then((d) => setTimeEntries(Array.isArray(d) ? d : []))
        .catch(() => setTimeEntries([]))
        .finally(() => setTimeLoading(false));
    }
  }, [tab, days]);

  // Expense reports
  useEffect(() => {
    if (tab === "expense_reports") {
      setExpReportLoading(true);
      const params = expStatusFilter !== "all" ? `?status=${expStatusFilter}` : "";
      fetch(`/api/v1/expense-reports${params}`)
        .then((r) => r.ok ? r.json() : [])
        .then((d) => setExpenseReports(Array.isArray(d) ? d : []))
        .catch(() => setExpenseReports([]))
        .finally(() => setExpReportLoading(false));
    }
  }, [tab, expStatusFilter]);

  // Purchase orders
  useEffect(() => {
    if (tab === "purchase_orders") {
      setPoLoading(true);
      const params = poStatusFilter !== "all" ? `?status=${poStatusFilter}` : "";
      fetch(`/api/v1/purchase-orders${params}`)
        .then((r) => r.ok ? r.json() : [])
        .then((d) => setPurchaseOrders(Array.isArray(d) ? d : []))
        .catch(() => setPurchaseOrders([]))
        .finally(() => setPoLoading(false));
    }
  }, [tab, poStatusFilter]);

  // QBO
  useEffect(() => {
    fetch("/api/v1/integrations/quickbooks")
      .then((r) => r.ok ? r.json() : null)
      .then((s: QboStatus | null) => {
        if (!s) return;
        setQboStatus(s);
        if (s.isConnected) {
          loadQboData();
          loadQboDashboard();
        }
      })
      .catch(() => {});
  }, []);

  // Load QBO dashboard when tab activates
  useEffect(() => {
    if (tab === "qbo_dashboard" && !qboDash && qboStatus?.isConnected) loadQboDashboard();
  }, [tab]);

  function loadQboDashboard() {
    setQboDashLoading(true);
    fetch("/api/v1/integrations/quickbooks/dashboard")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.connected) setQboDash(d); })
      .catch(() => {})
      .finally(() => setQboDashLoading(false));
  }

  function loadQboData() {
    setQboLoading(true);
    setQboError(null);
    fetch("/api/v1/integrations/quickbooks/sync")
      .then((r) => r.ok ? r.json() : r.json().then((e) => { throw new Error(e.error || "Erreur QuickBooks"); }))
      .then((d) => setQboData(d))
      .catch((e) => setQboError(e.message))
      .finally(() => setQboLoading(false));
  }

  // Filtered time entries
  const filteredTime = timeEntries.filter((e) => {
    if (timeAgent !== "all" && e.agentName !== timeAgent) return false;
    if (timeCoverage !== "all" && e.coverageStatus !== timeCoverage) return false;
    if (timeSearch) {
      const q = timeSearch.toLowerCase();
      if (!e.ticketSubject.toLowerCase().includes(q) && !e.organizationName.toLowerCase().includes(q) && !e.agentName.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Agent list for filter
  const agentNames = [...new Set(timeEntries.map((e) => e.agentName))].sort();

  // Expense entries (time entries that are onsite/travel/after-hours with amounts)
  const expenseEntries = timeEntries.filter((e) => e.isOnsite || e.coverageStatus === "travel_billable");

  // Agent expense summary
  const agentExpenses = new Map<string, { name: string; total: number; entries: number; onsite: number; travel: number }>();
  for (const e of expenseEntries) {
    const a = agentExpenses.get(e.agentName) || { name: e.agentName, total: 0, entries: 0, onsite: 0, travel: 0 };
    a.total += e.amount ?? 0;
    a.entries += 1;
    if (e.isOnsite) a.onsite += e.amount ?? 0;
    if (e.coverageStatus === "travel_billable") a.travel += e.amount ?? 0;
    agentExpenses.set(e.agentName, a);
  }

  // Filtered invoices
  const filteredInvoices = (qboData?.invoices ?? []).filter((inv) => {
    if (invoiceFilter !== "all" && inv.status !== invoiceFilter) return false;
    if (invoiceSearch) {
      const q = invoiceSearch.toLowerCase();
      if (!inv.customerName.toLowerCase().includes(q) && !inv.docNumber.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Filtered POs
  const filteredPOs = purchaseOrders.filter((po) => {
    if (poSearch) {
      const q = poSearch.toLowerCase();
      if (!po.poNumber.toLowerCase().includes(q) && !po.title.toLowerCase().includes(q) && !po.vendorName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Expense report stats
  const expTotalAll = expenseReports.reduce((s, r) => s + r.totalAmount, 0);
  const expPending = expenseReports.filter((r) => r.status === "SUBMITTED");
  const expApproved = expenseReports.filter((r) => r.status === "APPROVED" || r.status === "REIMBURSED");
  const expCatBreakdown = new Map<string, number>();
  for (const r of expenseReports) {
    for (const cat of r.categories) {
      expCatBreakdown.set(cat, (expCatBreakdown.get(cat) || 0) + 1);
    }
  }

  // PO stats
  const poTotalValue = purchaseOrders.reduce((s, po) => s + po.totalAmount, 0);
  const poPendingApproval = purchaseOrders.filter((po) => po.status === "SUBMITTED");
  const poOpen = purchaseOrders.filter((po) => ["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "PARTIAL"].includes(po.status));
  const poReceived = purchaseOrders.filter((po) => po.status === "RECEIVED");

  const k = data?.kpis;
  const periodLabel = days === "7" ? "7 derniers jours" : days === "30" ? "30 derniers jours" : days === "90" ? "3 derniers mois" : "12 derniers mois";

  if (loading && !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Finances</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 jours</SelectItem>
              <SelectItem value="30">30 jours</SelectItem>
              <SelectItem value="90">3 mois</SelectItem>
              <SelectItem value="365">12 mois</SelectItem>
            </SelectContent>
          </Select>
          {tab === "overview" && (
            <Button variant="outline" size="sm" onClick={() => setShowWidgetSidebar(true)}>
              <BarChart3 className="h-3.5 w-3.5" />
              Éditeur
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          const pendingCount = t.key === "purchase_orders" ? poPendingApproval.length : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {pendingCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/* TAB: Vue d'ensemble */}
      {/* ================================================================ */}
      {tab === "overview" && k && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Revenus" value={fmtMoney(k.totalRevenue)} trend={k.revenueTrend} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" onClick={() => setTab("invoices")} />
            <KpiCard label="Heures" value={`${k.totalHours}h`} icon={<Clock className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" onClick={() => setTab("time")} />
            <KpiCard label="Taux facturable" value={`${k.billableRate}%`} icon={<PieChart className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
            <KpiCard label="Sur place" value={fmtMoney(k.onsiteRevenue)} icon={<MapPin className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" onClick={() => setTab("expenses")} />
            <KpiCard label="Hors heures" value={fmtMoney(k.afterHoursRevenue)} icon={<Moon className="h-4 w-4 text-indigo-600" />} bg="bg-indigo-50" />
            <KpiCard label="Contrats actifs" value={k.activeContractsCount} icon={<FileText className="h-4 w-4 text-slate-600" />} bg="bg-slate-50" onClick={() => setTab("contracts")} />
          </div>

          {/* Projection */}
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
                  <div>
                    <p className="text-[14px] font-semibold text-slate-900">Projection mensuelle</p>
                    <p className="text-[12px] text-slate-500">Basée sur la moyenne quotidienne</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Projeté</p>
                    <p className="text-xl font-bold text-emerald-700 tabular-nums">{fmtMoney(k.projectedMonthlyRevenue)}</p>
                  </div>
                  {k.monthlyContractValue > 0 && (
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Récurrent</p>
                      <p className="text-xl font-bold text-blue-700 tabular-nums">{fmtMoney(k.monthlyContractValue)}/mois</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue by org */}
            {data?.revenueByOrg && data.revenueByOrg.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" /> Revenus par client
                  </h3>
                  <div className="space-y-2.5">
                    {data.revenueByOrg.map((o) => {
                      const max = data.revenueByOrg[0]?.revenue || 1;
                      return (
                        <Link key={o.organizationId} href={`/organizations/${o.organizationId}`} className="flex items-center gap-3 group rounded-lg px-1 -mx-1 py-0.5 hover:bg-slate-50 transition-colors">
                          <span className="text-[12px] text-slate-700 w-32 truncate font-medium group-hover:text-blue-600">{o.organizationName}</span>
                          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(o.revenue / max) * 100}%` }} />
                          </div>
                          <span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(o.revenue)}</span>
                          <span className="text-[10px] text-slate-400 w-12 text-right tabular-nums">{o.hours}h</span>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Coverage */}
            {data?.coverageBreakdown && data.coverageBreakdown.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-slate-500" /> Répartition par couverture
                  </h3>
                  <div className="space-y-2.5">
                    {data.coverageBreakdown.sort((a, b) => b.hours - a.hours).map((c) => (
                      <div key={c.status} className="flex items-center gap-3">
                        <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", COVERAGE_COLORS[c.status] ?? "bg-slate-400")} />
                        <span className="text-[12px] text-slate-700 flex-1 truncate">{COVERAGE_LABELS[c.status] ?? c.status}</span>
                        <span className="text-[12px] font-medium text-slate-600 tabular-nums w-14 text-right">{c.hours}h</span>
                        <span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(c.revenue)}</span>
                      </div>
                    ))}
                  </div>
                  {k.totalHours > 0 && (
                    <div className="mt-4 h-3 rounded-full bg-slate-100 overflow-hidden flex">
                      <div className="bg-emerald-500" style={{ width: `${(k.billableHours / k.totalHours) * 100}%` }} />
                      <div className="bg-blue-500" style={{ width: `${(k.includedHours / k.totalHours) * 100}%` }} />
                      <div className="bg-slate-400" style={{ width: `${(k.nonBillableHours / k.totalHours) * 100}%` }} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* QBO summary if connected */}
          {qboData && (
            <Card className="border-green-200/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center text-white text-[8px] font-bold">QB</div>
                    QuickBooks — Sommaire
                  </h3>
                  <button onClick={() => setTab("receivables")} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                    Voir détails <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[11px] text-slate-500">À recevoir</p>
                    <p className="text-lg font-bold text-slate-900 tabular-nums">{fmtMoney(qboData.summary.totalReceivable)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">En souffrance</p>
                    <p className={cn("text-lg font-bold tabular-nums", qboData.summary.totalOverdue > 0 ? "text-red-600" : "text-slate-900")}>{fmtMoney(qboData.summary.totalOverdue)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Factures ouvertes</p>
                    <p className="text-lg font-bold text-slate-900 tabular-nums">{qboData.summary.openInvoices}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Paiements récents</p>
                    <p className="text-lg font-bold text-emerald-700 tabular-nums">{fmtMoney(qboData.summary.recentPaymentsTotal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: Facturation (Invoices) */}
      {/* ================================================================ */}
      {tab === "invoices" && (
        <div className="space-y-5">
          {/* QBO connection check */}
          {!qboStatus?.isConnected && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-5 flex items-center gap-3">
                <Plug className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-amber-800">QuickBooks non connecté</p>
                  <p className="text-[12px] text-amber-600">Connectez QuickBooks pour voir vos factures unifiées.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  fetch("/api/v1/integrations/quickbooks").then((r) => r.json()).then((d) => { if (d.authUrl) window.location.href = d.authUrl; });
                }}>
                  <Plug className="h-3 w-3" /> Connecter
                </Button>
              </CardContent>
            </Card>
          )}

          {qboData && (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="w-full sm:w-64">
                  <Input placeholder="Rechercher par client ou n°..." value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} iconLeft={<Search className="h-3.5 w-3.5" />} />
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
                  {(["all", "Open", "Overdue", "Paid"] as const).map((f) => (
                    <button key={f} onClick={() => setInvoiceFilter(f)}
                      className={cn("rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                        invoiceFilter === f ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60" : "text-slate-500 hover:text-slate-800"
                      )}>
                      {f === "all" ? "Toutes" : f === "Open" ? "Ouvertes" : f === "Overdue" ? "En retard" : "Payées"}
                      {f !== "all" && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({qboData.invoices.filter((i) => i.status === f).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <span className="text-[12px] text-slate-400 ml-auto">{filteredInvoices.length} factures</span>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden space-y-2">
                {filteredInvoices.map((inv) => (
                  <Card key={inv.id} className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 tabular-nums text-[13px]">{inv.docNumber || "—"}</p>
                        <p className="text-[12px] text-blue-700 font-semibold truncate">{inv.customerName}</p>
                      </div>
                      <Badge variant={inv.status === "Paid" ? "success" : inv.status === "Overdue" ? "danger" : "warning"} className="text-[10px] shrink-0">
                        {inv.status === "Paid" ? "Payée" : inv.status === "Overdue" ? "En retard" : "Ouverte"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
                      <div>
                        <span className="text-slate-400">Montant</span>
                        <p className="font-medium text-slate-800 tabular-nums">{fmtMoney(inv.totalAmount)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Solde</span>
                        <p className={cn("font-medium tabular-nums", inv.balance > 0 ? "text-amber-700" : "text-slate-400")}>{fmtMoney(inv.balance)}</p>
                      </div>
                      {inv.txnDate && (
                        <div>
                          <span className="text-slate-400">Date</span>
                          <p className="text-slate-600 tabular-nums">{fmtDate(inv.txnDate)}</p>
                        </div>
                      )}
                      {inv.dueDate && (
                        <div>
                          <span className="text-slate-400">Échéance</span>
                          <p className="text-slate-600 tabular-nums">{fmtDate(inv.dueDate)}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
                {filteredInvoices.length === 0 && (
                  <Card className="p-8 text-center text-sm text-slate-400">Aucune facture trouvée</Card>
                )}
              </div>

              {/* Invoices table */}
              <Card className="overflow-hidden hidden sm:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                        <th className="px-4 py-3 font-medium text-slate-500">N°</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Échéance</th>
                        <th className="px-4 py-3 font-medium text-slate-500 text-right">Montant</th>
                        <th className="px-4 py-3 font-medium text-slate-500 text-right">Solde</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-900 tabular-nums">{inv.docNumber || "—"}</td>
                          <td className="px-4 py-3"><span className="font-semibold text-blue-700">{inv.customerName}</span></td>
                          <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums">{inv.txnDate ? fmtDate(inv.txnDate) : "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums">{inv.dueDate ? fmtDate(inv.dueDate) : "—"}</td>
                          <td className="px-4 py-3 font-medium text-slate-800 tabular-nums text-right">{fmtMoney(inv.totalAmount)}</td>
                          <td className="px-4 py-3 font-medium tabular-nums text-right">
                            <span className={inv.balance > 0 ? "text-amber-700" : "text-slate-400"}>{fmtMoney(inv.balance)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={inv.status === "Paid" ? "success" : inv.status === "Overdue" ? "danger" : "warning"} className="text-[10px]">
                              {inv.status === "Paid" ? "Payée" : inv.status === "Overdue" ? "En retard" : "Ouverte"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {filteredInvoices.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-[13px]">Aucune facture trouvée</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* Internal contracts as invoiceable items */}
          {data?.contracts && data.contracts.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" /> Contrats facturables
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">Contrat</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Type</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Valeur mensuelle</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Échéance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.contracts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                        <td className="px-4 py-3 text-slate-600">{c.organizationName}</td>
                        <td className="px-4 py-3"><Badge variant="default" className="text-[10px]">{c.type}</Badge></td>
                        <td className="px-4 py-3 font-medium tabular-nums text-slate-800 text-right">{c.monthlyValue ? fmtMoney(c.monthlyValue) : "—"}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-500">{c.endDate ? fmtDate(c.endDate) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: Saisies de temps */}
      {/* ================================================================ */}
      {tab === "time" && (
        <div className="space-y-5">
          {/* Summary bar */}
          {k && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Heures totales" value={`${k.totalHours}h`} icon={<Clock className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
              <KpiCard label="Facturables" value={`${k.billableHours}h`} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
              <KpiCard label="Incluses" value={`${k.includedHours}h`} icon={<FileText className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
              <KpiCard label="Non facturables" value={`${k.nonBillableHours}h`} icon={<Clock className="h-4 w-4 text-slate-500" />} bg="bg-slate-50" />
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="w-full sm:w-64">
              <Input placeholder="Rechercher..." value={timeSearch} onChange={(e) => setTimeSearch(e.target.value)} iconLeft={<Search className="h-3.5 w-3.5" />} />
            </div>
            <Select value={timeAgent} onValueChange={setTimeAgent}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Technicien" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les techniciens</SelectItem>
                {agentNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={timeCoverage} onValueChange={setTimeCoverage}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Couverture" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes couvertures</SelectItem>
                {Object.entries(COVERAGE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-[12px] text-slate-400 ml-auto">{filteredTime.length} entrées</span>
          </div>

          {timeLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Technicien</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Ticket</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Durée</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Taux</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Montant</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Couverture</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTime.slice(0, 100).map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(e.startedAt)}</td>
                        <td className="px-4 py-3 text-slate-700 text-[12px]">{e.agentName}</td>
                        <td className="px-4 py-3">
                          <Link href={`/tickets/${e.ticketId}`} className="text-[12px] text-blue-600 hover:underline">#{e.ticketNumber}</Link>
                          <span className="text-[11px] text-slate-500 ml-1.5 truncate max-w-[150px] inline-block align-bottom">{e.ticketSubject}</span>
                        </td>
                        <td className="px-4 py-3"><Link href={`/organizations/${e.organizationId}`} className="text-[12px] text-blue-600 hover:underline">{e.organizationName}</Link></td>
                        <td className="px-4 py-3 font-medium text-slate-800 tabular-nums text-right">{Math.round(e.durationMinutes / 6) / 10}h</td>
                        <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums text-right">{e.hourlyRate ? fmtMoney(e.hourlyRate) : "—"}</td>
                        <td className="px-4 py-3 font-medium tabular-nums text-right">
                          <span className={e.amount && e.amount > 0 ? "text-emerald-700" : "text-slate-400"}>{e.amount ? fmtMoney(e.amount) : "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("h-2 w-2 rounded-full", COVERAGE_COLORS[e.coverageStatus] ?? "bg-slate-300")} />
                            <span className="text-[11px] text-slate-600">{COVERAGE_LABELS[e.coverageStatus] ?? e.coverageStatus}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {e.isOnsite && <Badge variant="default" className="text-[9px] py-0">Site</Badge>}
                            {e.isAfterHours && <Badge variant="warning" className="text-[9px] py-0">HH</Badge>}
                            {e.isUrgent && <Badge variant="danger" className="text-[9px] py-0">Urgent</Badge>}
                            {e.isWeekend && <Badge variant="default" className="text-[9px] py-0">WE</Badge>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredTime.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400 text-[13px]">Aucune saisie de temps</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredTime.length > 100 && (
                <div className="px-5 py-3 border-t border-slate-200 text-center text-[12px] text-slate-500">
                  Affichage des 100 premières entrées sur {filteredTime.length}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: Dépenses */}
      {/* ================================================================ */}
      {tab === "expenses" && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Déplacements total" value={fmtMoney(k?.onsiteRevenue ?? 0)} icon={<Car className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
            <KpiCard label="Hors heures total" value={fmtMoney(k?.afterHoursRevenue ?? 0)} icon={<Moon className="h-4 w-4 text-indigo-600" />} bg="bg-indigo-50" />
            <KpiCard label="Entrées sur place" value={expenseEntries.length} icon={<MapPin className="h-4 w-4 text-cyan-600" />} bg="bg-cyan-50" />
            <KpiCard label="Techniciens" value={agentExpenses.size} icon={<Users className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
          </div>

          {/* Per-agent expense breakdown */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" /> Compte de dépenses par technicien
              </h3>
              {agentExpenses.size > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className="pb-3 font-medium text-slate-500">Technicien</th>
                        <th className="pb-3 font-medium text-slate-500 text-right">Entrées</th>
                        <th className="pb-3 font-medium text-slate-500 text-right">Sur place</th>
                        <th className="pb-3 font-medium text-slate-500 text-right">Déplacements</th>
                        <th className="pb-3 font-medium text-slate-500 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Array.from(agentExpenses.values()).sort((a, b) => b.total - a.total).map((a) => (
                        <tr key={a.name} className="hover:bg-slate-50/80">
                          <td className="py-3 font-medium text-slate-900 flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                              {a.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            {a.name}
                          </td>
                          <td className="py-3 text-slate-600 tabular-nums text-right">{a.entries}</td>
                          <td className="py-3 text-slate-700 tabular-nums text-right">{fmtMoney(a.onsite)}</td>
                          <td className="py-3 text-slate-700 tabular-nums text-right">{fmtMoney(a.travel)}</td>
                          <td className="py-3 font-bold text-slate-900 tabular-nums text-right">{fmtMoney(a.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px] text-slate-400 py-8 text-center">Aucune dépense pour cette période</p>
              )}
            </CardContent>
          </Card>

          {/* Expense entries detail */}
          {expenseEntries.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-slate-500" /> Détail des dépenses
                  <Badge variant="default" className="text-[10px] ml-1">{expenseEntries.length}</Badge>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Technicien</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Ticket</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Type</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Durée</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenseEntries.slice(0, 50).map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums">{fmtDate(e.startedAt)}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-700">{e.agentName}</td>
                        <td className="px-4 py-3"><Link href={`/organizations/${e.organizationId}`} className="text-[12px] text-blue-600 hover:underline">{e.organizationName}</Link></td>
                        <td className="px-4 py-3"><Link href={`/tickets/${e.ticketId}`} className="text-[12px] text-blue-600 hover:underline">#{e.ticketNumber}</Link></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {e.isOnsite && <Badge variant="default" className="text-[9px]"><MapPin className="h-2.5 w-2.5 mr-0.5" />Site</Badge>}
                            {e.coverageStatus === "travel_billable" && <Badge variant="warning" className="text-[9px]"><Car className="h-2.5 w-2.5 mr-0.5" />Dépl.</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums text-right">{Math.round(e.durationMinutes / 6) / 10}h</td>
                        <td className="px-4 py-3 font-bold text-emerald-700 tabular-nums text-right">{e.amount ? fmtMoney(e.amount) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: Comptes de dépenses */}
      {/* ================================================================ */}
      {tab === "expense_reports" && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total dépenses" value={fmtMoney(expTotalAll)} icon={<Wallet className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Rapports soumis" value={expPending.length} icon={<Clock className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
            <KpiCard label="Approuvés" value={expApproved.length} icon={<CheckCircle className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Rapports total" value={expenseReports.length} icon={<FileText className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By submitter */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-500" /> Dépenses par employé
                </h3>
                {(() => {
                  const byUser = new Map<string, { name: string; total: number; count: number }>();
                  for (const r of expenseReports) {
                    const u = byUser.get(r.submitterName) || { name: r.submitterName, total: 0, count: 0 };
                    u.total += r.totalAmount; u.count += r.entryCount;
                    byUser.set(r.submitterName, u);
                  }
                  const list = Array.from(byUser.values()).sort((a, b) => b.total - a.total);
                  const max = list[0]?.total || 1;
                  return list.length > 0 ? (
                    <div className="space-y-3">
                      {list.map((u) => (
                        <div key={u.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-medium text-slate-700">{u.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-slate-500">{u.count} entrées</span>
                              <span className="text-[12px] font-bold text-slate-800 tabular-nums">{fmtMoney(u.total)}</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${(u.total / max) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12px] text-slate-400 py-6 text-center">Aucune donnée</p>;
                })()}
              </CardContent>
            </Card>

            {/* By category */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-500" /> Par catégorie
                </h3>
                {expCatBreakdown.size > 0 ? (
                  <div className="space-y-2.5">
                    {Array.from(expCatBreakdown.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
                      const total = Array.from(expCatBreakdown.values()).reduce((s, v) => s + v, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <span className="text-[12px] text-slate-600 w-28 truncate">{cat}</span>
                          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[12px] font-bold text-slate-800 tabular-nums w-10 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-[12px] text-slate-400 py-6 text-center">Aucune donnée</p>}
              </CardContent>
            </Card>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
              {["all", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "REIMBURSED"].map((s) => (
                <button key={s} onClick={() => setExpStatusFilter(s)}
                  className={cn("rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                    expStatusFilter === s ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60" : "text-slate-500 hover:text-slate-800"
                  )}>
                  {s === "all" ? "Tous" : EXPENSE_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <span className="text-[12px] text-slate-400 ml-auto">{expenseReports.length} rapports</span>
          </div>

          {/* Table */}
          {expReportLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">Titre</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Employé</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Période</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-center">Entrées</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Catégories</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Facturable</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Total</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenseReports.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-900">{r.title}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-700">{r.submitterName}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums whitespace-nowrap">
                          {r.periodStart ? fmtDate(r.periodStart) : "—"} — {r.periodEnd ? fmtDate(r.periodEnd) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-slate-600">{r.entryCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {r.categories.slice(0, 3).map((c) => <Badge key={c} variant="default" className="text-[9px]">{c}</Badge>)}
                            {r.categories.length > 3 && <span className="text-[10px] text-slate-400">+{r.categories.length - 3}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] tabular-nums text-right text-blue-700 font-medium">{fmtMoney(r.billableAmount)}</td>
                        <td className="px-4 py-3 font-bold tabular-nums text-right text-slate-800">{fmtMoney(r.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={(EXPENSE_STATUS_VARIANTS[r.status] ?? "default") as any} className="text-[10px]">
                            {EXPENSE_STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {expenseReports.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-[13px]">
                        <Briefcase className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                        Aucun rapport de dépenses
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: Bons de commande */}
      {/* ================================================================ */}
      {tab === "purchase_orders" && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="En attente d'approbation" value={poPendingApproval.length} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
            <KpiCard label="Valeur totale" value={fmtMoney(poTotalValue)} icon={<ShoppingCart className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="En cours" value={poOpen.length} icon={<Clock className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
            <KpiCard label="Reçus" value={poReceived.length} icon={<Package className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Total" value={purchaseOrders.length} icon={<FileText className="h-4 w-4 text-slate-600" />} bg="bg-slate-50" />
          </div>

          {/* Pending approval banner */}
          {poPendingApproval.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-[13px] text-amber-800 flex-1">
                  <span className="font-semibold">{poPendingApproval.length} bon{poPendingApproval.length > 1 ? "s" : ""} de commande</span> en attente d'approbation
                  {" "}pour un total de <span className="font-semibold">{fmtMoney(poPendingApproval.reduce((s, po) => s + po.totalAmount, 0))}</span>
                </p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="primary" size="sm" onClick={() => setShowPoForm(!showPoForm)}>
              <Plus className="h-3.5 w-3.5" />
              Nouveau bon de commande
            </Button>
          </div>

          {/* ---- Create PO Form ---- */}
          {showPoForm && (
            <Card className="border-blue-200 bg-blue-50/20">
              <CardContent className="p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-slate-900">Nouveau bon de commande</h3>
                  <button onClick={() => setShowPoForm(false)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>

                {/* Info fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Input label="Titre *" placeholder="Ex: Remplacement serveur Acme" value={poForm.title} onChange={(e) => setPoForm((p) => ({ ...p, title: e.target.value }))} />
                  <Input label="Fournisseur *" placeholder="Nom du fournisseur" value={poForm.vendorName} onChange={(e) => setPoForm((p) => ({ ...p, vendorName: e.target.value }))} />
                  <Input label="Contact fournisseur" placeholder="Nom ou courriel" value={poForm.vendorContact} onChange={(e) => setPoForm((p) => ({ ...p, vendorContact: e.target.value }))} />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-700">Client</label>
                    <Select value={poForm.organizationId} onValueChange={(v) => setPoForm((p) => ({ ...p, organizationId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Aucun (interne)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun (achat interne)</SelectItem>
                        {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input label="Date de livraison prévue" type="date" value={poForm.expectedDate} onChange={(e) => setPoForm((p) => ({ ...p, expectedDate: e.target.value }))} />
                  <Input label="Notes" placeholder="Notes internes..." value={poForm.notes} onChange={(e) => setPoForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[13px] font-semibold text-slate-900">Articles</h4>
                    <button onClick={addPoItem} className="text-[12px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Ajouter un article
                    </button>
                  </div>
                  <div className="space-y-2">
                    {poItems.map((item, idx) => (
                      <div key={idx} className="flex items-end gap-2 bg-white rounded-lg p-3 ring-1 ring-slate-200/60">
                        <div className="flex-1 min-w-0">
                          <label className="text-[11px] text-slate-500 mb-1 block">Description *</label>
                          <input
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Description de l'article"
                            value={item.description}
                            onChange={(e) => updatePoItem(idx, "description", e.target.value)}
                          />
                        </div>
                        <div className="w-32">
                          <label className="text-[11px] text-slate-500 mb-1 block">N° pièce</label>
                          <input
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Optionnel"
                            value={item.partNumber}
                            onChange={(e) => updatePoItem(idx, "partNumber", e.target.value)}
                          />
                        </div>
                        <div className="w-20">
                          <label className="text-[11px] text-slate-500 mb-1 block">Qté</label>
                          <input
                            type="number" min={1}
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-center tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={item.quantity}
                            onChange={(e) => updatePoItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="w-28">
                          <label className="text-[11px] text-slate-500 mb-1 block">Prix unit. $</label>
                          <input
                            type="number" min={0} step={0.01}
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-right tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={item.unitPrice || ""}
                            onChange={(e) => updatePoItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="w-28 text-right">
                          <label className="text-[11px] text-slate-500 mb-1 block">Total</label>
                          <p className="py-1.5 text-sm font-medium text-slate-800 tabular-nums">{fmtMoney(item.quantity * item.unitPrice)}</p>
                        </div>
                        {poItems.length > 1 && (
                          <button onClick={() => removePoItem(idx)} className="text-red-400 hover:text-red-600 p-1.5 mb-0.5">
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals + Submit */}
                <div className="flex items-end justify-between pt-3 border-t border-slate-200">
                  <div className="space-y-1 text-[13px]">
                    <div className="flex items-center gap-8">
                      <span className="text-slate-500 w-24">Sous-total</span>
                      <span className="font-medium text-slate-800 tabular-nums">{fmtMoney(poFormSubtotal)}</span>
                    </div>
                    <div className="flex items-center gap-8">
                      <span className="text-slate-500 w-24">Taxes (14,975%)</span>
                      <span className="text-slate-600 tabular-nums">{fmtMoney(poFormTax)}</span>
                    </div>
                    <div className="flex items-center gap-8">
                      <span className="font-semibold text-slate-900 w-24">Total</span>
                      <span className="font-bold text-lg text-slate-900 tabular-nums">{fmtMoney(poFormTotal)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowPoForm(false)}>Annuler</Button>
                    <Button
                      variant="primary"
                      loading={poSubmitting}
                      disabled={!poForm.title.trim() || !poForm.vendorName.trim() || !poItems.some((i) => i.description.trim())}
                      onClick={submitPo}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Créer le bon de commande
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="w-full sm:w-64">
              <Input placeholder="Rechercher PO, titre, fournisseur..." value={poSearch} onChange={(e) => setPoSearch(e.target.value)} iconLeft={<Search className="h-3.5 w-3.5" />} />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60 overflow-x-auto">
              {["all", "DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"].map((s) => (
                <button key={s} onClick={() => setPoStatusFilter(s)}
                  className={cn("rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all whitespace-nowrap",
                    poStatusFilter === s ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60" : "text-slate-500 hover:text-slate-800"
                  )}>
                  {s === "all" ? "Tous" : PO_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <span className="text-[12px] text-slate-400 ml-auto">{filteredPOs.length} commandes</span>
          </div>

          {/* Table */}
          {poLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">N° PO</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Titre</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Fournisseur</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Demandé par</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-center">Articles</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Sous-total</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Taxes</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-right">Total</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Livraison</th>
                      <th className="px-4 py-3 font-medium text-slate-500 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPOs.map((po) => (
                      <>
                        <tr key={po.id} className={cn("hover:bg-slate-50/80 cursor-pointer", po.status === "SUBMITTED" && "bg-amber-50/30")} onClick={() => setExpandedPo(expandedPo === po.id ? null : po.id)}>
                          <td className="px-4 py-3 font-medium text-blue-600 tabular-nums">{po.poNumber}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{po.title}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-700">{po.vendorName}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-600">{po.organizationName || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-600">{po.requestedByName}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="tabular-nums">{po.receivedCount}/{po.itemCount}</span>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtMoney(po.subtotal)}</td>
                          <td className="px-4 py-3 tabular-nums text-right text-slate-500 text-[12px]">{fmtMoney(po.taxAmount)}</td>
                          <td className="px-4 py-3 font-bold tabular-nums text-right text-slate-900">{fmtMoney(po.totalAmount)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={(PO_STATUS_VARIANTS[po.status] ?? "default") as any} className="text-[10px]">
                              {PO_STATUS_LABELS[po.status] ?? po.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-slate-500">
                            {po.receivedDate ? (
                              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />{fmtDate(po.receivedDate)}</span>
                            ) : po.expectedDate ? (
                              <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{fmtDate(po.expectedDate)}</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 justify-center">
                              {po.status === "SUBMITTED" && (
                                <>
                                  <Button variant="primary" size="sm" className="h-7 text-[11px] px-2"
                                    loading={poActionLoading === po.id}
                                    onClick={() => handlePoAction(po.id, "APPROVED")}>
                                    <CheckCircle2 className="h-3 w-3" /> Approuver
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => handlePoAction(po.id, "REJECTED")}>
                                    <XCircle className="h-3 w-3" /> Refuser
                                  </Button>
                                </>
                              )}
                              {po.status === "APPROVED" && (
                                <Button variant="outline" size="sm" className="h-7 text-[11px] px-2"
                                  loading={poActionLoading === po.id}
                                  onClick={() => handlePoAction(po.id, "ORDERED")}>
                                  <Truck className="h-3 w-3" /> Commandé
                                </Button>
                              )}
                              {po.status === "ORDERED" && (
                                <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 text-emerald-600"
                                  loading={poActionLoading === po.id}
                                  onClick={() => handlePoAction(po.id, "RECEIVED")}>
                                  <Package className="h-3 w-3" /> Reçu
                                </Button>
                              )}
                              {["DRAFT", "SUBMITTED", "APPROVED", "ORDERED"].includes(po.status) && (
                                <Button variant="ghost" size="sm" className="h-7 text-[11px] px-1.5 text-slate-400 hover:text-red-600"
                                  onClick={() => handlePoAction(po.id, "CANCELLED")}>
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded items row */}
                        {expandedPo === po.id && po.items.length > 0 && (
                          <tr key={`${po.id}-items`}>
                            <td colSpan={12} className="bg-slate-50/50 px-8 py-3">
                              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Articles</p>
                              <table className="w-full text-[12px]">
                                <thead>
                                  <tr className="border-b border-slate-200 text-left">
                                    <th className="pb-2 font-medium text-slate-500">Description</th>
                                    <th className="pb-2 font-medium text-slate-500">N° pièce</th>
                                    <th className="pb-2 font-medium text-slate-500 text-center">Qté</th>
                                    <th className="pb-2 font-medium text-slate-500 text-right">Prix unit.</th>
                                    <th className="pb-2 font-medium text-slate-500 text-right">Total</th>
                                    <th className="pb-2 font-medium text-slate-500 text-center">Reçu</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {po.items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="py-2 text-slate-700">{item.description}</td>
                                      <td className="py-2 text-slate-500">{item.partNumber || "—"}</td>
                                      <td className="py-2 text-center tabular-nums">{item.quantity}</td>
                                      <td className="py-2 text-right tabular-nums text-slate-600">{fmtMoney(item.unitPrice)}</td>
                                      <td className="py-2 text-right tabular-nums font-medium text-slate-800">{fmtMoney(item.totalPrice)}</td>
                                      <td className="py-2 text-center">
                                        <span className={cn("tabular-nums font-medium", item.receivedQty >= item.quantity ? "text-emerald-600" : item.receivedQty > 0 ? "text-amber-600" : "text-slate-400")}>
                                          {item.receivedQty}/{item.quantity}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {po.notes && <p className="mt-3 text-[11px] text-slate-500 italic">Note : {po.notes}</p>}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                    {filteredPOs.length === 0 && (
                      <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-400 text-[13px]">
                        <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                        Aucun bon de commande
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Vendor breakdown */}
          {purchaseOrders.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-500" /> Par fournisseur
                </h3>
                {(() => {
                  const byVendor = new Map<string, { total: number; count: number }>();
                  for (const po of purchaseOrders) {
                    const v = byVendor.get(po.vendorName) || { total: 0, count: 0 };
                    v.total += po.totalAmount; v.count += 1;
                    byVendor.set(po.vendorName, v);
                  }
                  const list = Array.from(byVendor.entries()).sort((a, b) => b[1].total - a[1].total);
                  const max = list[0]?.[1].total || 1;
                  return (
                    <div className="space-y-2.5">
                      {list.map(([name, d]) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-[12px] text-slate-700 w-40 truncate font-medium">{name}</span>
                          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${(d.total / max) * 100}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-500 tabular-nums w-12 text-right">{d.count} PO</span>
                          <span className="text-[12px] font-bold text-slate-800 tabular-nums w-28 text-right">{fmtMoney(d.total)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: Contrats */}
      {/* ================================================================ */}
      {tab === "contracts" && (
        <div className="space-y-5">
          {data?.contracts && data.contracts.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiCard label="Contrats actifs" value={data.contracts.length} icon={<FileText className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
                <KpiCard label="Valeur mensuelle" value={fmtMoney(k?.monthlyContractValue ?? 0)} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
                <KpiCard label="Valeur annuelle" value={fmtMoney((k?.monthlyContractValue ?? 0) * 12)} icon={<Calendar className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
              </div>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                        <th className="px-4 py-3 font-medium text-slate-500">Contrat</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Type</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                        <th className="px-4 py-3 font-medium text-slate-500 text-right">Valeur/mois</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Début</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Fin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.contracts.map((c) => {
                        const isExpiring = c.endDate && new Date(c.endDate) < new Date(Date.now() + 30 * 86400000);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                            <td className="px-4 py-3"><Link href={`/organizations/${c.id}`} className="text-[13px] text-blue-600 hover:underline">{c.organizationName}</Link></td>
                            <td className="px-4 py-3"><Badge variant="default" className="text-[10px]">{c.type}</Badge></td>
                            <td className="px-4 py-3"><Badge variant="success" className="text-[10px]">Actif</Badge></td>
                            <td className="px-4 py-3 font-bold tabular-nums text-slate-800 text-right">{c.monthlyValue ? fmtMoney(c.monthlyValue) : "—"}</td>
                            <td className="px-4 py-3 text-[12px] text-slate-500">{c.startDate ? fmtDate(c.startDate) : "—"}</td>
                            <td className="px-4 py-3 text-[12px]">
                              {c.endDate ? (
                                <span className={isExpiring ? "text-red-600 font-medium" : "text-slate-500"}>
                                  {fmtDate(c.endDate)}
                                  {isExpiring && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <Card><CardContent className="p-12 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-[15px] font-semibold text-slate-900">Aucun contrat actif</h3>
              <p className="mt-1 text-[13px] text-slate-500">Les contrats seront affichés ici une fois créés.</p>
            </CardContent></Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: Comptes à recevoir (QBO) */}
      {/* ================================================================ */}
      {tab === "receivables" && (
        <div className="space-y-5">
          {!qboStatus?.isConnected ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Plug className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <h3 className="text-[15px] font-semibold text-slate-900">QuickBooks non connecté</h3>
                <p className="mt-1 text-[13px] text-slate-500 max-w-md mx-auto">
                  Connectez QuickBooks pour voir vos comptes à recevoir, paiements et clients.
                </p>
                <Button variant="primary" className="mt-4" onClick={() => {
                  fetch("/api/v1/integrations/quickbooks").then((r) => r.json()).then((d) => { if (d.authUrl) window.location.href = d.authUrl; });
                }} disabled={!qboStatus?.hasCredentials}>
                  <Plug className="h-4 w-4" /> Connecter QuickBooks
                </Button>
              </CardContent>
            </Card>
          ) : qboLoading && !qboData ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : qboError ? (
            <Card className="border-red-200 bg-red-50/30">
              <CardContent className="p-5 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <div className="flex-1"><p className="text-[13px] font-medium text-red-800">Erreur QuickBooks</p><p className="text-[12px] text-red-600 mt-0.5">{qboError}</p></div>
                <Button variant="outline" size="sm" onClick={loadQboData}><RefreshCw className="h-3 w-3" /> Réessayer</Button>
              </CardContent>
            </Card>
          ) : qboData ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-[13px] font-medium text-slate-700">{qboData.companyInfo?.CompanyName || qboStatus?.companyName || "QuickBooks"}</span>
                  {qboStatus?.sandbox && <Badge variant="warning" className="text-[9px]">Sandbox</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={loadQboData} loading={qboLoading}><RefreshCw className="h-3 w-3" /> Actualiser</Button>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard label="À recevoir" value={fmtMoney(qboData.summary.totalReceivable)} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
                <KpiCard label="En souffrance" value={fmtMoney(qboData.summary.totalOverdue)} icon={<AlertTriangle className="h-4 w-4 text-red-600" />} bg="bg-red-50" />
                <KpiCard label="Paiements récents" value={fmtMoney(qboData.summary.recentPaymentsTotal)} icon={<CreditCard className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
                <KpiCard label="Factures ouvertes" value={qboData.summary.openInvoices} icon={<Receipt className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
                <KpiCard label="Clients" value={qboData.summary.customerCount} icon={<Users className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
              </div>

              {/* Overdue alert */}
              {qboData.summary.overdueInvoices > 0 && (
                <Card className="border-amber-200 bg-amber-50/40">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-[13px] text-amber-800">
                      <span className="font-semibold">{qboData.summary.overdueInvoices} facture{qboData.summary.overdueInvoices > 1 ? "s" : ""} en souffrance</span>
                      {" "}pour un total de <span className="font-semibold">{fmtMoney(qboData.summary.totalOverdue)}</span>
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payments */}
                <Card className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><CreditCard className="h-4 w-4 text-slate-500" /> Paiements récents</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {qboData.payments.map((p) => (
                      <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/80">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-blue-700 truncate">{p.customerName}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">{fmtDate(p.txnDate)}</p>
                        </div>
                        <span className="text-[14px] font-bold text-emerald-700 tabular-nums shrink-0 ml-3 flex items-center gap-1">
                          <ArrowDownRight className="h-3.5 w-3.5" />+{fmtMoney(p.totalAmount)}
                        </span>
                      </div>
                    ))}
                    {qboData.payments.length === 0 && <div className="px-5 py-8 text-center text-slate-400 text-[13px]">Aucun paiement</div>}
                  </div>
                </Card>

                {/* Customers with balance */}
                <Card className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><Users className="h-4 w-4 text-slate-500" /> Clients avec solde</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {qboData.customers.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).map((c) => (
                      <div key={c.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/80">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-blue-700 truncate">{c.displayName}</p>
                          {c.email && <p className="text-[11px] text-slate-500 truncate">{c.email}</p>}
                        </div>
                        <span className="text-[14px] font-bold text-amber-700 tabular-nums shrink-0 ml-3">{fmtMoney(c.balance)}</span>
                      </div>
                    ))}
                    {qboData.customers.filter((c) => c.balance > 0).length === 0 && (
                      <div className="px-5 py-8 text-center text-slate-400 text-[13px]">Aucun solde en souffrance</div>
                    )}
                  </div>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB: QuickBooks Dashboard */}
      {/* ================================================================ */}
      {tab === "qbo_dashboard" && (
        <div className="space-y-6">
          {qboDashLoading && !qboDash && (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          )}

          {!qboStatus?.isConnected && !qboDashLoading && (
            <Card><CardContent className="p-12 text-center">
              <Plug className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-[15px] font-semibold text-slate-900">QuickBooks non connecté</h3>
              <p className="mt-1 text-[13px] text-slate-500">Configurez QuickBooks dans Paramètres → Intégrations</p>
            </CardContent></Card>
          )}

          {qboDash && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center text-white text-[8px] font-bold">QB</div>
                  <span className="text-[14px] font-semibold text-slate-900">{qboDash.companyName || "QuickBooks"}</span>
                  {qboDash.sandbox && <Badge variant="warning" className="text-[9px]">Sandbox</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={loadQboDashboard} loading={qboDashLoading}><RefreshCw className="h-3 w-3" /> Actualiser</Button>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard label="Comptes à recevoir" value={fmtMoney(qboDash.kpis.totalReceivable)} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
                <KpiCard label="En souffrance" value={fmtMoney(qboDash.kpis.totalOverdue)} icon={<AlertTriangle className="h-4 w-4 text-red-600" />} bg="bg-red-50" />
                <KpiCard label="Total facturé (payé)" value={fmtMoney(qboDash.kpis.totalPaid)} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
                <KpiCard label="Facture moyenne" value={fmtMoney(qboDash.kpis.avgInvoiceAmount)} icon={<Receipt className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
                <KpiCard label="Délai paiement moy." value={`${qboDash.kpis.avgDaysToPayment}j`} icon={<Clock className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
              </div>

              {/* P&L + Balance Sheet summary */}
              {(qboDash.pnlSummary || qboDash.bsSummary) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {qboDash.pnlSummary && (
                    <Card>
                      <CardContent className="p-5">
                        <h3 className="text-[15px] font-semibold text-slate-900 mb-1">Résultat net (P&L)</h3>
                        <p className="text-[11px] text-slate-400 mb-4">{qboDash.pnlSummary.period ? `${qboDash.pnlSummary.period.start} au ${qboDash.pnlSummary.period.end}` : "12 derniers mois"}</p>
                        <div className="space-y-3">
                          <div className="flex justify-between"><span className="text-[13px] text-slate-600">Revenus</span><span className="text-[13px] font-bold text-emerald-700 tabular-nums">{fmtMoney(qboDash.pnlSummary.totalIncome)}</span></div>
                          <div className="flex justify-between"><span className="text-[13px] text-slate-600">Coût des marchandises</span><span className="text-[13px] text-slate-700 tabular-nums">-{fmtMoney(qboDash.pnlSummary.totalCOGS)}</span></div>
                          <div className="flex justify-between border-t border-slate-100 pt-2"><span className="text-[13px] font-medium text-slate-700">Profit brut</span><span className="text-[13px] font-bold text-slate-800 tabular-nums">{fmtMoney(qboDash.pnlSummary.grossProfit)}</span></div>
                          <div className="flex justify-between"><span className="text-[13px] text-slate-600">Dépenses</span><span className="text-[13px] text-slate-700 tabular-nums">-{fmtMoney(qboDash.pnlSummary.totalExpenses)}</span></div>
                          <div className="flex justify-between border-t-2 border-slate-300 pt-2"><span className="text-[14px] font-semibold text-slate-900">Résultat net</span><span className={cn("text-[16px] font-bold tabular-nums", qboDash.pnlSummary.netIncome >= 0 ? "text-emerald-700" : "text-red-600")}>{fmtMoney(qboDash.pnlSummary.netIncome)}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {qboDash.bsSummary && (
                    <Card>
                      <CardContent className="p-5">
                        <h3 className="text-[15px] font-semibold text-slate-900 mb-1">Bilan</h3>
                        <p className="text-[11px] text-slate-400 mb-4">Au {qboDash.bsSummary.asOf || "—"}</p>
                        <div className="space-y-3">
                          <div className="flex justify-between"><span className="text-[13px] text-slate-600">Total des actifs</span><span className="text-[13px] font-bold text-blue-700 tabular-nums">{fmtMoney(qboDash.bsSummary.totalAssets)}</span></div>
                          <div className="flex justify-between"><span className="text-[13px] text-slate-600">Passifs + capitaux propres</span><span className="text-[13px] font-bold text-slate-800 tabular-nums">{fmtMoney(qboDash.bsSummary.totalLiabilitiesAndEquity)}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Invoice Aging */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Vieillissement des comptes à recevoir</h3>
                  <div className="grid grid-cols-5 gap-3 text-center">
                    {[
                      { label: "Courant", value: qboDash.aging.current, color: "bg-emerald-500" },
                      { label: "1-30 jours", value: qboDash.aging.days30, color: "bg-amber-500" },
                      { label: "31-60 jours", value: qboDash.aging.days60, color: "bg-orange-500" },
                      { label: "61-90 jours", value: qboDash.aging.days90, color: "bg-red-500" },
                      { label: "90+ jours", value: qboDash.aging.over90, color: "bg-red-700" },
                    ].map((a) => (
                      <div key={a.label}>
                        <div className={cn("h-2 rounded-full mb-2", a.color)} style={{ opacity: a.value > 0 ? 1 : 0.2 }} />
                        <p className="text-[11px] text-slate-500">{a.label}</p>
                        <p className="text-[14px] font-bold text-slate-900 tabular-nums">{fmtMoney(a.value)}</p>
                      </div>
                    ))}
                  </div>
                  {/* Aging bar */}
                  {qboDash.kpis.totalReceivable > 0 && (
                    <div className="mt-4 h-4 rounded-full bg-slate-100 overflow-hidden flex">
                      {[
                        { value: qboDash.aging.current, color: "bg-emerald-500" },
                        { value: qboDash.aging.days30, color: "bg-amber-500" },
                        { value: qboDash.aging.days60, color: "bg-orange-500" },
                        { value: qboDash.aging.days90, color: "bg-red-500" },
                        { value: qboDash.aging.over90, color: "bg-red-700" },
                      ].map((a, i) => (
                        <div key={i} className={cn("h-full transition-all", a.color)} style={{ width: `${(a.value / qboDash.kpis.totalReceivable) * 100}%` }} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Monthly Revenue Chart */}
              {qboDash.monthlyRevenue.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Historique des revenus (factures)</h3>
                    {(() => {
                      const maxVal = Math.max(...qboDash.monthlyRevenue.map((m) => m.invoiced), 1);
                      const MONTHS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
                      return (
                        <>
                          <div className="flex items-end gap-1 h-32">
                            {qboDash.monthlyRevenue.map((m) => {
                              const pctInv = (m.invoiced / maxVal) * 100;
                              const pctPaid = m.invoiced > 0 ? (m.paid / m.invoiced) * 100 : 0;
                              const [, mo] = m.month.split("-");
                              return (
                                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                                  <div className="w-full relative" style={{ height: "112px" }}>
                                    <div className="absolute bottom-0 left-0 right-0 rounded-t bg-blue-200 transition-all" style={{ height: `${Math.max(pctInv, 3)}%` }}>
                                      <div className="absolute bottom-0 left-0 right-0 rounded-t bg-emerald-500 transition-all" style={{ height: `${pctPaid}%` }} />
                                    </div>
                                  </div>
                                  <span className="text-[9px] text-slate-400">{MONTHS[parseInt(mo, 10) - 1]}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="h-2 w-2 rounded-full bg-emerald-500" /> Payé</div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="h-2 w-2 rounded-full bg-blue-200" /> Facturé</div>
                          </div>
                          {/* Monthly table */}
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-[12px]">
                              <thead><tr className="border-b border-slate-200 text-left">
                                <th className="pb-2 font-medium text-slate-500">Mois</th>
                                <th className="pb-2 font-medium text-slate-500 text-right">Facturé</th>
                                <th className="pb-2 font-medium text-slate-500 text-right">Payé</th>
                                <th className="pb-2 font-medium text-slate-500 text-right">Factures</th>
                              </tr></thead>
                              <tbody className="divide-y divide-slate-100">
                                {qboDash.monthlyRevenue.map((m) => (
                                  <tr key={m.month}>
                                    <td className="py-2 text-slate-700 font-medium">{m.month}</td>
                                    <td className="py-2 text-right tabular-nums text-blue-700 font-medium">{fmtMoney(m.invoiced)}</td>
                                    <td className="py-2 text-right tabular-nums text-emerald-700 font-medium">{fmtMoney(m.paid)}</td>
                                    <td className="py-2 text-right tabular-nums text-slate-600">{m.count}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue by Customer */}
                {qboDash.revenueByCustomer.length > 0 && (
                  <Card>
                    <CardContent className="p-5">
                      <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Revenus par client</h3>
                      <div className="space-y-2.5">
                        {qboDash.revenueByCustomer.slice(0, 10).map((c) => {
                          const max = qboDash.revenueByCustomer[0]?.invoiced || 1;
                          return (
                            <div key={c.name} className="flex items-center gap-3">
                              <span className="text-[12px] text-slate-700 w-36 truncate font-medium">{c.name}</span>
                              <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(c.invoiced / max) * 100}%` }} />
                              </div>
                              <span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(c.invoiced)}</span>
                              <span className="text-[10px] text-slate-400 w-8 text-right">{c.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Customer Balances */}
                {qboDash.customerBalances.length > 0 && (
                  <Card>
                    <CardContent className="p-5">
                      <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Soldes clients</h3>
                      <div className="space-y-2">
                        {qboDash.customerBalances.slice(0, 10).map((c) => (
                          <div key={c.id} className="flex items-center justify-between py-1">
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-blue-700 truncate">{c.displayName}</p>
                              {c.email && <p className="text-[11px] text-slate-500">{c.email}</p>}
                            </div>
                            <span className="text-[14px] font-bold text-amber-700 tabular-nums shrink-0 ml-3">{fmtMoney(c.balance)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Top Overdue Invoices */}
              {qboDash.topOverdue.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" /> Factures en souffrance
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                        <th className="px-4 py-3 font-medium text-slate-500">N°</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Date facture</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Échéance</th>
                        <th className="px-4 py-3 font-medium text-slate-500 text-right">Montant</th>
                        <th className="px-4 py-3 font-medium text-slate-500 text-right">Solde dû</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {qboDash.topOverdue.map((inv) => (
                          <tr key={inv.id} className="hover:bg-red-50/30">
                            <td className="px-4 py-3 font-medium text-slate-900 tabular-nums">{inv.docNumber || "—"}</td>
                            <td className="px-4 py-3"><span className="font-semibold text-blue-700">{inv.customerName}</span></td>
                            <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums">{inv.txnDate ? fmtDate(inv.txnDate) : "—"}</td>
                            <td className="px-4 py-3 text-[12px] text-red-600 font-medium tabular-nums">{inv.dueDate ? fmtDate(inv.dueDate) : "—"}</td>
                            <td className="px-4 py-3 tabular-nums text-right text-slate-700">{fmtMoney(inv.totalAmount)}</td>
                            <td className="px-4 py-3 font-bold tabular-nums text-right text-red-700">{fmtMoney(inv.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Recent Payments */}
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-slate-500" /> Paiements récents
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {qboDash.recentPayments.map((p) => (
                    <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/80">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-blue-700 truncate">{p.customerName}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{fmtDate(p.txnDate)}</p>
                      </div>
                      <span className="text-[14px] font-bold text-emerald-700 tabular-nums shrink-0 ml-3">+{fmtMoney(p.totalAmount)}</span>
                    </div>
                  ))}
                  {qboDash.recentPayments.length === 0 && (
                    <div className="px-5 py-8 text-center text-slate-400 text-[13px]">Aucun paiement récent</div>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Widget sidebar */}
      <WidgetSidebar page="finances" open={showWidgetSidebar} onClose={() => setShowWidgetSidebar(false)} />
    </div>
  );
}

// ===========================================================================
// KPI Card
// ===========================================================================
function KpiCard({ label, value, trend, icon, bg, onClick }: {
  label: string; value: string | number; trend?: number; icon: React.ReactNode; bg: string; onClick?: () => void;
}) {
  return (
    <Card className={onClick ? "cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all" : ""} onClick={onClick}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", bg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 truncate">{label}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
            {trend !== undefined && trend !== 0 && (
              <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", trend > 0 ? "text-emerald-600" : "text-red-600")}>
                {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
