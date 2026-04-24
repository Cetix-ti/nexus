"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText, Plus, Clock, Send, Calendar, Building2, Loader2, Trash2,
  Mail, Download, Eye, Printer, CheckCircle2, X, Pencil, Save,
  ArrowLeft, LayoutDashboard, Ticket, DollarSign, AlertTriangle,
  ShieldCheck, Timer, PieChart, MapPin, Moon, TrendingUp, BarChart3,
  Users, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DashboardGrid, type DashboardItem } from "@/components/widgets/dashboard-grid";
import { WidgetSidebar } from "@/components/widgets/widget-sidebar";
import { AnalyticsSectionTabs } from "@/components/analytics/section-tabs";

// ===========================================================================
// Types
// ===========================================================================
interface ScheduledReport {
  id: string;
  name: string;
  description: string;
  type: string;
  frequency: string;
  recipients: string[];
  organizationId: string | null;
  organizationName: string | null;
  lastSentAt: string | null;
  nextSendAt: string | null;
  isActive: boolean;
  format: string;
  widgets: string[];
  createdAt: string;
}

const WIDGET_OPTIONS = [
  { id: "ticket_kpis", label: "KPIs Tickets" },
  { id: "finance_kpis", label: "KPIs Financiers" },
  { id: "monthly_trend", label: "Tendance mensuelle" },
  { id: "tickets_status", label: "Tickets par statut" },
  { id: "tickets_priority", label: "Tickets par priorité" },
  { id: "tickets_type", label: "Tickets par type" },
  { id: "tickets_org", label: "Tickets par client" },
  { id: "agent_performance", label: "Performance techniciens" },
  { id: "coverage_breakdown", label: "Répartition couverture" },
  { id: "revenue_by_org", label: "Revenus par client" },
  { id: "contract_usage", label: "Utilisation contrats" },
  { id: "top_tickets", label: "Top tickets par temps" },
  { id: "projection", label: "Projection mensuelle" },
  { id: "qbo_kpis", label: "KPIs QuickBooks" },
  { id: "qbo_aging", label: "Vieillissement comptes" },
  { id: "qbo_pnl", label: "Résultat net (P&L)" },
];

// ===========================================================================
// Constants
// ===========================================================================
const REPORT_TYPES = [
  { id: "monthly_billing", label: "Facturation mensuelle", icon: "💰" },
  { id: "ticket_summary", label: "Sommaire des tickets", icon: "🎫" },
  { id: "sla_compliance", label: "Conformité SLA", icon: "🛡️" },
  { id: "time_tracking", label: "Feuilles de temps", icon: "⏱️" },
  { id: "asset_inventory", label: "Inventaire des actifs", icon: "💻" },
  { id: "project_status", label: "État des projets", icon: "📊" },
  { id: "executive_summary", label: "Sommaire exécutif", icon: "📋" },
  { id: "custom", label: "Personnalisé", icon: "✏️" },
];

const FREQUENCIES = [
  { id: "weekly", label: "Hebdomadaire" },
  { id: "biweekly", label: "Aux deux semaines" },
  { id: "monthly", label: "Mensuel" },
  { id: "quarterly", label: "Trimestriel" },
  { id: "on_demand", label: "Sur demande" },
];

const FORMATS = [
  { id: "pdf", label: "PDF" },
  { id: "excel", label: "Excel" },
  { id: "html_email", label: "Courriel HTML" },
];

const FREQUENCY_LABELS: Record<string, string> = Object.fromEntries(FREQUENCIES.map((f) => [f.id, f.label]));
const TYPE_LABELS: Record<string, string> = Object.fromEntries(REPORT_TYPES.map((t) => [t.id, t.label]));
const FORMAT_LABELS: Record<string, string> = Object.fromEntries(FORMATS.map((f) => [f.id, f.label]));

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("fr-CA"); }

// ===========================================================================
// Persistence (localStorage for now)
// ===========================================================================
const STORAGE_KEY = "nexus:scheduled-reports";
function loadReports(): ScheduledReport[] { try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveReports(reports: ScheduledReport[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)); } catch {} }

