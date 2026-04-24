"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock, DollarSign, TrendingUp, PieChart, MapPin, Moon, Ticket, Loader2,
  BarChart3, Building2, Receipt, FileText, Wallet, ShoppingCart, Package,
  CheckCircle2, AlertTriangle, Briefcase, CreditCard, Plus, XCircle,
  ArrowRight, Calendar, Truck, Paperclip, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TimeEntryCalendar } from "@/components/billing/time-entry-calendar";
import { QuickAddOnsiteTimeModal } from "@/components/my-space/quick-add-onsite-time-modal";

// ===========================================================================
// Types
// ===========================================================================
interface MySpaceData {
  user: { id: string; firstName: string; lastName: string; email: string; avatar: string | null; role: string; createdAt: string } | null;
  period: { days: number; since: string };
  kpis: {
    totalHours: number; billableHours: number; billableRate: number; totalRevenue: number;
    avgHourlyRate: number; onsiteHours: number; afterHoursHours: number;
    assignedOpen: number; resolvedInPeriod: number; createdInPeriod: number;
  };
  monthlyBreakdown: { month: string; hours: number; revenue: number; billableHours: number }[];
  coverageBreakdown: { status: string; hours: number; revenue: number }[];
  topOrgs: { organizationId: string; organizationName: string; hours: number; revenue: number }[];
  recentTimeEntries: {
    id: string; date: string; ticketNumber: number; ticketSubject: string; ticketId: string;
    durationMinutes: number; amount: number | null; coverageStatus: string;
    isOnsite: boolean; isAfterHours: boolean; description: string;
  }[];
  expenseReports: {
    id: string; title: string; status: string; totalAmount: number; entryCount: number;
    billableAmount: number; categories: string[]; periodStart: string | null; periodEnd: string | null; createdAt: string;
  }[];
  purchaseOrders: {
    id: string; poNumber: string; title: string; status: string; vendorName: string;
    organizationName: string | null; totalAmount: number; itemCount: number; receivedCount: number;
    expectedDate: string | null; createdAt: string;
  }[];
}

interface MyTicket {
  id: string; number: number; subject: string; status: string; priority: string;
  organizationName: string; createdAt: string; dueAt: string | null;
}

// ===========================================================================
// Tabs
// ===========================================================================
const TABS = [
  { key: "stats", label: "Statistiques", icon: BarChart3 },
  { key: "time", label: "Mes heures", icon: Clock },
  { key: "tickets", label: "Mes tickets", icon: Ticket },
  { key: "expenses", label: "Mes dépenses", icon: Wallet },
  { key: "po", label: "Mes commandes", icon: ShoppingCart },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// ===========================================================================
// Labels
// ===========================================================================
const COVERAGE_LABELS: Record<string, string> = {
  billable: "Facturable", included_in_contract: "Inclus contrat", hour_bank: "Banque d'heures",
  hour_bank_overage: "Dépassement banque", msp_overage: "Hors forfait", non_billable: "Non facturable",
  pending: "En attente", travel_billable: "Déplacement",
};
const COVERAGE_COLORS: Record<string, string> = {
  billable: "bg-emerald-500", included_in_contract: "bg-blue-500", hour_bank: "bg-violet-500",
  hour_bank_overage: "bg-amber-500", msp_overage: "bg-orange-500", non_billable: "bg-slate-400",
  pending: "bg-slate-300", travel_billable: "bg-cyan-500",
};
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau", OPEN: "Ouvert", IN_PROGRESS: "En cours", ON_SITE: "Sur place",
  WAITING_CLIENT: "En attente", SCHEDULED: "Planifié", RESOLVED: "Résolu", CLOSED: "Fermé",
};
const STATUS_COLORS: Record<string, string> = {
  NEW: "primary", OPEN: "warning", IN_PROGRESS: "warning", ON_SITE: "default",
  WAITING_CLIENT: "default", RESOLVED: "success", CLOSED: "default", SCHEDULED: "default",
};
const PRIORITY_LABELS: Record<string, string> = { CRITICAL: "Critique", HIGH: "Élevée", MEDIUM: "Moyenne", LOW: "Faible" };
const PRIORITY_COLORS: Record<string, string> = { CRITICAL: "danger", HIGH: "warning", MEDIUM: "default", LOW: "success" };
const EXP_STATUS: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: "Brouillon", variant: "default" }, SUBMITTED: { label: "Soumis", variant: "warning" },
  APPROVED: { label: "Approuvé", variant: "success" }, REJECTED: { label: "Rejeté", variant: "danger" },
  REIMBURSED: { label: "Remboursé", variant: "success" },
};
const PO_STATUS: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: "Brouillon", variant: "default" }, SUBMITTED: { label: "Soumis", variant: "warning" },
  APPROVED: { label: "Approuvé", variant: "success" }, ORDERED: { label: "Commandé", variant: "primary" },
  PARTIAL: { label: "Partiel", variant: "warning" }, RECEIVED: { label: "Reçu", variant: "success" },
  CANCELLED: { label: "Annulé", variant: "danger" },
};
const EXPENSE_CATEGORIES = ["Déplacement", "Hébergement", "Repas", "Transport", "Matériel", "Logiciel", "Télécom", "Formation", "Sous-traitance", "Autre"];
const MONTH_NAMES = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function fmtMoney(v: number) { return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("fr-CA"); }
function monthLabel(key: string) { const [, m] = key.split("-"); return MONTH_NAMES[parseInt(m, 10) - 1] || key; }

