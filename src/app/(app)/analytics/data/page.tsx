"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Database, Variable, ArrowLeft, Search, Play, Loader2, Table,
  ChevronDown, ChevronRight, Filter, Hash, ToggleLeft, Calendar,
  Link2, Type, Plus, Pencil, Trash2, X, Save, Copy, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnalyticsSectionTabs } from "@/components/analytics/section-tabs";

// ===========================================================================
// Types
// ===========================================================================
interface FieldDef { name: string; label: string; type: string; groupable: boolean; aggregable: boolean }
interface DatasetDef { id: string; label: string; fields: FieldDef[]; defaultDateField: string }
interface QueryResult { label: string; value: number }
interface CustomVariable {
  id: string; name: string; label: string; description: string;
  type: "query" | "formula" | "static";
  dataset?: string; aggregate?: string; aggregateField?: string;
  filters?: { field: string; operator: string; value: string }[];
  formula?: string; staticValue?: number;
  unit: string; format: "number" | "currency" | "percent" | "hours" | "days";
  lastValue?: number; lastComputedAt?: string; createdAt: string;
}

// ===========================================================================
// Tabs
// ===========================================================================
const TABS = [
  { key: "datasets", label: "Sources de données", icon: Database },
  { key: "variables", label: "Variables", icon: Variable },
  { key: "explorer", label: "Explorateur", icon: Table },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// ===========================================================================
// Constants
// ===========================================================================
const TYPE_ICONS: Record<string, React.ReactNode> = {
  enum: <Type className="h-3 w-3 text-violet-500" />,
  string: <Type className="h-3 w-3 text-blue-500" />,
  number: <Hash className="h-3 w-3 text-emerald-500" />,
  boolean: <ToggleLeft className="h-3 w-3 text-amber-500" />,
  date: <Calendar className="h-3 w-3 text-cyan-500" />,
  relation: <Link2 className="h-3 w-3 text-indigo-500" />,
};
const OPERATORS = [
  { id: "eq", label: "= Égal" }, { id: "neq", label: "≠ Différent" },
  { id: "gt", label: "> Plus grand" }, { id: "lt", label: "< Plus petit" },
  { id: "gte", label: "≥ Plus grand ou égal" }, { id: "lte", label: "≤ Plus petit ou égal" },
  { id: "in", label: "∈ Dans la liste" }, { id: "contains", label: "Contient" },
];
const AGGREGATES = [
  { id: "count", label: "Compter" }, { id: "sum", label: "Somme" },
  { id: "avg", label: "Moyenne" }, { id: "min", label: "Min" }, { id: "max", label: "Max" },
];
const FORMAT_LABELS: Record<string, string> = { number: "Nombre", currency: "Monétaire ($)", percent: "Pourcentage (%)", hours: "Heures", days: "Jours" };
const AGG_LABELS: Record<string, string> = { count: "Compter", sum: "Somme", avg: "Moyenne", min: "Min", max: "Max" };

// Built-in variables
const BUILTIN_VARS: CustomVariable[] = [
  { id: "bv_tickets_open", name: "tickets_ouverts", label: "Tickets ouverts", description: "Tickets actuellement ouverts", type: "query", dataset: "tickets", aggregate: "count", filters: [{ field: "status", operator: "in", value: "NEW,OPEN,IN_PROGRESS,ON_SITE,WAITING_CLIENT" }], unit: "", format: "number", createdAt: "" },
  { id: "bv_tickets_total", name: "tickets_total", label: "Tickets total", description: "Nombre total de tickets", type: "query", dataset: "tickets", aggregate: "count", unit: "", format: "number", createdAt: "" },
  { id: "bv_hours_total", name: "heures_totales", label: "Heures totales", description: "Total des heures saisies", type: "query", dataset: "time_entries", aggregate: "sum", aggregateField: "durationMinutes", unit: "min", format: "hours", createdAt: "" },
  { id: "bv_revenue_total", name: "revenus_totaux", label: "Revenus totaux", description: "Somme des montants", type: "query", dataset: "time_entries", aggregate: "sum", aggregateField: "amount", unit: "$", format: "currency", createdAt: "" },
  { id: "bv_hourly_avg", name: "taux_horaire_moyen", label: "Taux horaire moyen", description: "Moyenne du taux horaire", type: "query", dataset: "time_entries", aggregate: "avg", aggregateField: "hourlyRate", unit: "$/h", format: "currency", createdAt: "" },
  { id: "bv_contacts_count", name: "contacts_total", label: "Contacts total", description: "Nombre de contacts", type: "query", dataset: "contacts", aggregate: "count", unit: "", format: "number", createdAt: "" },
  { id: "bv_orgs_count", name: "organisations_total", label: "Organisations", description: "Organisations actives", type: "query", dataset: "organizations", aggregate: "count", filters: [{ field: "isActive", operator: "eq", value: "true" }], unit: "", format: "number", createdAt: "" },
  { id: "bv_assets_count", name: "actifs_total", label: "Actifs total", description: "Nombre d'actifs", type: "query", dataset: "assets", aggregate: "count", unit: "", format: "number", createdAt: "" },
  { id: "bv_projects_active", name: "projets_actifs", label: "Projets actifs", description: "Projets en cours", type: "query", dataset: "projects", aggregate: "count", filters: [{ field: "status", operator: "eq", value: "active" }], unit: "", format: "number", createdAt: "" },
  { id: "bv_po_total", name: "po_valeur_totale", label: "Valeur PO", description: "Somme des bons de commande", type: "query", dataset: "purchase_orders", aggregate: "sum", aggregateField: "totalAmount", unit: "$", format: "currency", createdAt: "" },
];

// Persistence
const VAR_KEY = "nexus:custom-variables";
function loadVars(): CustomVariable[] { try { const r = localStorage.getItem(VAR_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveVarsStorage(v: CustomVariable[]) { try { localStorage.setItem(VAR_KEY, JSON.stringify(v)); } catch {} }

function fmtValue(val: number | undefined, format: string): string {
  if (val == null) return "—";
  if (format === "currency") return val.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
  if (format === "percent") return `${val}%`;
  if (format === "hours") return `${Math.round(val / 60 * 10) / 10}h`;
  if (format === "days") return `${val}j`;
  return val.toLocaleString("fr-CA");
}

// ===========================================================================
// Page
// ===========================================================================
export default function DataPage() {
  const [tab, setTab] = useState<TabKey>("datasets");
  const [datasets, setDatasets] = useState<DatasetDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Explorer state
  const [exDs, setExDs] = useState("");
  const [exGroupBy, setExGroupBy] = useState("");
  const [exAgg, setExAgg] = useState("count");
  const [exAggField, setExAggField] = useState("");
  const [exFilters, setExFilters] = useState<{ field: string; operator: string; value: string }[]>([]);
  const [exDateFrom, setExDateFrom] = useState("");
  const [exDateTo, setExDateTo] = useState("");
  const [exResults, setExResults] = useState<QueryResult[] | null>(null);
  const [exLoading, setExLoading] = useState(false);
  const [exError, setExError] = useState<string | null>(null);

  // Variables state
  const [customVars, setCustomVars] = useState<CustomVariable[]>(() => loadVars());
  const [showVarForm, setShowVarForm] = useState(false);
  const [editingVar, setEditingVar] = useState<CustomVariable | null>(null);
  const [computeLoading, setComputeLoading] = useState<string | null>(null);

  // Var form
  const [vName, setVName] = useState("");
  const [vLabel, setVLabel] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [vType, setVType] = useState<"query" | "formula" | "static">("query");
  const [vFormat, setVFormat] = useState<CustomVariable["format"]>("number");
  const [vUnit, setVUnit] = useState("");
  const [vDataset, setVDataset] = useState("tickets");
  const [vAgg, setVAgg] = useState("count");
  const [vAggField, setVAggField] = useState("");
  const [vFormula, setVFormula] = useState("");
  const [vStaticValue, setVStaticValue] = useState(0);
  const [vFilters, setVFilters] = useState<{ field: string; operator: string; value: string }[]>([]);
  const [vPreview, setVPreview] = useState<number | null>(null);
  const [vPreviewLoading, setVPreviewLoading] = useState(false);

  const allVars = [...BUILTIN_VARS, ...customVars];

  useEffect(() => {
    fetch("/api/v1/analytics/query").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.datasets) setDatasets(d.datasets); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filteredDs = datasets.filter((d) => !search || d.label.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search.toLowerCase()));
  const activeExDs = datasets.find((d) => d.id === exDs);
  const activeVDs = datasets.find((d) => d.id === vDataset);

  // Explorer
  async function runExplorer() {
    if (!exDs) return;
    setExLoading(true); setExError(null);
    try {
      const res = await fetch("/api/v1/analytics/query", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: exDs, groupBy: exGroupBy || undefined, aggregate: exAgg, aggregateField: exAggField || undefined, filters: exFilters.filter((f) => f.field && f.value), dateFrom: exDateFrom || undefined, dateTo: exDateTo || undefined, sortDir: "desc", limit: 25 }) });
      const d = await res.json();
      if (d.error) setExError(d.error); else setExResults(d.results ?? []);
    } catch { setExError("Erreur réseau"); } finally { setExLoading(false); }
  }

  // Variables
  function resetVarForm() { setVName(""); setVLabel(""); setVDesc(""); setVType("query"); setVFormat("number"); setVUnit(""); setVDataset("tickets"); setVAgg("count"); setVAggField(""); setVFormula(""); setVStaticValue(0); setVFilters([]); setVPreview(null); setEditingVar(null); }
  function startEditVar(v: CustomVariable) {
    setVName(v.name); setVLabel(v.label); setVDesc(v.description); setVType(v.type); setVFormat(v.format); setVUnit(v.unit);
    setVDataset(v.dataset || "tickets"); setVAgg(v.aggregate || "count"); setVAggField(v.aggregateField || "");
    setVFormula(v.formula || ""); setVStaticValue(v.staticValue ?? 0); setVFilters(v.filters || []);
    setEditingVar(v); setShowVarForm(true); setVPreview(null);
  }
  function saveVar() {
    if (!vName.trim() || !vLabel.trim()) return;
    const v: CustomVariable = {
      id: editingVar?.id || `cv_${Date.now()}`, name: vName.trim().replace(/\s+/g, "_").toLowerCase(), label: vLabel.trim(), description: vDesc.trim(),
      type: vType, format: vFormat, unit: vUnit, dataset: vType === "query" ? vDataset : undefined,
      aggregate: vType === "query" ? vAgg : undefined, aggregateField: vType === "query" && vAgg !== "count" ? vAggField : undefined,
      filters: vType === "query" ? vFilters.filter((f) => f.field && f.value) : undefined,
      formula: vType === "formula" ? vFormula : undefined, staticValue: vType === "static" ? vStaticValue : undefined,
      lastValue: vPreview ?? undefined, lastComputedAt: vPreview != null ? new Date().toISOString() : undefined,
      createdAt: editingVar?.createdAt || new Date().toISOString(),
    };
    const updated = editingVar ? customVars.map((x) => x.id === editingVar.id ? v : x) : [...customVars, v];
    setCustomVars(updated); saveVarsStorage(updated); setShowVarForm(false); resetVarForm();
  }
  function deleteVar(id: string) { if (!confirm("Supprimer ?")) return; const u = customVars.filter((v) => v.id !== id); setCustomVars(u); saveVarsStorage(u); }

  async function computeVar(v: CustomVariable): Promise<number | null> {
    if (v.type === "static") return v.staticValue ?? 0;
    if (v.type === "formula") {
      try {
        let expr = v.formula || "";
        for (const ref of allVars) { expr = expr.replace(new RegExp(`\\$\\{${ref.name}\\}`, "g"), String(ref.lastValue ?? 0)); }
        return Math.round(new Function(`return (${expr})`)() * 100) / 100;
      } catch { return null; }
    }
    try {
      const res = await fetch("/api/v1/analytics/query", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: v.dataset, aggregate: v.aggregate, aggregateField: v.aggregateField, filters: v.filters }) });
      const d = await res.json();
      return d.results?.[0]?.value ?? null;
    } catch { return null; }
  }

  async function computeAndUpdate(v: CustomVariable) {
    setComputeLoading(v.id);
    const val = await computeVar(v);
    if (val != null && !v.id.startsWith("bv_")) {
      const updated = customVars.map((x) => x.id === v.id ? { ...x, lastValue: val, lastComputedAt: new Date().toISOString() } : x);
      setCustomVars(updated); saveVarsStorage(updated);
    }
    if (v.id.startsWith("bv_")) { v.lastValue = val ?? undefined; v.lastComputedAt = new Date().toISOString(); }
    setComputeLoading(null);
  }

  async function previewVar() {
    setVPreviewLoading(true);
    const v: CustomVariable = { id: "p", name: vName, label: vLabel, description: vDesc, type: vType, format: vFormat, unit: vUnit, dataset: vDataset, aggregate: vAgg, aggregateField: vAggField, filters: vFilters, formula: vFormula, staticValue: vStaticValue, createdAt: "" };
    setVPreview(await computeVar(v));
    setVPreviewLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5">
      <AnalyticsSectionTabs section="data" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Sources de données & Variables</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">{datasets.length} datasets · {BUILTIN_VARS.length} variables intégrées · {customVars.length} personnalisées</p>
        </div>
        {tab === "variables" && (
          <Button variant="primary" size="sm" onClick={() => { resetVarForm(); setShowVarForm(true); }}>
            <Plus className="h-3.5 w-3.5" /> Nouvelle variable
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 -mx-1 px-1">
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
      {/* DATASETS TAB */}
      {/* ================================================================ */}
      {tab === "datasets" && (
        <div className="space-y-4">
          <Input placeholder="Rechercher un dataset..." value={search} onChange={(e) => setSearch(e.target.value)} iconLeft={<Search className="h-3.5 w-3.5" />} />
          {filteredDs.map((ds) => {
            const isOpen = expanded === ds.id;
            return (
              <Card key={ds.id} className={cn(isOpen && "ring-2 ring-blue-200")}>
                <CardContent className="p-0">
                  <button onClick={() => setExpanded(isOpen ? null : ds.id)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center"><Database className="h-5 w-5 text-blue-600" /></div>
                      <div>
                        <p className="text-[14px] font-semibold text-slate-900">{ds.label}</p>
                        <p className="text-[11px] text-slate-500">{ds.fields.length} champs · {ds.fields.filter((f) => f.groupable).length} groupables · {ds.fields.filter((f) => f.aggregable).length} agrégables</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="text-[10px] font-mono">{ds.id}</Badge>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-200 px-5 py-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead><tr className="border-b border-slate-200 text-left">
                            <th className="pb-2 w-8"></th><th className="pb-2 font-medium text-slate-500">Champ</th><th className="pb-2 font-medium text-slate-500">Label</th><th className="pb-2 font-medium text-slate-500">Type</th><th className="pb-2 font-medium text-slate-500 text-center">Groupable</th><th className="pb-2 font-medium text-slate-500 text-center">Agrégable</th>
                          </tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {ds.fields.map((f) => (
                              <tr key={f.name} className="hover:bg-slate-50/50">
                                <td className="py-2">{TYPE_ICONS[f.type] ?? <Type className="h-3 w-3 text-slate-400" />}</td>
                                <td className="py-2 font-mono text-slate-700">{f.name}</td>
                                <td className="py-2 text-slate-600">{f.label}</td>
                                <td className="py-2"><Badge variant="default" className="text-[9px]">{f.type}</Badge></td>
                                <td className="py-2 text-center">{f.groupable ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">—</span>}</td>
                                <td className="py-2 text-center">{f.aggregable ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Button variant="primary" size="sm" onClick={() => { setExDs(ds.id); setExGroupBy(""); setExAggField(""); setExFilters([]); setExResults(null); setTab("explorer"); }}>
                          <Play className="h-3.5 w-3.5" /> Explorer
                        </Button>
                        <span className="text-[11px] text-slate-400">Date par défaut : <span className="font-mono">{ds.defaultDateField}</span></span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ================================================================ */}
      {/* EXPLORER TAB */}
      {/* ================================================================ */}
      {tab === "explorer" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Dataset</label>
              <Select value={exDs || "none"} onValueChange={(v) => { setExDs(v === "none" ? "" : v); setExGroupBy(""); setExAggField(""); setExFilters([]); setExResults(null); }}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sélectionner...</SelectItem>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {activeExDs && (
              <>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Regrouper par</label>
                  <Select value={exGroupBy || "none"} onValueChange={(v) => setExGroupBy(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Aucun (total)</SelectItem>{activeExDs.fields.filter((f) => f.groupable).map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Agrégation</label>
                  <Select value={exAgg} onValueChange={setExAgg}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AGGREGATES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Champ à agréger</label>
                  <Select value={exAggField || "none"} onValueChange={(v) => setExAggField(v === "none" ? "" : v)} disabled={exAgg === "count"}>
                    <SelectTrigger><SelectValue placeholder={exAgg === "count" ? "N/A" : "Choisir"} /></SelectTrigger>
                    <SelectContent><SelectItem value="none">N/A</SelectItem>{activeExDs.fields.filter((f) => f.aggregable).map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {activeExDs && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Date début" type="date" value={exDateFrom} onChange={(e) => setExDateFrom(e.target.value)} />
                <Input label="Date fin" type="date" value={exDateTo} onChange={(e) => setExDateTo(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1"><Filter className="h-3 w-3" /> Filtres</span>
                  <button onClick={() => setExFilters((p) => [...p, { field: activeExDs.fields[0]?.name || "", operator: "eq", value: "" }])} className="text-[11px] text-blue-600 font-medium">+ Ajouter</button>
                </div>
                {exFilters.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-1.5">
                    <Select value={f.field} onValueChange={(v) => { const u = [...exFilters]; u[idx] = { ...u[idx], field: v }; setExFilters(u); }}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{activeExDs.fields.map((fd) => <SelectItem key={fd.name} value={fd.name}>{fd.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={f.operator} onValueChange={(v) => { const u = [...exFilters]; u[idx] = { ...u[idx], operator: v }; setExFilters(u); }}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <input className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px]" placeholder="Valeur" value={f.value} onChange={(e) => { const u = [...exFilters]; u[idx] = { ...u[idx], value: e.target.value }; setExFilters(u); }} />
                    <button onClick={() => setExFilters((p) => p.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 text-lg">×</button>
                  </div>
                ))}
              </div>
              <Button variant="primary" size="sm" onClick={runExplorer} loading={exLoading}><Play className="h-3.5 w-3.5" /> Exécuter</Button>
            </>
          )}

          {exError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">{exError}</div>}
          {exResults && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-2 text-left font-medium text-slate-500">Label</th><th className="px-4 py-2 text-right font-medium text-slate-500">Valeur</th></tr></thead>
                  <tbody>{exResults.map((r, i) => <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50"><td className="px-4 py-2 text-slate-700">{r.label}</td><td className="px-4 py-2 text-right font-bold text-slate-900 tabular-nums">{r.value.toLocaleString("fr-CA")}</td></tr>)}
                    {exResults.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">Aucun résultat</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* VARIABLES TAB */}
      {/* ================================================================ */}
      {tab === "variables" && (
        <div className="space-y-5">
          {/* Var form */}
          {showVarForm && (
            <Card className="border-blue-200 bg-blue-50/10">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-slate-900">{editingVar ? "Modifier la variable" : "Nouvelle variable"}</h3>
                  <button onClick={() => { setShowVarForm(false); resetVarForm(); }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input label="Nom technique *" placeholder="ex: taux_facturable" value={vName} onChange={(e) => setVName(e.target.value)} />
                  <Input label="Label *" placeholder="ex: Taux facturable" value={vLabel} onChange={(e) => setVLabel(e.target.value)} />
                  <Input label="Description" placeholder="Optionnel" value={vDesc} onChange={(e) => setVDesc(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Type</label>
                    <Select value={vType} onValueChange={(v) => setVType(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="query">Requête (dataset)</SelectItem><SelectItem value="formula">Formule (calcul)</SelectItem><SelectItem value="static">Valeur fixe</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Format</label>
                    <Select value={vFormat} onValueChange={(v) => setVFormat(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(FORMAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Input label="Unité" placeholder="ex: $, h, %" value={vUnit} onChange={(e) => setVUnit(e.target.value)} />
                </div>

                {vType === "query" && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <h4 className="text-[12px] font-semibold text-slate-800">Requête</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Dataset</label>
                        <Select value={vDataset} onValueChange={setVDataset}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</SelectContent></Select></div>
                      <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Agrégation</label>
                        <Select value={vAgg} onValueChange={setVAgg}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AGGREGATES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent></Select></div>
                      <div><label className="block text-[11px] font-medium text-slate-600 mb-1">Champ</label>
                        <Select value={vAggField || "none"} onValueChange={(v) => setVAggField(v === "none" ? "" : v)} disabled={vAgg === "count"}><SelectTrigger><SelectValue placeholder={vAgg === "count" ? "N/A" : "Choisir"} /></SelectTrigger><SelectContent><SelectItem value="none">N/A</SelectItem>{activeVDs?.fields.filter((f) => f.aggregable).map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-medium text-slate-600">Filtres</span><button onClick={() => setVFilters((p) => [...p, { field: "", operator: "eq", value: "" }])} className="text-[11px] text-blue-600 font-medium">+ Ajouter</button></div>
                      {vFilters.map((f, idx) => (
                        <div key={idx} className="flex items-center gap-2 mb-1">
                          <input className="w-28 rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Champ" value={f.field} onChange={(e) => { const u = [...vFilters]; u[idx] = { ...u[idx], field: e.target.value }; setVFilters(u); }} />
                          <select className="w-16 rounded-md border border-slate-300 px-1 py-1 text-[11px]" value={f.operator} onChange={(e) => { const u = [...vFilters]; u[idx] = { ...u[idx], operator: e.target.value }; setVFilters(u); }}>
                            <option value="eq">=</option><option value="neq">≠</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="in">∈</option><option value="contains">⊃</option>
                          </select>
                          <input className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Valeur" value={f.value} onChange={(e) => { const u = [...vFilters]; u[idx] = { ...u[idx], value: e.target.value }; setVFilters(u); }} />
                          <button onClick={() => setVFilters((p) => p.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {vType === "formula" && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <h4 className="text-[12px] font-semibold text-slate-800">Formule</h4>
                    <p className="text-[11px] text-slate-500">Utilisez <code className="bg-slate-100 px-1 rounded text-[10px]">${"{nom}"}</code> pour référencer des variables</p>
                    <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-mono h-16 resize-y focus:border-blue-500 focus:outline-none" placeholder="ex: ${revenus_totaux} / ${heures_totales} * 60" value={vFormula} onChange={(e) => setVFormula(e.target.value)} />
                    <div className="flex flex-wrap gap-1">{allVars.map((v) => <button key={v.id} onClick={() => setVFormula((f) => f + `\${${v.name}}`)} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600 hover:bg-blue-100 hover:text-blue-700 font-mono">${"{" + v.name + "}"}</button>)}</div>
                  </div>
                )}

                {vType === "static" && <Input label="Valeur fixe" type="number" value={vStaticValue} onChange={(e) => setVStaticValue(parseFloat(e.target.value) || 0)} />}

                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <Button variant="outline" size="sm" onClick={previewVar} loading={vPreviewLoading}><Play className="h-3.5 w-3.5" /> Tester</Button>
                  {vPreview != null && <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-[14px] font-bold text-slate-900 tabular-nums">{fmtValue(vPreview, vFormat)}</span><span className="text-[11px] text-slate-500">{vUnit}</span></>}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <Button variant="outline" size="sm" onClick={() => { setShowVarForm(false); resetVarForm(); }}>Annuler</Button>
                  <Button variant="primary" size="sm" onClick={saveVar} disabled={!vName.trim() || !vLabel.trim()}><Save className="h-3.5 w-3.5" /> {editingVar ? "Enregistrer" : "Créer"}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Built-in vars */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Intégrées ({BUILTIN_VARS.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BUILTIN_VARS.map((v) => (
                <Card key={v.id} className="hover:shadow-sm transition-all">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Variable className="h-4 w-4 text-blue-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-slate-900">{v.label}</p>
                      <p className="text-[9px] text-slate-500 font-mono truncate">${"{" + v.name + "}"}</p>
                    </div>
                    <div className="shrink-0">
                      {v.lastValue != null ? <span className="text-[13px] font-bold text-slate-900 tabular-nums">{fmtValue(v.lastValue, v.format)}</span>
                        : <Button variant="ghost" size="sm" className="h-6 w-6 p-0" loading={computeLoading === v.id} onClick={() => computeAndUpdate(v)}><Play className="h-3 w-3" /></Button>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Custom vars */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Personnalisées ({customVars.length})</h3>
            {customVars.length === 0 ? (
              <Card><CardContent className="p-8 text-center"><Variable className="h-6 w-6 text-slate-300 mx-auto mb-2" /><p className="text-[13px] text-slate-500">Aucune variable personnalisée</p></CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {customVars.map((v) => (
                  <Card key={v.id} className="hover:shadow-sm transition-all">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0"><Variable className="h-3.5 w-3.5 text-violet-600" /></div>
                          <div><p className="text-[12px] font-semibold text-slate-900">{v.label}</p><p className="text-[9px] text-slate-500 font-mono">${"{" + v.name + "}"}</p></div>
                        </div>
                        <div className="flex gap-0.5">
                          <button onClick={() => startEditVar(v)} className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => deleteVar(v.id)} className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex gap-1"><Badge variant="default" className="text-[9px]">{v.type === "query" ? "Requête" : v.type === "formula" ? "Formule" : "Fixe"}</Badge><Badge variant="default" className="text-[9px]">{FORMAT_LABELS[v.format]}</Badge></div>
                        <div className="flex items-center gap-1">
                          {v.lastValue != null && <span className="text-[12px] font-bold text-slate-900 tabular-nums">{fmtValue(v.lastValue, v.format)}</span>}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" loading={computeLoading === v.id} onClick={() => computeAndUpdate(v)}><Play className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