// ===========================================================================
// Page
// ===========================================================================
export default function AnalyticsReportsPage() {
  const [reports, setReports] = useState<ScheduledReport[]>(() => loadReports());
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  // Form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("monthly_billing");
  const [formFreq, setFormFreq] = useState("monthly");
  const [formFormat, setFormFormat] = useState("pdf");
  const [formOrg, setFormOrg] = useState("all");
  const [formRecipients, setFormRecipients] = useState("");
  const [formWidgets, setFormWidgets] = useState<string[]>([]);

  // Widgets custom créés dans /analytics/widgets + dashboards custom créés
  // dans /analytics/dashboards — on les charge pour pouvoir les sélectionner
  // dans le rapport et "importer depuis un dashboard" pour pré-remplir
  // la sélection de widgets.
  const [customWidgets, setCustomWidgets] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [customDashboards, setCustomDashboards] = useState<Array<{ id: string; label: string; description: string; widgets: string[] }>>([]);
  useEffect(() => {
    try {
      const w = localStorage.getItem("nexus:custom-widgets-v2");
      if (w) {
        const parsed = JSON.parse(w);
        if (Array.isArray(parsed)) setCustomWidgets(parsed.map((x: { id: string; name: string; description?: string }) => ({
          id: x.id, name: x.name, description: x.description ?? "",
        })));
      }
    } catch {}
    try {
      const d = localStorage.getItem("nexus:reports:custom");
      if (d) {
        const parsed = JSON.parse(d);
        if (Array.isArray(parsed)) setCustomDashboards(parsed.map((r: { id: string; label: string; description?: string; widgets?: string[] }) => ({
          id: r.id, label: r.label, description: r.description ?? "", widgets: Array.isArray(r.widgets) ? r.widgets : [],
        })));
      }
    } catch {}
  }, [showCreate]); // recharge à chaque ouverture du formulaire

  // View/edit report content
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showWidgetSidebar, setShowWidgetSidebar] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportDataLoading, setReportDataLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/organizations").then((r) => r.ok ? r.json() : []).then((d) => setOrgs(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Load report data when viewing
  useEffect(() => {
    if (viewingId) {
      setReportDataLoading(true);
      fetch("/api/v1/reports/global?days=30")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setReportData(d))
        .catch(() => {})
        .finally(() => setReportDataLoading(false));
    }
  }, [viewingId]);

  // Report layout management
  const viewingReport = viewingId ? reports.find((r) => r.id === viewingId) : null;
  const LAYOUT_PREFIX = "nexus:report-content:";

  function getReportItems(report: ScheduledReport): DashboardItem[] {
    try {
      const saved = localStorage.getItem(`${LAYOUT_PREFIX}${report.id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return (report.widgets || []).map((wId, i) => ({ id: `ri_${wId}_${i}`, widgetId: wId, w: 10, h: 3 }));
  }

  function saveReportItems(reportId: string, items: DashboardItem[]) {
    try { localStorage.setItem(`${LAYOUT_PREFIX}${reportId}`, JSON.stringify(items)); } catch {}
  }

  const [reportItems, setReportItems] = useState<DashboardItem[]>([]);

  useEffect(() => {
    if (viewingReport) setReportItems(getReportItems(viewingReport));
  }, [viewingId]);

  function handleReportReorder(items: DashboardItem[]) { setReportItems(items); if (viewingId) saveReportItems(viewingId, items); }
  function handleReportRemove(id: string) { const u = reportItems.filter((i) => i.id !== id); setReportItems(u); if (viewingId) saveReportItems(viewingId, u); }
  function handleReportResize(id: string, w: number, h: number) { const u = reportItems.map((i) => i.id === id ? { ...i, w, h } : i); setReportItems(u); if (viewingId) saveReportItems(viewingId, u); }
  function handleReportAddWidget(defId: string) {
    const newItem: DashboardItem = { id: `ri_${defId}_${Date.now()}`, widgetId: defId, w: 10, h: 3 };
    const u = [...reportItems, newItem]; setReportItems(u); if (viewingId) saveReportItems(viewingId, u);
    // Also update the report's widget list
    const updated = reports.map((r) => r.id === viewingId ? { ...r, widgets: u.map((i) => i.widgetId) } : r);
    setReports(updated); saveReports(updated);
  }

  // Widget renderer for reports
  function fmtMoney(v: number) { return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }); }
  function fmtHours(h: number) { return `${h.toLocaleString("fr-CA", { maximumFractionDigits: 1 })}h`; }

  function renderReportWidget(widgetId: string) {
    const d = reportData;
    if (!d) return <div className="p-4 text-center text-slate-400 text-[12px]">Chargement...</div>;
    const tk = d.ticketKpis;
    const fk = d.financeKpis;
    switch (widgetId) {
      case "ticket_kpis": return tk ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-3"><StatCard l="Créés" v={tk.createdInPeriod} /><StatCard l="Résolus" v={tk.resolvedInPeriod} /><StatCard l="Ouverts" v={tk.openTickets} /><StatCard l="SLA dépassés" v={tk.slaBreached} /><StatCard l="Conformité SLA" v={`${tk.slaCompliance}%`} /><StatCard l="Résolution moy." v={tk.avgResolutionHours != null ? `${tk.avgResolutionHours}h` : "—"} /></div> : null;
      case "finance_kpis": return fk ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3"><StatCard l="Revenus" v={fmtMoney(fk.totalRevenue)} /><StatCard l="Heures" v={fmtHours(fk.totalHours)} /><StatCard l="Taux facturable" v={`${fk.billableRate}%`} /><StatCard l="Taux horaire" v={fmtMoney(fk.avgHourlyRate)} /><StatCard l="Contrats actifs" v={fk.activeContractsCount} /></div> : null;
      case "projection": return fk ? <Card><CardContent className="p-4 flex items-center justify-between"><div><p className="text-[14px] font-semibold text-slate-900">Projection mensuelle</p><p className="text-[12px] text-slate-500">Moyenne quotidienne</p></div><div className="text-right"><p className="text-xl font-bold text-emerald-700 tabular-nums">{fmtMoney(fk.projectedMonthlyRevenue)}</p></div></CardContent></Card> : null;
      case "monthly_trend": return d.monthlyBreakdown?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Tendance mensuelle</h3><div className="overflow-x-auto"><table className="w-full text-[12px]"><thead><tr className="border-b border-slate-200"><th className="pb-2 text-left text-slate-500">Mois</th><th className="pb-2 text-right text-slate-500">Heures</th><th className="pb-2 text-right text-slate-500">Revenus</th></tr></thead><tbody>{d.monthlyBreakdown.map((m: any) => <tr key={m.month} className="border-b border-slate-100"><td className="py-1.5 text-slate-700">{m.month}</td><td className="py-1.5 text-right tabular-nums">{fmtHours(m.hours)}</td><td className="py-1.5 text-right tabular-nums font-medium">{fmtMoney(m.revenue)}</td></tr>)}</tbody></table></div></CardContent></Card> : null;
      case "tickets_status": return d.ticketStats?.byStatus?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Par statut</h3>{d.ticketStats.byStatus.map((s: any) => <div key={s.status} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{s.status}</span><span className="text-[12px] font-bold text-slate-900">{s.count}</span></div>)}</CardContent></Card> : null;
      case "tickets_priority": return d.ticketStats?.byPriority?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Par priorité</h3>{d.ticketStats.byPriority.map((p: any) => <div key={p.priority} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{p.priority}</span><span className="text-[12px] font-bold text-slate-900">{p.count}</span></div>)}</CardContent></Card> : null;
      case "tickets_type": return d.ticketStats?.byType?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Par type</h3>{d.ticketStats.byType.map((t: any) => <div key={t.type} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{t.type}</span><span className="text-[12px] font-bold text-slate-900">{t.count}</span></div>)}</CardContent></Card> : null;
      case "tickets_org": return d.ticketStats?.byOrg?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Tickets par client</h3>{d.ticketStats.byOrg.slice(0, 10).map((o: any) => <div key={o.organizationId} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{o.organizationName}</span><span className="text-[12px] font-bold text-slate-900">{o.count}</span></div>)}</CardContent></Card> : null;
      case "agent_performance": return d.agentBreakdown?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Performance techniciens</h3>{d.agentBreakdown.slice(0, 8).map((a: any) => <div key={a.agentName} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{a.agentName}</span><div className="flex gap-3"><span className="text-[11px] text-slate-500">{fmtHours(a.hours)}</span><span className="text-[12px] font-bold text-slate-900">{fmtMoney(a.revenue)}</span></div></div>)}</CardContent></Card> : null;
      case "coverage_breakdown": return d.coverageBreakdown?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Répartition couverture</h3>{d.coverageBreakdown.map((c: any) => <div key={c.status} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{c.status}</span><div className="flex gap-3"><span className="text-[11px] text-slate-500">{fmtHours(c.hours)}</span><span className="text-[12px] font-bold text-slate-900">{fmtMoney(c.revenue)}</span></div></div>)}</CardContent></Card> : null;
      case "revenue_by_org": return d.revenueByOrg?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Revenus par client</h3>{d.revenueByOrg.slice(0, 10).map((o: any) => <div key={o.organizationId} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{o.organizationName}</span><span className="text-[12px] font-bold text-emerald-700 tabular-nums">{fmtMoney(o.revenue)}</span></div>)}</CardContent></Card> : null;
      case "contract_usage": return d.contractUsage?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Utilisation contrats</h3>{d.contractUsage.map((c: any) => <div key={c.id} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">{c.name}</span><span className="text-[12px] font-bold tabular-nums">{c.usagePercent}%</span></div>)}</CardContent></Card> : null;
      case "top_tickets": return d.topTickets?.length > 0 ? <Card><CardContent className="p-4"><h3 className="text-[14px] font-semibold text-slate-900 mb-3">Top tickets</h3>{d.topTickets.slice(0, 8).map((t: any) => <div key={t.ticketNumber} className="flex justify-between py-1 border-b border-slate-100"><span className="text-[12px] text-slate-600">#{t.ticketNumber} {t.subject}</span><span className="text-[12px] font-bold tabular-nums">{fmtHours(t.hours)}</span></div>)}</CardContent></Card> : null;
      case "qbo_kpis": return <Card><CardContent className="p-4 text-center text-[12px] text-slate-500">KPIs QuickBooks — chargement depuis l&apos;onglet Finances</CardContent></Card>;
      case "qbo_aging": return <Card><CardContent className="p-4 text-center text-[12px] text-slate-500">Vieillissement des comptes</CardContent></Card>;
      case "qbo_pnl": return <Card><CardContent className="p-4 text-center text-[12px] text-slate-500">Résultat net (P&L)</CardContent></Card>;
      default: return <Card><CardContent className="p-4 text-center text-slate-400 text-[12px]">Widget « {widgetId} »</CardContent></Card>;
    }
  }

  function resetForm() {
    setFormName(""); setFormDesc(""); setFormType("monthly_billing"); setFormFreq("monthly"); setFormFormat("pdf"); setFormOrg("all"); setFormRecipients(""); setFormWidgets([]);
    setEditingId(null);
  }

  function startEdit(r: ScheduledReport) {
    setFormName(r.name); setFormDesc(r.description); setFormType(r.type); setFormFreq(r.frequency);
    setFormFormat(r.format); setFormOrg(r.organizationId || "all");
    setFormRecipients(r.recipients.join(", ")); setFormWidgets(r.widgets || []);
    setEditingId(r.id); setShowCreate(true);
  }

  function saveReport() {
    if (!formName.trim()) return;
    const now = new Date();
    const nextSend = formFreq === "on_demand" ? null : (() => {
      const d = new Date(now);
      if (formFreq === "weekly") d.setDate(d.getDate() + 7);
      else if (formFreq === "biweekly") d.setDate(d.getDate() + 14);
      else if (formFreq === "monthly") d.setMonth(d.getMonth() + 1, 1);
      else if (formFreq === "quarterly") d.setMonth(d.getMonth() + 3, 1);
      return d.toISOString();
    })();

    const report: ScheduledReport = {
      id: editingId || `sr_${Date.now()}`,
      name: formName.trim(),
      description: formDesc.trim(),
      type: formType,
      frequency: formFreq,
      recipients: formRecipients.split(",").map((e) => e.trim()).filter(Boolean),
      organizationId: formOrg === "all" ? null : formOrg,
      organizationName: formOrg === "all" ? null : orgs.find((o) => o.id === formOrg)?.name ?? null,
      lastSentAt: editingId ? reports.find((r) => r.id === editingId)?.lastSentAt ?? null : null,
      nextSendAt: nextSend,
      isActive: editingId ? reports.find((r) => r.id === editingId)?.isActive ?? true : true,
      format: formFormat,
      widgets: formWidgets,
      createdAt: editingId ? reports.find((r) => r.id === editingId)?.createdAt ?? now.toISOString() : now.toISOString(),
    };

    const updated = editingId ? reports.map((r) => r.id === editingId ? report : r) : [...reports, report];
    setReports(updated);
    saveReports(updated);
    setShowCreate(false);
    resetForm();
  }

  function toggleActive(id: string) {
    const updated = reports.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r);
    setReports(updated);
    saveReports(updated);
  }

  function deleteReport(id: string) {
    if (!confirm("Supprimer ce rapport programmé ?")) return;
    const updated = reports.filter((r) => r.id !== id);
    setReports(updated);
    saveReports(updated);
  }

  function sendNow(report: ScheduledReport) {
    // Simulate sending
    const updated = reports.map((r) => r.id === report.id ? { ...r, lastSentAt: new Date().toISOString() } : r);
    setReports(updated);
    saveReports(updated);
    alert(`Rapport « ${report.name} » envoyé à ${report.recipients.length} destinataire(s)`);
  }

  const activeReports = reports.filter((r) => r.isActive);
  const inactiveReports = reports.filter((r) => !r.isActive);

  return (
    <div className="space-y-5">
      <AnalyticsSectionTabs section="reports" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Rapports programmés</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">Rapports imprimables et planifiés pour vos clients</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> Nouveau rapport programmé
        </Button>
      </div>

      {/* Rapport mensuel client — accès rapide */}
      <Link href="/analytics/monthly-reports" className="block">
        <Card className="border-blue-200 bg-blue-50/40 hover:bg-blue-50 transition-colors">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-slate-900">
                Rapports mensuels client (PDF)
              </p>
              <p className="text-[12px] text-slate-600">
                Livrable mensuel par client — heures facturées, tickets,
                déplacements, demandeurs. Générés depuis la fiche organisation.
              </p>
            </div>
            <Button variant="outline" size="sm">Voir les rapports →</Button>
          </CardContent>
        </Card>
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center"><FileText className="h-4 w-4 text-blue-600" /></div>
          <div><p className="text-[11px] text-slate-500">Total</p><p className="text-lg font-bold text-slate-900">{reports.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
          <div><p className="text-[11px] text-slate-500">Actifs</p><p className="text-lg font-bold text-slate-900">{activeReports.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center"><Calendar className="h-4 w-4 text-amber-600" /></div>
          <div><p className="text-[11px] text-slate-500">Programmés</p><p className="text-lg font-bold text-slate-900">{reports.filter((r) => r.frequency !== "on_demand" && r.isActive).length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center"><Mail className="h-4 w-4 text-violet-600" /></div>
          <div><p className="text-[11px] text-slate-500">Destinataires</p><p className="text-lg font-bold text-slate-900">{new Set(reports.flatMap((r) => r.recipients)).size}</p></div>
        </CardContent></Card>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-blue-200 bg-blue-50/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-900">{editingId ? "Modifier le rapport" : "Nouveau rapport programmé"}</h3>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label="Nom du rapport *" placeholder="Ex: Facturation mensuelle — Acme Corp" value={formName} onChange={(e) => setFormName(e.target.value)} />
              <Input label="Description" placeholder="Description optionnelle" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Type de rapport</label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.icon} {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Fréquence</label>
                <Select value={formFreq} onValueChange={setFormFreq}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Format</label>
                <Select value={formFormat} onValueChange={setFormFormat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Client</label>
                <Select value={formOrg} onValueChange={setFormOrg}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les clients (global)</SelectItem>
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-700 mb-1">Destinataires (courriels séparés par des virgules)</label>
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none" placeholder="client@entreprise.ca, comptable@entreprise.ca" value={formRecipients} onChange={(e) => setFormRecipients(e.target.value)} />
            </div>
            {/* Import depuis un dashboard existant */}
            {customDashboards.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <label className="block text-[12px] font-medium text-slate-700 mb-1.5">
                  Importer les widgets depuis un dashboard
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value=""
                    onValueChange={(v) => {
                      const dash = customDashboards.find((d) => d.id === v);
                      if (dash) {
                        // Merge sans doublon : garde les widgets déjà cochés et
                        // ajoute ceux du dashboard qui ne sont pas encore là.
                        setFormWidgets((prev) => Array.from(new Set([...prev, ...dash.widgets])));
                      }
                    }}
                  >
                    <SelectTrigger className="flex-1 min-w-[200px]">
                      <SelectValue placeholder="Choisir un dashboard…" />
                    </SelectTrigger>
                    <SelectContent>
                      {customDashboards.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.label} ({d.widgets.length} widgets)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormWidgets([])}
                    disabled={formWidgets.length === 0}
                  >
                    Tout vider
                  </Button>
                </div>
                <p className="mt-1.5 text-[10.5px] text-violet-700">
                  Sélectionne un dashboard pour ajouter tous ses widgets à ce rapport (merge sans doublon).
                </p>
              </div>
            )}

            {/* Widget selector — prédéfinis */}
            <div>
              <label className="block text-[12px] font-medium text-slate-700 mb-2">Widgets prédéfinis</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {WIDGET_OPTIONS.map((w) => {
                  const selected = formWidgets.includes(w.id);
                  return (
                    <button key={w.id} onClick={() => setFormWidgets((prev) => selected ? prev.filter((id) => id !== w.id) : [...prev, w.id])}
                      className={cn("rounded-lg px-3 py-2 text-[11px] font-medium text-left transition-all ring-1 ring-inset",
                        selected ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-white text-slate-600 ring-slate-200 hover:ring-blue-200"
                      )}>
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Widget selector — custom */}
            {customWidgets.length > 0 && (
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-2">
                  Widgets personnalisés ({customWidgets.length})
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {customWidgets.map((w) => {
                    const selected = formWidgets.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        onClick={() => setFormWidgets((prev) => selected ? prev.filter((id) => id !== w.id) : [...prev, w.id])}
                        className={cn("rounded-lg px-3 py-2 text-[11px] font-medium text-left transition-all ring-1 ring-inset",
                          selected ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-white text-slate-600 ring-slate-200 hover:ring-violet-200"
                        )}
                        title={w.description}
                      >
                        {w.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-[10.5px] text-slate-500">
              {formWidgets.length} section{formWidgets.length !== 1 ? "s" : ""} sélectionnée{formWidgets.length !== 1 ? "s" : ""}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); resetForm(); }}>Annuler</Button>
              <Button variant="primary" size="sm" onClick={saveReport} disabled={!formName.trim()}>
                <Save className="h-3.5 w-3.5" /> {editingId ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reports list */}
      {reports.length === 0 && !showCreate && (
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-[15px] font-semibold text-slate-900">Aucun rapport programmé</h3>
          <p className="mt-1 text-[13px] text-slate-500">Créez des rapports automatisés à envoyer à vos clients.</p>
          <Button variant="primary" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Créer un rapport
          </Button>
        </CardContent></Card>
      )}

      {reports.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">Rapport</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Fréquence</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Format</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Destinataires</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-center">Sections</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Dernier envoi</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Prochain</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{r.name}</p>
                      {r.description && <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{r.description}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge variant="default" className="text-[10px]">{TYPE_LABELS[r.type] ?? r.type}</Badge></td>
                    <td className="px-4 py-3 text-[12px] text-slate-600">{r.organizationName ?? "Global"}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-600">{FREQUENCY_LABELS[r.frequency] ?? r.frequency}</td>
                    <td className="px-4 py-3"><Badge variant="default" className="text-[10px] uppercase">{r.format}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-slate-400" />
                        <span className="text-[12px] text-slate-600">{r.recipients.length}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-[12px]">
                      <span className={cn("font-medium", (r.widgets?.length ?? 0) > 0 ? "text-blue-600" : "text-slate-400")}>{r.widgets?.length ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums">{r.lastSentAt ? fmtDate(r.lastSentAt) : "—"}</td>
                    <td className="px-4 py-3 text-[12px] tabular-nums">
                      {r.nextSendAt ? <span className="text-blue-600 font-medium">{fmtDate(r.nextSendAt)}</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(r.id)}>
                        <Badge variant={r.isActive ? "success" : "default"} className="text-[10px] cursor-pointer">
                          {r.isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewingId(r.id)} title="Voir / Éditer le contenu">
                          <Eye className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(r)} title="Modifier les paramètres">
                          <Pencil className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => sendNow(r)} title="Envoyer maintenant">
                          <Send className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => deleteReport(r.id)} title="Supprimer">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ================================================================ */}
      {/* REPORT CONTENT VIEW / EDITOR */}
      {/* ================================================================ */}
      {viewingId && viewingReport && (
        <div className="space-y-5">
          {/* Report header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <div>
              <button onClick={() => { setViewingId(null); setEditMode(false); }} className="flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-700 font-medium mb-1">
                <ArrowLeft className="h-3.5 w-3.5" /> Retour à la liste
              </button>
              <h2 className="text-[18px] font-semibold text-slate-900">{viewingReport.name}</h2>
              <p className="text-[12px] text-slate-500">{viewingReport.description} · {FORMAT_LABELS[viewingReport.format] ?? viewingReport.format} · {FREQUENCY_LABELS[viewingReport.frequency]}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={editMode ? "primary" : "outline"} size="sm" onClick={() => setEditMode(!editMode)}>
                <LayoutDashboard className="h-3.5 w-3.5" />
                {editMode ? "Terminer" : "Éditer le contenu"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.print()} title="Imprimer">
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Report content with DashboardGrid */}
          {reportDataLoading && !reportData && (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          )}

          {reportItems.length === 0 && !reportDataLoading && (
            <Card><CardContent className="p-12 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-[15px] font-semibold text-slate-900">Aucune section</h3>
              <p className="mt-1 text-[13px] text-slate-500">Cliquez « Éditer le contenu » puis ajoutez des widgets.</p>
            </CardContent></Card>
          )}

          {reportItems.length > 0 && reportData && (
            <DashboardGrid
              items={reportItems}
              editMode={editMode}
              onReorder={handleReportReorder}
              onRemove={handleReportRemove}
              onResize={handleReportResize}
              onAddClick={() => setShowWidgetSidebar(true)}
              renderWidget={renderReportWidget}
            />
          )}

          <WidgetSidebar
            page="reports"
            open={showWidgetSidebar}
            onClose={() => setShowWidgetSidebar(false)}
            activeWidgetIds={reportItems.map((i) => i.widgetId)}
            onAdd={handleReportAddWidget}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ l, v }: { l: string; v: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
      <p className="text-[10px] text-slate-500 mb-0.5">{l}</p>
      <p className="text-[15px] font-bold text-slate-900 tabular-nums">{v}</p>
    </div>
  );
}