// ===========================================================================
// Page
// ===========================================================================
export default function MySpacePage() {
  const router = useRouter();
  const [data, setData] = useState<MySpaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("stats");
  const [days, setDays] = useState("30");

  // Tickets
  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // Expense form
  const [showExpForm, setShowExpForm] = useState(false);
  const [expSubmitting, setExpSubmitting] = useState(false);
  const [expForm, setExpForm] = useState({ title: "", periodStart: "", periodEnd: "", notes: "" });
  const [expEntries, setExpEntries] = useState<Array<{
    date: string; category: string; description: string; amount: number;
    vendor: string; isBillable: boolean; receiptUrl?: string | null;
    receiptName?: string; receiptUploading?: boolean;
  }>>([{ date: new Date().toISOString().split("T")[0], category: "Déplacement", description: "", amount: 0, vendor: "", isBillable: false }]);
  // Allocations de l'agent connecté (cellulaire, internet…) — lecture seule
  // dans Mes dépenses. Un admin configure côté settings.
  const [myAllowances, setMyAllowances] = useState<Array<{
    id: string; label: string; amountMonthly: number; active: boolean;
  }>>([]);
  // Kilométrage du mois en cours — calculé côté serveur à partir des time
  // entries onsite + OrgMileageRate. Inclut la liste détaillée des
  // trips pour les injecter comme lignes virtuelles dans la table
  // "Toutes mes dépenses" (l'agent est remboursé même si billToClient=false).
  interface MileageTrip {
    organizationId: string;
    organizationName: string;
    date: string;               // YYYY-MM-DD
    kmRoundTrip: number | null;
    amount: number | null;
    configured: boolean;
    /** true = facturé au client · false = absorbé par Cetix (agent reste remboursé). */
    billToClient: boolean;
  }
  const [mileage, setMileage] = useState<{
    tripCount: number; totalKm: number; totalAmount: number;
    unconfiguredCount: number; monthLabel: string;
    trips: MileageTrip[];
  } | null>(null);
  // Déplacements détectés cette semaine mais non facturés par AUCUN agent
  // pour ce client — suggestion au tech de les ajouter à un ticket.
  const [missingTravels, setMissingTravels] = useState<Array<{
    eventId: string; startsAt: string; organizationName: string; organizationId: string;
    // true = facturable au client · l'ajout passe par le modal avec ticket.
    // false = non facturable · ajout direct en un clic en tant que dépense.
    billToClient: boolean;
  }>>([]);
  const [quickTripBusy, setQuickTripBusy] = useState<string | null>(null);
  const [quickAddTravel, setQuickAddTravel] = useState<{
    startsAt: string; organizationId: string; organizationName: string;
  } | null>(null);
  // Filtre mois pour "Toutes mes dépenses" + kilométrage. Format YYYY-MM.
  // Défaut = mois courant. Utilisé pour les deux endpoints.
  const [expensesMonth, setExpensesMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  // Liste PLATE de toutes les dépenses individuelles de l'agent — à
  // travers tous ses rapports. Affichée en tableau dans l'onglet
  // "Mes dépenses", en complément du tableau des rapports groupés.
  interface ExpenseEntryRow {
    id: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    vendor: string | null;
    receiptUrl: string | null;
    isBillable: boolean;
    organizationName: string | null;
    report: { id: string; title: string; status: string; periodStart: string | null; periodEnd: string | null };
  }
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntryRow[]>([]);

  // PO form
  const [showPoForm, setShowPoForm] = useState(false);
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poForm, setPoForm] = useState({ title: "", vendorName: "", vendorContact: "", organizationId: "", notes: "", expectedDate: "" });
  const [poItems, setPoItems] = useState([{ description: "", partNumber: "", quantity: 1, unitPrice: 0 }]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  // Load main data
  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/my-space?days=${days}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Load tickets
  useEffect(() => {
    if (tab === "tickets") {
      setTicketsLoading(true);
      fetch("/api/v1/tickets?assignee=me&limit=50")
        .then((r) => r.ok ? r.json() : [])
        .then((d) => {
          const arr = Array.isArray(d) ? d : d?.data ?? d?.tickets ?? [];
          setMyTickets(arr.map((t: any) => ({
            id: t.id, number: t.number ?? 0, subject: t.subject ?? t.title ?? "",
            status: t.status ?? "OPEN", priority: t.priority ?? "MEDIUM",
            organizationName: t.organizationName ?? t.organization?.name ?? t.organization ?? "—",
            createdAt: t.createdAt ?? "", dueAt: t.dueAt ?? null,
          })));
        })
        .catch(() => setMyTickets([]))
        .finally(() => setTicketsLoading(false));
    }
  }, [tab]);

  // Load orgs for PO form
  useEffect(() => {
    if (showPoForm && orgs.length === 0) {
      fetch("/api/v1/organizations").then((r) => r.ok ? r.json() : []).then((d) => setOrgs(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [showPoForm]);

  // Allocations récurrentes (cellulaire, internet, etc.) + kilométrage du
  // mois — affichés en bandeaux au-dessus de la liste des dépenses quand
  // on est sur l'onglet. Exposé en callback pour re-fetcher manuellement
  // (bouton Actualiser) et au retour sur la fenêtre — évite que l'user
  // voie des valeurs périmées après avoir configuré kilométrage en
  // Paramètres dans un autre onglet.
  const [mileageRefreshing, setMileageRefreshing] = useState(false);
  const loadExpensesTab = useCallback(async () => {
    setMileageRefreshing(true);
    try {
      // Allocations (déclenche un chaîne fetch-me → fetch-allowances)
      const mePromise = fetch("/api/v1/me")
        .then((r) => (r.ok ? r.json() : null))
        .then(async (me) => {
          if (!me?.id) return;
          const r = await fetch(`/api/v1/users/${me.id}/allowances`);
          const d = r.ok ? await r.json() : { data: [] };
          setMyAllowances(d.data ?? []);
        })
        .catch(() => {});
      // Kilométrage — cache-bust via timestamp pour forcer une lecture
      // fraîche de TenantSetting + OrgMileageRate (sinon le navigateur
      // peut resservir une réponse HTTP déjà vue).
      const mileagePromise = fetch(`/api/v1/my-space/mileage?month=${expensesMonth}&_=${Date.now()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setMileage({
            tripCount: d.tripCount,
            totalKm: d.totalKm,
            totalAmount: d.totalAmount,
            unconfiguredCount: d.unconfiguredCount,
            monthLabel: d.month?.label ?? "",
            trips: Array.isArray(d.trips) ? d.trips : [],
          });
        })
        .catch(() => {});
      const travelPromise = fetch(`/api/v1/my-space/travel-audit?month=${expensesMonth}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setMissingTravels(d?.missing ?? []))
        .catch(() => {});
      // Liste plate des dépenses individuelles (toutes, tous rapports).
      const entriesPromise = fetch(`/api/v1/my-space/expense-entries?month=${expensesMonth}&_=${Date.now()}`)
        .then((r) => (r.ok ? r.json() : { entries: [] }))
        .then((d) => setExpenseEntries(d.entries ?? []))
        .catch(() => setExpenseEntries([]));
      await Promise.all([mePromise, mileagePromise, travelPromise, entriesPromise]);
    } finally {
      setMileageRefreshing(false);
    }
  }, [expensesMonth]);

  useEffect(() => {
    if (tab !== "expenses") return;
    loadExpensesTab();
  }, [tab, loadExpensesTab]);

  // Refetch quand la fenêtre redevient visible (retour depuis Paramètres
  // dans un autre onglet / reveil d'un ordinateur portable). Critique :
  // après avoir configuré un taux $/km ou km A/R par client ailleurs,
  // l'user veut voir les nouvelles valeurs sans devoir recharger la page.
  useEffect(() => {
    if (tab !== "expenses") return;
    function onVisibility() {
      if (document.visibilityState === "visible") loadExpensesTab();
    }
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [tab, loadExpensesTab]);

  // Upload d'une facture/reçu pour une entrée de dépense. Fire-and-forget,
  // on enregistre l'URL MinIO retournée dans le state local.
  async function uploadReceipt(idx: number, file: File) {
    setExpEntries((p) => {
      const v = [...p];
      v[idx] = { ...v[idx], receiptUploading: true };
      return v;
    });
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("prefix", "expense-receipts");
      const res = await fetch("/api/v1/uploads", { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setExpEntries((p) => {
        const v = [...p];
        v[idx] = { ...v[idx], receiptUrl: d.url, receiptName: d.name, receiptUploading: false };
        return v;
      });
    } catch {
      setExpEntries((p) => {
        const v = [...p];
        v[idx] = { ...v[idx], receiptUploading: false };
        return v;
      });
      alert("Échec du téléversement de la facture.");
    }
  }

  // Expense report submit
  async function submitExpense() {
    if (!expForm.title.trim()) return;
    const validEntries = expEntries.filter((e) => e.description.trim() && e.amount > 0);
    if (validEntries.length === 0) return;
    setExpSubmitting(true);
    try {
      const res = await fetch("/api/v1/expense-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...expForm, entries: validEntries }),
      });
      if (res.ok) {
        setShowExpForm(false);
        setExpForm({ title: "", periodStart: "", periodEnd: "", notes: "" });
        setExpEntries([{ date: new Date().toISOString().split("T")[0], category: "Déplacement", description: "", amount: 0, vendor: "", isBillable: false }]);
        load();
      }
    } catch {} finally { setExpSubmitting(false); }
  }

  // PO submit
  async function submitPo() {
    if (!poForm.title.trim() || !poForm.vendorName.trim()) return;
    const validItems = poItems.filter((i) => i.description.trim());
    if (validItems.length === 0) return;
    setPoSubmitting(true);
    try {
      const res = await fetch("/api/v1/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...poForm, organizationId: poForm.organizationId || undefined, expectedDate: poForm.expectedDate || undefined, items: validItems }),
      });
      if (res.ok) {
        setShowPoForm(false);
        setPoForm({ title: "", vendorName: "", vendorContact: "", organizationId: "", notes: "", expectedDate: "" });
        setPoItems([{ description: "", partNumber: "", quantity: 1, unitPrice: 0 }]);
        load();
      }
    } catch {} finally { setPoSubmitting(false); }
  }

  const poFormSubtotal = poItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const poFormTax = Math.round(poFormSubtotal * 0.14975 * 100) / 100;
  const poFormTotal = Math.round((poFormSubtotal + poFormTax) * 100) / 100;

  if (loading && !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  const k = data?.kpis ?? { totalHours: 0, billableHours: 0, billableRate: 0, totalRevenue: 0, avgHourlyRate: 0, onsiteHours: 0, afterHoursHours: 0, assignedOpen: 0, resolvedInPeriod: 0, createdInPeriod: 0 };
  const u = data?.user;
  const periodLabel = days === "7" ? "7 derniers jours" : days === "30" ? "30 derniers jours" : days === "90" ? "3 derniers mois" : "12 derniers mois";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {u?.avatar ? (
            <img src={u.avatar} alt="" className="h-12 w-12 rounded-xl object-cover ring-2 ring-blue-100" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[16px] font-bold shadow-sm">
              {u ? `${u.firstName[0]}${u.lastName[0]}` : "?"}
            </div>
          )}
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Mon espace</h1>
            <p className="text-[13px] text-slate-500">{u ? `${u.firstName} ${u.lastName}` : ""} — {periodLabel}</p>
          </div>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 jours</SelectItem>
            <SelectItem value="30">30 jours</SelectItem>
            <SelectItem value="90">3 mois</SelectItem>
            <SelectItem value="365">12 mois</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
                tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              )}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/* STATS */}
      {/* ================================================================ */}
      {tab === "stats" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <KpiCard label="Heures totales" value={`${k.totalHours}h`} icon={<Clock className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" onClick={() => setTab("time")} />
            <KpiCard label="Facturables" value={`${k.billableHours}h`} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Taux facturable" value={`${k.billableRate}%`} icon={<PieChart className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
            <KpiCard label="Revenus générés" value={fmtMoney(k.totalRevenue)} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Tickets ouverts" value={k.assignedOpen} icon={<Ticket className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" onClick={() => setTab("tickets")} />
            <KpiCard label="Résolus" value={k.resolvedInPeriod} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Taux horaire moy." value={fmtMoney(k.avgHourlyRate)} icon={<DollarSign className="h-4 w-4 text-slate-600" />} bg="bg-slate-50" sub="/h" />
            <KpiCard label="Sur place" value={`${k.onsiteHours}h`} icon={<MapPin className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
            <KpiCard label="Hors horaire" value={`${k.afterHoursHours}h`} icon={<Moon className="h-4 w-4 text-indigo-600" />} bg="bg-indigo-50" />
          </div>

          {/* Monthly trend */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-slate-500" /> Ma tendance mensuelle</h3>
              {(data?.monthlyBreakdown?.length ?? 0) > 0 ? (
                <>
                  <div className="flex items-end gap-1 h-28">
                    {(data?.monthlyBreakdown ?? []).map((m) => {
                      const maxH = Math.max(...(data?.monthlyBreakdown ?? []).map((x) => x.hours), 1);
                      const pct = (m.hours / maxH) * 100;
                      const bp = m.hours > 0 ? (m.billableHours / m.hours) * 100 : 0;
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full relative" style={{ height: "100px" }}>
                            <div className="absolute bottom-0 left-0 right-0 rounded-t bg-slate-200 transition-all" style={{ height: `${Math.max(pct, 2)}%` }}>
                              <div className="absolute bottom-0 left-0 right-0 rounded-t bg-blue-500 transition-all" style={{ height: `${bp}%` }} />
                            </div>
                          </div>
                          <span className="text-[9px] text-slate-400">{monthLabel(m.month)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="h-2 w-2 rounded-full bg-blue-500" /> Facturable</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><div className="h-2 w-2 rounded-full bg-slate-200" /> Total</div>
                  </div>
                </>
              ) : <p className="text-[12px] text-slate-400 py-8 text-center">Aucune donnée pour cette période</p>}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-500" /> Mes clients principaux</h3>
                {(data?.topOrgs?.length ?? 0) > 0 ? (
                  <div className="space-y-2.5">
                    {(data?.topOrgs ?? []).map((o) => {
                      const max = (data?.topOrgs ?? [])[0]?.hours || 1;
                      return (
                        <Link key={o.organizationId} href={`/organizations/${o.organizationId}`} className="flex items-center gap-3 group rounded-lg px-1 -mx-1 py-0.5 hover:bg-slate-50 transition-colors">
                          <span className="text-[12px] text-slate-700 w-32 truncate font-medium group-hover:text-blue-600 transition-colors">{o.organizationName}</span>
                          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(o.hours / max) * 100}%` }} />
                          </div>
                          <span className="text-[12px] font-medium text-slate-600 tabular-nums w-12 text-right">{o.hours}h</span>
                          <span className="text-[12px] font-bold text-slate-800 tabular-nums w-24 text-right">{fmtMoney(o.revenue)}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : <p className="text-[12px] text-slate-400 py-6 text-center">Aucune donnée</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2"><Receipt className="h-4 w-4 text-slate-500" /> Répartition</h3>
                {(data?.coverageBreakdown?.length ?? 0) > 0 ? (
                  <>
                    <div className="space-y-2.5">
                      {(data?.coverageBreakdown ?? []).map((c) => (
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
                        {(data?.coverageBreakdown ?? []).map((c) => (
                          <div key={c.status} className={cn("h-full", COVERAGE_COLORS[c.status] ?? "bg-slate-400")} style={{ width: `${(c.hours / k.totalHours) * 100}%` }} />
                        ))}
                      </div>
                    )}
                  </>
                ) : <p className="text-[12px] text-slate-400 py-6 text-center">Aucune donnée</p>}
              </CardContent>
            </Card>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickLink label="Ma journée" href="/tickets/my-day" icon={<Calendar className="h-4 w-4" />} />
            <QuickLink label="Saisir du temps" href="/billing" icon={<Clock className="h-4 w-4" />} />
            <QuickLink label="Nouvelle dépense" onClick={() => { setTab("expenses"); setShowExpForm(true); }} icon={<Wallet className="h-4 w-4" />} />
            <QuickLink label="Bon de commande" onClick={() => { setTab("po"); setShowPoForm(true); }} icon={<ShoppingCart className="h-4 w-4" />} />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MES HEURES */}
      {/* ================================================================ */}
      {tab === "time" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Heures totales" value={`${k.totalHours}h`} icon={<Clock className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
            <KpiCard label="Facturables" value={`${k.billableHours}h`} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Sur place" value={`${k.onsiteHours}h`} icon={<MapPin className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
            <KpiCard label="Revenus" value={fmtMoney(k.totalRevenue)} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
          </div>

          {/* Sub-vue : Calendrier (défaut) ou Liste */}
          <TimeEntryCalendar />

          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <h3 className="text-[15px] font-semibold text-slate-900">Saisies récentes</h3>
            <Link href="/billing" className="text-[12px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              Voir tout dans Préfacturation <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {(data?.recentTimeEntries ?? []).map((e) => (
              <Card key={e.id} onClick={() => router.push(`/tickets/${e.ticketId}`)} className="p-3 cursor-pointer hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <Link href={`/tickets/${e.ticketId}`} className="text-[12px] text-blue-600 hover:underline font-medium">#{e.ticketNumber}</Link>
                    <p className="text-[12px] text-slate-700 truncate">{e.ticketSubject}</p>
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{fmtDate(e.date)}</span>
                </div>
                {e.description && <p className="text-[11.5px] text-slate-600 mb-1.5 line-clamp-2">{e.description}</p>}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className={cn("h-2 w-2 rounded-full", COVERAGE_COLORS[e.coverageStatus] ?? "bg-slate-300")} />
                    <span className="text-[11px] text-slate-600">{COVERAGE_LABELS[e.coverageStatus] ?? e.coverageStatus}</span>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums text-slate-800">
                    {Math.round(e.durationMinutes / 6) / 10}h
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="overflow-hidden hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                    <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Ticket</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Description</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-right">Durée</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-right">Montant</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Couverture</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.recentTimeEntries ?? []).map((e) => (
                    <tr key={e.id} className="hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => router.push(`/tickets/${e.ticketId}`)}>
                      <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/tickets/${e.ticketId}`} className="text-[12px] text-blue-600 hover:underline">#{e.ticketNumber}</Link>
                        <span className="text-[11px] text-slate-500 ml-1.5 truncate max-w-[150px] inline-block align-bottom">{e.ticketSubject}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-600 max-w-[200px] truncate">{e.description || "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 tabular-nums text-right">{Math.round(e.durationMinutes / 6) / 10}h</td>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(data?.recentTimeEntries?.length ?? 0) === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-[13px]">Aucune saisie de temps pour cette période</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ================================================================ */}
      {/* MES TICKETS */}
      {/* ================================================================ */}
      {tab === "tickets" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Assignés ouverts" value={k.assignedOpen} icon={<Ticket className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
            <KpiCard label="Résolus (période)" value={k.resolvedInPeriod} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Créés (période)" value={k.createdInPeriod} icon={<Ticket className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-slate-900">Mes tickets ouverts</h3>
            <div className="flex items-center gap-2">
              <Link href="/tickets/my-day" className="text-[12px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">Ma journée <ArrowRight className="h-3 w-3" /></Link>
              <Link href="/tickets/kanban" className="text-[12px] text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1">Kanban <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </div>

          {ticketsLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                      <th className="px-4 py-3 font-medium text-slate-500">N°</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Sujet</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Priorité</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Créé</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Échéance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myTickets.map((t) => (
                      <tr key={t.id} className="hover:bg-blue-50/50 cursor-pointer" onClick={() => window.location.href = `/tickets/${t.id}`}>
                        <td className="px-4 py-3 font-medium text-blue-600 tabular-nums">#{t.number}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium max-w-[250px] truncate">{t.subject}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-600">{t.organizationName}</td>
                        <td className="px-4 py-3"><Badge variant={(STATUS_COLORS[t.status] ?? "default") as any} className="text-[10px]">{STATUS_LABELS[t.status] ?? t.status}</Badge></td>
                        <td className="px-4 py-3"><Badge variant={(PRIORITY_COLORS[t.priority] ?? "default") as any} className="text-[10px]">{PRIORITY_LABELS[t.priority] ?? t.priority}</Badge></td>
                        <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums">{t.createdAt ? fmtDate(t.createdAt) : "—"}</td>
                        <td className="px-4 py-3 text-[12px] tabular-nums">
                          {t.dueAt ? <span className={new Date(t.dueAt) < new Date() ? "text-red-600 font-medium" : "text-slate-500"}>{fmtDate(t.dueAt)}</span> : "—"}
                        </td>
                      </tr>
                    ))}
                    {myTickets.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-[13px]">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-300" />
                        Aucun ticket assigné
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
      {/* MES DÉPENSES */}
      {/* ================================================================ */}
      {tab === "expenses" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Rapports" value={data?.expenseReports?.length ?? 0} icon={<Briefcase className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
            <KpiCard label="Total soumis" value={fmtMoney((data?.expenseReports ?? []).reduce((s, r) => s + r.totalAmount, 0))} icon={<Wallet className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="Facturable" value={fmtMoney((data?.expenseReports ?? []).reduce((s, r) => s + r.billableAmount, 0))} icon={<CreditCard className="h-4 w-4 text-violet-600" />} bg="bg-violet-50" />
          </div>

          {/* Alerte : déplacements détectés mais aucun agent n'a encore
              facturé onsite pour ce client ce jour-là. Le tech peut
              facturer un déplacement sur un ticket du client concerné. */}
          {missingTravels.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-amber-900">
                      {missingTravels.length} déplacement{missingTravels.length > 1 ? "s" : ""} potentiellement non facturé{missingTravels.length > 1 ? "s" : ""} · {mileage?.monthLabel || "ce mois"}
                    </p>
                    <p className="text-[11.5px] text-amber-800/80 mt-0.5">
                      Ces déplacements sont dans ton calendrier mais aucun tech n&apos;a encore enregistré de temps onsite pour ce client ce jour-là.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {missingTravels.slice(0, 5).map((m) => (
                        <li
                          key={m.eventId}
                          className="text-[12px] text-amber-900 flex items-center gap-2"
                        >
                          <span className="tabular-nums text-amber-700 w-14 shrink-0">
                            {new Date(m.startsAt).toLocaleDateString("fr-CA", { day: "2-digit", month: "short" })}
                          </span>
                          <span className="font-medium flex-1 min-w-0 truncate">
                            {m.organizationName}
                            {!m.billToClient && (
                              <span className="ml-1.5 text-[10px] text-amber-600 font-normal">(non facturé)</span>
                            )}
                          </span>
                          {m.billToClient ? (
                            <button
                              type="button"
                              onClick={() => setQuickAddTravel({
                                startsAt: m.startsAt,
                                organizationId: m.organizationId,
                                organizationName: m.organizationName,
                              })}
                              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                              Lier à un ticket
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={quickTripBusy === m.eventId}
                              onClick={async () => {
                                setQuickTripBusy(m.eventId);
                                try {
                                  const dateStr = m.startsAt.slice(0, 10); // YYYY-MM-DD
                                  const r = await fetch("/api/v1/my-space/quick-trip", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ organizationId: m.organizationId, date: dateStr }),
                                  });
                                  if (!r.ok) {
                                    const d = await r.json().catch(() => ({}));
                                    alert(d.error ?? `Erreur HTTP ${r.status}`);
                                    return;
                                  }
                                  await loadExpensesTab();
                                } finally {
                                  setQuickTripBusy(null);
                                }
                              }}
                              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition-colors disabled:opacity-50"
                            >
                              {quickTripBusy === m.eventId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              Ajouter à mes dépenses
                            </button>
                          )}
                        </li>
                      ))}
                      {missingTravels.length > 5 && (
                        <li className="text-[11.5px] text-amber-700 italic">
                          + {missingTravels.length - 5} autre{missingTravels.length - 5 > 1 ? "s" : ""}…
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Allocations récurrentes (cellulaire, internet) — versées par
              Cetix en plus des dépenses réelles. Visible en lecture seule ;
              un admin les configure. */}
          {myAllowances.filter((a) => a.active).length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[12.5px] font-semibold text-emerald-800 uppercase tracking-wider">
                      Allocations mensuelles
                    </p>
                    <p className="text-[12px] text-emerald-700/80 mt-0.5">
                      Montants versés automatiquement chaque mois. Se somment à tes dépenses.
                    </p>
                  </div>
                  <p className="text-[18px] font-bold text-emerald-700 tabular-nums">
                    {fmtMoney(
                      myAllowances.filter((a) => a.active).reduce((s, a) => s + a.amountMonthly, 0),
                    )}{" "}
                    <span className="text-[11px] font-normal text-emerald-600">/ mois</span>
                  </p>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {myAllowances.filter((a) => a.active).map((a) => (
                    <li
                      key={a.id}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] text-emerald-800 ring-1 ring-emerald-200"
                    >
                      <span className="font-medium">{a.label}</span>
                      <span className="tabular-nums font-semibold">{fmtMoney(a.amountMonthly)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Button variant="primary" size="sm" onClick={() => setShowExpForm(!showExpForm)}><Plus className="h-3.5 w-3.5" /> Ajouter une dépense</Button>

          {/* Create form */}
          {showExpForm && (
            <Card className="border-blue-200 bg-blue-50/20">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-slate-900">Ajouter une dépense</h3>
                  <button onClick={() => setShowExpForm(false)} className="text-slate-400 hover:text-slate-600"><XCircle className="h-5 w-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Input label="Titre *" placeholder="Ex: Déplacement Louiseville" value={expForm.title} onChange={(e) => setExpForm((p) => ({ ...p, title: e.target.value }))} />
                  <Input
                    label="Date"
                    type="date"
                    value={expForm.periodStart}
                    onChange={(e) => {
                      const v = e.target.value;
                      // Une seule date : on la stocke dans periodStart ET
                      // periodEnd pour garder la compat backend.
                      setExpForm((p) => ({ ...p, periodStart: v, periodEnd: v }));
                    }}
                  />
                  <Input label="Notes" placeholder="Optionnel" value={expForm.notes} onChange={(e) => setExpForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-slate-900">Entrées</h4>
                  <button onClick={() => setExpEntries((p) => [...p, { date: new Date().toISOString().split("T")[0], category: "Déplacement", description: "", amount: 0, vendor: "", isBillable: false }])} className="text-[12px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="h-3 w-3" /> Ajouter</button>
                </div>
                <div className="space-y-2">
                  {expEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-end gap-2 bg-white rounded-lg p-3 ring-1 ring-slate-200/60">
                      <div className="w-32">
                        <label className="text-[11px] text-slate-500 mb-1 block">Date</label>
                        <input type="date" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={entry.date} onChange={(e) => { const v = [...expEntries]; v[idx] = { ...v[idx], date: e.target.value }; setExpEntries(v); }} />
                      </div>
                      <div className="w-36">
                        <label className="text-[11px] text-slate-500 mb-1 block">Catégorie</label>
                        <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={entry.category} onChange={(e) => { const v = [...expEntries]; v[idx] = { ...v[idx], category: e.target.value }; setExpEntries(v); }}>
                          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] text-slate-500 mb-1 block">Description *</label>
                        <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Description" value={entry.description} onChange={(e) => { const v = [...expEntries]; v[idx] = { ...v[idx], description: e.target.value }; setExpEntries(v); }} />
                      </div>
                      <div className="w-24">
                        <label className="text-[11px] text-slate-500 mb-1 block">Montant $</label>
                        <input type="number" min={0} step={0.01} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-right tabular-nums" value={entry.amount || ""} onChange={(e) => { const v = [...expEntries]; v[idx] = { ...v[idx], amount: parseFloat(e.target.value) || 0 }; setExpEntries(v); }} />
                      </div>
                      <div className="w-28">
                        <label className="text-[11px] text-slate-500 mb-1 block">Fournisseur</label>
                        <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Optionnel" value={entry.vendor} onChange={(e) => { const v = [...expEntries]; v[idx] = { ...v[idx], vendor: e.target.value }; setExpEntries(v); }} />
                      </div>
                      <label className="flex items-center gap-1.5 pb-1.5 cursor-pointer">
                        <input type="checkbox" className="rounded border-slate-300" checked={entry.isBillable} onChange={(e) => { const v = [...expEntries]; v[idx] = { ...v[idx], isBillable: e.target.checked }; setExpEntries(v); }} />
                        <span className="text-[11px] text-slate-600">Fact.</span>
                      </label>
                      {/* Bouton facture/reçu — upload vers MinIO et stocke
                          l'URL dans entry.receiptUrl (envoyée au submit). */}
                      <label className="pb-1.5 cursor-pointer" title={entry.receiptUrl ? "Facture jointe" : "Joindre la facture"}>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadReceipt(idx, f);
                            e.target.value = "";
                          }}
                        />
                        <span className={cn(
                          "inline-flex items-center justify-center h-7 w-7 rounded-md ring-1 transition-colors",
                          entry.receiptUploading
                            ? "bg-slate-100 text-slate-400 ring-slate-200"
                            : entry.receiptUrl
                              ? "bg-emerald-50 text-emerald-600 ring-emerald-200 hover:bg-emerald-100"
                              : "bg-white text-slate-400 ring-slate-200 hover:text-blue-600 hover:ring-blue-300",
                        )}>
                          {entry.receiptUploading ? (
                            <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </label>
                      {expEntries.length > 1 && <button onClick={() => setExpEntries((p) => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 pb-1.5"><XCircle className="h-4 w-4" /></button>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <p className="text-[14px] font-semibold text-slate-900">Total : <span className="text-lg tabular-nums">{fmtMoney(expEntries.reduce((s, e) => s + e.amount, 0))}</span></p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowExpForm(false)}>Annuler</Button>
                    <Button variant="primary" loading={expSubmitting} disabled={!expForm.title.trim() || !expEntries.some((e) => e.description.trim() && e.amount > 0)} onClick={submitExpense}>
                      <Wallet className="h-4 w-4" /> Soumettre
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Toutes les dépenses à plat — table triée par date desc.
              Permet de voir l'historique complet d'un coup d'œil sans
              ouvrir chaque rapport. Inclut aussi les trips de kilométrage
              (lignes virtuelles) car l'agent est remboursé indépendamment
              de billToClient — le kilométrage EST une dépense pour l'agent. */}
          <AllExpensesTable
            entries={expenseEntries}
            mileageTrips={mileage?.trips ?? []}
            month={expensesMonth}
            onMonthChange={setExpensesMonth}
            onDeleteEntry={async (entryId) => {
              const r = await fetch(`/api/v1/my-space/expense-entries/${entryId}`, { method: "DELETE" });
              if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                alert(d.error ?? `Erreur HTTP ${r.status}`);
                return;
              }
              await loadExpensesTab();
            }}
          />

          {/* Rapports groupés par période (ce qui était là avant). */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><Briefcase className="h-4 w-4 text-slate-500" /> Mes rapports de dépenses (par période)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                    <th className="px-4 py-3 font-medium text-slate-500">Titre</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Période</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-center">Entrées</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Catégories</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.expenseReports ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => router.push(`/my-space/expense/${r.id}`)}>
                      <td className="px-4 py-3 font-medium text-blue-600 hover:underline">{r.title}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums whitespace-nowrap">{r.periodStart ? fmtDate(r.periodStart) : "—"} — {r.periodEnd ? fmtDate(r.periodEnd) : "—"}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-600">{r.entryCount}</td>
                      <td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{r.categories.slice(0, 3).map((c) => <Badge key={c} variant="default" className="text-[9px]">{c}</Badge>)}</div></td>
                      <td className="px-4 py-3 font-bold tabular-nums text-right text-slate-800">{fmtMoney(r.totalAmount)}</td>
                      <td className="px-4 py-3"><Badge variant={(EXP_STATUS[r.status]?.variant ?? "default") as any} className="text-[10px]">{EXP_STATUS[r.status]?.label ?? r.status}</Badge></td>
                    </tr>
                  ))}
                  {(data?.expenseReports?.length ?? 0) === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-[13px]">
                      <Briefcase className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                      Aucune dépense — cliquez sur « Ajouter une dépense » pour en saisir une.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ================================================================ */}
      {/* MES COMMANDES */}
      {/* ================================================================ */}
      {tab === "po" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Commandes" value={data?.purchaseOrders?.length ?? 0} icon={<ShoppingCart className="h-4 w-4 text-blue-600" />} bg="bg-blue-50" />
            <KpiCard label="Valeur totale" value={fmtMoney((data?.purchaseOrders ?? []).reduce((s, po) => s + po.totalAmount, 0))} icon={<DollarSign className="h-4 w-4 text-emerald-600" />} bg="bg-emerald-50" />
            <KpiCard label="En attente" value={(data?.purchaseOrders ?? []).filter((po) => ["DRAFT", "SUBMITTED", "APPROVED", "ORDERED"].includes(po.status)).length} icon={<Clock className="h-4 w-4 text-amber-600" />} bg="bg-amber-50" />
          </div>

          <Button variant="primary" size="sm" onClick={() => setShowPoForm(!showPoForm)}><Plus className="h-3.5 w-3.5" /> Nouveau bon de commande</Button>

          {/* PO Form */}
          {showPoForm && (
            <Card className="border-blue-200 bg-blue-50/20">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-slate-900">Nouveau bon de commande</h3>
                  <button onClick={() => setShowPoForm(false)} className="text-slate-400 hover:text-slate-600"><XCircle className="h-5 w-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Input label="Titre *" placeholder="Ex: Serveur Dell PowerEdge" value={poForm.title} onChange={(e) => setPoForm((p) => ({ ...p, title: e.target.value }))} />
                  <Input label="Fournisseur *" placeholder="Nom du fournisseur" value={poForm.vendorName} onChange={(e) => setPoForm((p) => ({ ...p, vendorName: e.target.value }))} />
                  <Input label="Contact" placeholder="Courriel ou téléphone" value={poForm.vendorContact} onChange={(e) => setPoForm((p) => ({ ...p, vendorContact: e.target.value }))} />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-700">Client</label>
                    <Select value={poForm.organizationId} onValueChange={(v) => setPoForm((p) => ({ ...p, organizationId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Interne" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Achat interne</SelectItem>
                        {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input label="Livraison prévue" type="date" value={poForm.expectedDate} onChange={(e) => setPoForm((p) => ({ ...p, expectedDate: e.target.value }))} />
                  <Input label="Notes" placeholder="Optionnel" value={poForm.notes} onChange={(e) => setPoForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between"><h4 className="text-[13px] font-semibold text-slate-900">Articles</h4>
                  <button onClick={() => setPoItems((p) => [...p, { description: "", partNumber: "", quantity: 1, unitPrice: 0 }])} className="text-[12px] text-blue-600 font-medium flex items-center gap-1"><Plus className="h-3 w-3" /> Ajouter</button>
                </div>
                <div className="space-y-2">
                  {poItems.map((item, idx) => (
                    <div key={idx} className="flex items-end gap-2 bg-white rounded-lg p-3 ring-1 ring-slate-200/60">
                      <div className="flex-1"><label className="text-[11px] text-slate-500 mb-1 block">Description *</label>
                        <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={item.description} onChange={(e) => { const v = [...poItems]; v[idx] = { ...v[idx], description: e.target.value }; setPoItems(v); }} /></div>
                      <div className="w-28"><label className="text-[11px] text-slate-500 mb-1 block">N° pièce</label>
                        <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={item.partNumber} onChange={(e) => { const v = [...poItems]; v[idx] = { ...v[idx], partNumber: e.target.value }; setPoItems(v); }} /></div>
                      <div className="w-20"><label className="text-[11px] text-slate-500 mb-1 block">Qté</label>
                        <input type="number" min={1} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-center tabular-nums" value={item.quantity} onChange={(e) => { const v = [...poItems]; v[idx] = { ...v[idx], quantity: parseInt(e.target.value) || 1 }; setPoItems(v); }} /></div>
                      <div className="w-28"><label className="text-[11px] text-slate-500 mb-1 block">Prix unit. $</label>
                        <input type="number" min={0} step={0.01} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-right tabular-nums" value={item.unitPrice || ""} onChange={(e) => { const v = [...poItems]; v[idx] = { ...v[idx], unitPrice: parseFloat(e.target.value) || 0 }; setPoItems(v); }} /></div>
                      <div className="w-24 text-right"><label className="text-[11px] text-slate-500 mb-1 block">Total</label>
                        <p className="py-1.5 text-sm font-medium text-slate-800 tabular-nums">{fmtMoney(item.quantity * item.unitPrice)}</p></div>
                      {poItems.length > 1 && <button onClick={() => setPoItems((p) => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 pb-1.5"><XCircle className="h-4 w-4" /></button>}
                    </div>
                  ))}
                </div>
                <div className="flex items-end justify-between pt-3 border-t border-slate-200">
                  <div className="space-y-1 text-[13px]">
                    <div className="flex gap-8"><span className="text-slate-500 w-24">Sous-total</span><span className="font-medium text-slate-800 tabular-nums">{fmtMoney(poFormSubtotal)}</span></div>
                    <div className="flex gap-8"><span className="text-slate-500 w-24">Taxes</span><span className="text-slate-600 tabular-nums">{fmtMoney(poFormTax)}</span></div>
                    <div className="flex gap-8"><span className="font-semibold text-slate-900 w-24">Total</span><span className="font-bold text-lg text-slate-900 tabular-nums">{fmtMoney(poFormTotal)}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowPoForm(false)}>Annuler</Button>
                    <Button variant="primary" loading={poSubmitting} disabled={!poForm.title.trim() || !poForm.vendorName.trim() || !poItems.some((i) => i.description.trim())} onClick={submitPo}>
                      <ShoppingCart className="h-4 w-4" /> Créer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PO List */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-slate-500" /> Mes bons de commande</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                    <th className="px-4 py-3 font-medium text-slate-500">N° PO</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Titre</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Fournisseur</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-center">Articles</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Livraison</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.purchaseOrders ?? []).map((po) => (
                    <tr key={po.id} className="hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => router.push(`/my-space/po/${po.id}`)}>
                      <td className="px-4 py-3 font-medium text-blue-600 tabular-nums hover:underline">{po.poNumber}</td>
                      <td className="px-4 py-3 font-medium text-blue-600 hover:underline">{po.title}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-700">{po.vendorName}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-600">{po.organizationName || "Interne"}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{po.receivedCount}/{po.itemCount}</td>
                      <td className="px-4 py-3 font-bold tabular-nums text-right text-slate-900">{fmtMoney(po.totalAmount)}</td>
                      <td className="px-4 py-3"><Badge variant={(PO_STATUS[po.status]?.variant ?? "default") as any} className="text-[10px]">{PO_STATUS[po.status]?.label ?? po.status}</Badge></td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">{po.expectedDate ? fmtDate(po.expectedDate) : "—"}</td>
                    </tr>
                  ))}
                  {(data?.purchaseOrders?.length ?? 0) === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-[13px]">
                      <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                      Aucun bon de commande — cliquez sur « Nouveau bon de commande » pour en créer un.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {quickAddTravel && (
        <QuickAddOnsiteTimeModal
          open
          onClose={() => setQuickAddTravel(null)}
          eventDate={quickAddTravel.startsAt}
          organizationId={quickAddTravel.organizationId}
          organizationName={quickAddTravel.organizationName}
          onCreated={() => { setQuickAddTravel(null); loadExpensesTab(); }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Components
// ===========================================================================
function KpiCard({ label, value, icon, bg, sub, onClick }: {
  label: string; value: string | number; icon: React.ReactNode; bg: string; sub?: string; onClick?: () => void;
}) {
  return (
    <Card className={onClick ? "cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all" : ""} onClick={onClick}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", bg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 truncate">{label}</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{value}{sub && <span className="text-[12px] font-normal text-slate-400">{sub}</span>}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLink({ label, href, icon, onClick }: { label: string; href?: string; icon: React.ReactNode; onClick?: () => void }) {
  const cls = "flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200/60 hover:ring-blue-200 hover:shadow-sm transition-all cursor-pointer group";
  const inner = (
    <>
      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors shrink-0">{icon}</div>
      <span className="text-[13px] font-medium text-slate-700 group-hover:text-blue-700 transition-colors">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-400 ml-auto transition-colors" />
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button className={cls} onClick={onClick}>{inner}</button>;
}

// ===========================================================================
// AllExpensesTable — tableau plat de TOUTES les dépenses individuelles
// soumises par l'agent, tous rapports confondus. Affiche date, catégorie,
// description, fournisseur, organisation, montant, facturabilité, et
// lien vers le rapport parent (statut visible).
//
// Tri par défaut : date décroissante (plus récent en premier). Inclut
// un totalizer au bas (somme des montants affichés) pour un aperçu rapide.
// ===========================================================================
interface UnifiedExpenseRow {
  id: string;
  kind: "entry" | "mileage";       // source — détermine le rendu lié
  date: string;                     // ISO ou YYYY-MM-DD
  category: string;
  description: string;
  amount: number;
  vendor: string | null;
  receiptUrl: string | null;
  isBillable: boolean;              // pour entries : choix agent · pour mileage : toujours true (agent remboursé)
  organizationName: string | null;
  reportId: string | null;          // null pour les trips mileage
  reportTitle: string | null;
  reportStatus: string | null;
  mileageInfo: { km: number; configured: boolean; billToClient: boolean } | null;
}

function AllExpensesTable({ entries, mileageTrips, month, onMonthChange, onDeleteEntry }: {
  entries: Array<{
    id: string; date: string; category: string; description: string;
    amount: number; vendor: string | null; receiptUrl: string | null;
    isBillable: boolean; organizationName: string | null;
    report: { id: string; title: string; status: string; periodStart: string | null; periodEnd: string | null };
  }>;
  mileageTrips: Array<{
    organizationId: string; organizationName: string; date: string;
    kmRoundTrip: number | null; amount: number | null; configured: boolean;
    billToClient: boolean;
  }>;
  month: string;                 // YYYY-MM
  onMonthChange: (m: string) => void;
  onDeleteEntry: (entryId: string) => void | Promise<void>;
}) {
  const [filter, setFilter] = useState("");

  // Unification : on convertit entries réelles + trips kilométrage en
  // une seule liste de `UnifiedExpenseRow`. Les trips non configurés
  // (pas de OrgMileageRate) sont AFFICHÉS quand même avec montant 0$
  // et un badge "barème à configurer" — utile pour voir qu'une sortie
  // n'est pas encore remboursable.
  const unified: UnifiedExpenseRow[] = [
    ...entries.map((e) => ({
      id: `entry_${e.id}`,
      kind: "entry" as const,
      date: e.date,
      category: e.category,
      description: e.description,
      amount: e.amount,
      vendor: e.vendor,
      receiptUrl: e.receiptUrl,
      isBillable: e.isBillable,
      organizationName: e.organizationName,
      reportId: e.report.id,
      reportTitle: e.report.title,
      reportStatus: e.report.status,
      mileageInfo: null,
    })),
    ...mileageTrips.map((t) => ({
      id: `mileage_${t.organizationId}_${t.date}`,
      kind: "mileage" as const,
      date: t.date,
      category: "Kilométrage",
      description: t.billToClient
        ? `Déplacement — ${t.organizationName}`
        : `Déplacement (non facturé) — ${t.organizationName}`,
      amount: t.amount ?? 0,
      vendor: null,
      receiptUrl: null,
      // Reflète billToClient : ✓ si client facturé, — si Cetix absorbe.
      // Dans les deux cas l'agent est remboursé (ligne présente dans Mes dépenses).
      isBillable: t.billToClient,
      organizationName: t.organizationName,
      reportId: null,
      reportTitle: null,
      reportStatus: null,
      mileageInfo: { km: t.kmRoundTrip ?? 0, configured: t.configured, billToClient: t.billToClient },
    })),
  ].sort((a, b) => {
    // Tri chronologique ascendant (du plus ancien au plus récent).
    // Normalise sur `YYYY-MM-DD` car les entries réelles ont un ISO
    // complet ("2026-04-09T16:00:00.000Z") alors que les trips virtuels
    // utilisent un format date seulement ("2026-04-09") — sans trim,
    // localeCompare peut inverser l'ordre au sein d'une même journée.
    const ka = a.date.slice(0, 10);
    const kb = b.date.slice(0, 10);
    if (ka !== kb) return ka.localeCompare(kb);
    return a.date.localeCompare(b.date);
  });

  const filtered = unified.filter((e) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.vendor ?? "").toLowerCase().includes(q) ||
      (e.organizationName ?? "").toLowerCase().includes(q) ||
      (e.reportTitle ?? "").toLowerCase().includes(q)
    );
  });
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const totalBillable = filtered.filter((e) => e.isBillable).reduce((s, e) => s + e.amount, 0);

  // Options mois : 18 mois glissants (15 passés + courant + 2 à venir
  // pour pré-saisies). Génère YYYY-MM + label "mois yyyy" localisé fr-CA.
  const monthOptions: { value: string; label: string }[] = (() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -2; i <= 15; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
      opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return opts;
  })();

  const header = (
    <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
      <div>
        <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-500" /> Toutes mes dépenses
        </h3>
        {unified.length > 0 && (
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            {filtered.length} entrée{filtered.length > 1 ? "s" : ""} · {fmtMoney(total)}
            {totalBillable > 0 && <span className="text-emerald-600"> · {fmtMoney(totalBillable)} refacturables</span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          aria-label="Mois"
        >
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="w-56">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer…"
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>
    </div>
  );

  if (unified.length === 0) {
    return (
      <Card className="overflow-hidden">
        {header}
        <div className="p-10 text-center text-[13px] text-slate-400">
          <Receipt className="h-7 w-7 mx-auto mb-2 text-slate-300" />
          Aucune dépense pour ce mois.
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {header}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
              <th className="px-4 py-2.5 font-medium text-slate-500 whitespace-nowrap">Date</th>
              <th className="px-4 py-2.5 font-medium text-slate-500">Catégorie</th>
              <th className="px-4 py-2.5 font-medium text-slate-500">Description</th>
              <th className="px-4 py-2.5 font-medium text-slate-500">Fournisseur</th>
              <th className="px-4 py-2.5 font-medium text-slate-500">Client / Rapport</th>
              <th className="px-4 py-2.5 font-medium text-slate-500 text-right whitespace-nowrap">Montant</th>
              <th className="px-4 py-2.5 font-medium text-slate-500 text-center">Refact.</th>
              <th className="px-4 py-2.5 font-medium text-slate-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((e) => {
              const isMileage = e.kind === "mileage";
              return (
              <tr key={e.id} className={cn(
                "transition-colors",
                isMileage ? "bg-blue-50/20 hover:bg-blue-50/40" : "hover:bg-slate-50/50",
              )}>
                <td className="px-4 py-2.5 tabular-nums text-[12px] text-slate-600 whitespace-nowrap">
                  {fmtDate(e.date)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={isMileage ? "primary" : "default"}
                    className="text-[10px]"
                  >
                    {isMileage && <Truck className="h-2.5 w-2.5 mr-0.5 inline" />}
                    {e.category}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-slate-800 max-w-xs truncate" title={e.description}>
                  {e.description || <span className="text-slate-400 italic">—</span>}
                  {isMileage && e.mileageInfo && (
                    <span className="ml-1 text-[10.5px] text-blue-700 tabular-nums">
                      ({e.mileageInfo.km} km A/R)
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[12.5px] text-slate-600">
                  {e.vendor ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-[12px]">
                  {e.organizationName && (
                    <span className="inline-block text-slate-700 font-medium mr-1">{e.organizationName}</span>
                  )}
                  {isMileage ? (
                    <span className="text-[10.5px] text-slate-400 italic">
                      Calcul automatique
                    </span>
                  ) : e.reportId ? (
                    <>
                      <Link
                        href={`/my-space/expense/${e.reportId}`}
                        className="text-blue-600 hover:underline text-[11.5px]"
                      >
                        {e.reportTitle}
                      </Link>
                      {e.reportStatus && (
                        <Badge variant={(EXP_STATUS[e.reportStatus]?.variant ?? "default") as any} className="text-[9px] ml-1">
                          {EXP_STATUS[e.reportStatus]?.label ?? e.reportStatus}
                        </Badge>
                      )}
                    </>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                  {isMileage && e.mileageInfo && !e.mileageInfo.configured ? (
                    <span className="text-amber-600 text-[11px]" title="Barème kilométrage non configuré pour ce client">
                      Barème à configurer
                    </span>
                  ) : (
                    fmtMoney(e.amount)
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {e.isBillable ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 inline-block" />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex items-center gap-2">
                    {e.receiptUrl && (
                      <a
                        href={e.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Voir le reçu"
                        className="text-slate-400 hover:text-blue-600"
                      >
                        <Paperclip className="h-4 w-4 inline-block" />
                      </a>
                    )}
                    {/* Suppression : uniquement pour les entrées réelles
                        (pas pour les trips virtuels dérivés du TimeEntry)
                        et tant que le rapport est encore en DRAFT. */}
                    {e.kind === "entry" && e.reportStatus === "DRAFT" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm("Supprimer cette dépense ?")) return;
                          onDeleteEntry(e.id.replace(/^entry_/, ""));
                        }}
                        title="Supprimer cette dépense"
                        className="text-slate-400 hover:text-red-600"
                      >
                        <XCircle className="h-4 w-4 inline-block" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[12px] text-slate-400">
                Aucune dépense ne correspond à « {filter} ».
              </td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                <td colSpan={5} className="px-4 py-2.5 text-[12px] font-semibold text-slate-600">
                  Total ({filtered.length} entrée{filtered.length > 1 ? "s" : ""})
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">
                  {fmtMoney(total)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
