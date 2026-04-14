"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Pencil, Trash2, Eye, Copy, X, Save, BarChart3, Hash, List,
  Table, Activity, ArrowLeft, Filter, Loader2, Play,
  LineChart as LineChartIcon, AreaChart as AreaChartIcon, PieChart as PieChartIcon,
  Donut, ScatterChart, Radar as RadarIcon, Network,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart as ReScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Sankey, Tooltip as ReTooltip,
  XAxis, YAxis, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ===========================================================================
// Types
// ===========================================================================
type ChartType =
  | "number"
  | "bar"
  | "horizontal_bar"
  | "progress"
  | "table"
  | "list"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "scatter"
  | "radar"
  | "sankey";
interface FieldDef { name: string; label: string; type: string; groupable: boolean; aggregable: boolean }
interface DatasetDef { id: string; label: string; fields: FieldDef[]; defaultDateField: string }
interface QueryFilter { field: string; operator: string; value: string }
interface WidgetQuery {
  dataset: string;
  filters: QueryFilter[];
  groupBy: string;
  aggregate: string;
  aggregateField: string;
  sortBy: string;
  sortDir: string;
  limit: number;
  dateField: string;
  dateFrom: string;
  dateTo: string;
}
interface CustomWidget {
  id: string;
  name: string;
  description: string;
  chartType: ChartType;
  color: string;
  query: WidgetQuery;
  createdAt: string;
}
interface QueryResult { label: string; value: number }

// ===========================================================================
// Constants
// ===========================================================================
const CHART_TYPES: { id: ChartType; label: string; icon: React.ReactNode }[] = [
  { id: "number", label: "Nombre", icon: <Hash className="h-4 w-4" /> },
  { id: "progress", label: "Jauge", icon: <Activity className="h-4 w-4" /> },
  { id: "bar", label: "Barres verticales", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "horizontal_bar", label: "Barres horizontales", icon: <List className="h-4 w-4" /> },
  { id: "line", label: "Courbe", icon: <LineChartIcon className="h-4 w-4" /> },
  { id: "area", label: "Aire", icon: <AreaChartIcon className="h-4 w-4" /> },
  { id: "pie", label: "Graphique circulaire", icon: <PieChartIcon className="h-4 w-4" /> },
  { id: "donut", label: "Anneau", icon: <Donut className="h-4 w-4" /> },
  { id: "scatter", label: "Nuage de points", icon: <ScatterChart className="h-4 w-4" /> },
  { id: "radar", label: "Radar", icon: <RadarIcon className="h-4 w-4" /> },
  { id: "sankey", label: "Diagramme de Sankey", icon: <Network className="h-4 w-4" /> },
  { id: "table", label: "Tableau", icon: <Table className="h-4 w-4" /> },
  { id: "list", label: "Liste", icon: <List className="h-4 w-4" /> },
];

// Palette for pie / donut — rotates hues based on the widget's base color.
function generatePieColors(baseColor: string, count: number): string[] {
  // Fixed palette that works well alongside most brand colors
  const palette = [
    baseColor,
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
  ];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(palette[i % palette.length]);
  return out;
}

const AGGREGATES = [
  { id: "count", label: "Compter" },
  { id: "sum", label: "Somme" },
  { id: "avg", label: "Moyenne" },
  { id: "min", label: "Minimum" },
  { id: "max", label: "Maximum" },
];
const OPERATORS = [
  { id: "eq", label: "= Égal" },
  { id: "neq", label: "≠ Différent" },
  { id: "gt", label: "> Plus grand" },
  { id: "lt", label: "< Plus petit" },
  { id: "gte", label: "≥ Plus grand ou égal" },
  { id: "lte", label: "≤ Plus petit ou égal" },
  { id: "in", label: "∈ Dans la liste" },
  { id: "contains", label: "Contient" },
];
const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#4f46e5", "#0d9488", "#ea580c"];
const STORAGE_KEY = "nexus:custom-widgets-v2";

function loadWidgets(): CustomWidget[] { try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveWidgets(w: CustomWidget[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); } catch {} }

const emptyQuery = (): WidgetQuery => ({ dataset: "tickets", filters: [], groupBy: "", aggregate: "count", aggregateField: "", sortBy: "value", sortDir: "desc", limit: 20, dateField: "", dateFrom: "", dateTo: "" });

// ===========================================================================
// Page
// ===========================================================================
export default function WidgetEditorPage() {
  const [widgets, setWidgets] = useState<CustomWidget[]>(() => loadWidgets());
  const [datasets, setDatasets] = useState<DatasetDef[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomWidget | null>(null);

  // Form
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fChart, setFChart] = useState<ChartType>("bar");
  const [fColor, setFColor] = useState(COLORS[0]);
  const [fQuery, setFQuery] = useState<WidgetQuery>(emptyQuery());

  // Preview
  const [previewResults, setPreviewResults] = useState<QueryResult[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Load datasets schema
  useEffect(() => {
    fetch("/api/v1/analytics/query").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.datasets) setDatasets(d.datasets);
    }).catch(() => {});
  }, []);

  const currentDataset = datasets.find((d) => d.id === fQuery.dataset);
  const groupableFields = currentDataset?.fields.filter((f) => f.groupable) ?? [];
  const aggregableFields = currentDataset?.fields.filter((f) => f.aggregable) ?? [];
  const allFields = currentDataset?.fields ?? [];

  function resetForm() {
    setFName(""); setFDesc(""); setFChart("bar"); setFColor(COLORS[0]); setFQuery(emptyQuery()); setPreviewResults(null); setPreviewError(null);
  }
  function startCreate() { resetForm(); setEditing(null); setCreating(true); }
  function startEdit(w: CustomWidget) {
    setFName(w.name); setFDesc(w.description); setFChart(w.chartType); setFColor(w.color); setFQuery(w.query); setEditing(w); setCreating(true); setPreviewResults(null);
  }
  function handleSave() {
    if (!fName.trim()) return;
    const w: CustomWidget = { id: editing?.id || `cw_${Date.now()}`, name: fName.trim(), description: fDesc.trim(), chartType: fChart, color: fColor, query: fQuery, createdAt: editing?.createdAt || new Date().toISOString() };
    const updated = editing ? widgets.map((x) => x.id === editing.id ? w : x) : [...widgets, w];
    setWidgets(updated); saveWidgets(updated); setCreating(false); resetForm();
  }
  function handleDelete(id: string) { if (!confirm("Supprimer ?")) return; const u = widgets.filter((w) => w.id !== id); setWidgets(u); saveWidgets(u); }
  function handleDuplicate(w: CustomWidget) { const d: CustomWidget = { ...w, id: `cw_${Date.now()}`, name: `${w.name} (copie)`, createdAt: new Date().toISOString() }; const u = [...widgets, d]; setWidgets(u); saveWidgets(u); }

  // Add / remove filters
  function addFilter() { setFQuery((q) => ({ ...q, filters: [...q.filters, { field: allFields[0]?.name || "", operator: "eq", value: "" }] })); }
  function removeFilter(idx: number) { setFQuery((q) => ({ ...q, filters: q.filters.filter((_, i) => i !== idx) })); }
  function updateFilter(idx: number, patch: Partial<QueryFilter>) { setFQuery((q) => ({ ...q, filters: q.filters.map((f, i) => i === idx ? { ...f, ...patch } : f) })); }

  // Run preview query
  async function runPreview() {
    setPreviewLoading(true); setPreviewError(null);
    try {
      const res = await fetch("/api/v1/analytics/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fQuery) });
      const d = await res.json();
      if (d.error) { setPreviewError(d.error); setPreviewResults(null); }
      else { setPreviewResults(d.results ?? []); }
    } catch { setPreviewError("Erreur réseau"); }
    finally { setPreviewLoading(false); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[13px] mb-1">
            <Link href="/analytics/dashboards" className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Analytique</Link>
          </div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Éditeur de widgets</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">{datasets.length} datasets · {widgets.length} widgets créés</p>
        </div>
        <Button variant="primary" size="sm" onClick={startCreate}><Plus className="h-3.5 w-3.5" /> Nouveau widget</Button>
      </div>

      {/* ============================================================ */}
      {/* Query Builder */}
      {/* ============================================================ */}
      {creating && (
        <Card className="border-blue-200 bg-blue-50/10">
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-900">{editing ? "Modifier" : "Nouveau widget"}</h3>
              <button onClick={() => { setCreating(false); resetForm(); }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            {/* Name + display */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="Nom *" placeholder="Ex: Tickets par statut" value={fName} onChange={(e) => setFName(e.target.value)} />
              <Input label="Description" placeholder="Optionnel" value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">Visualisation</label>
                <Select value={fChart} onValueChange={(v) => setFChart(v as ChartType)}>
                  <SelectTrigger>
                    <SelectValue>
                      {(() => {
                        const c = CHART_TYPES.find((x) => x.id === fChart);
                        return c ? (
                          <span className="flex items-center gap-2">
                            <span className="text-slate-500">{c.icon}</span>
                            {c.label}
                          </span>
                        ) : null;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CHART_TYPES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-500">{c.icon}</span>
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dataset */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-slate-800">1. Source de données</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Dataset</label>
                  <Select value={fQuery.dataset} onValueChange={(v) => setFQuery((q) => ({ ...q, dataset: v, groupBy: "", aggregateField: "", filters: [] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Date début" type="date" value={fQuery.dateFrom} onChange={(e) => setFQuery((q) => ({ ...q, dateFrom: e.target.value }))} />
                  <Input label="Date fin" type="date" value={fQuery.dateTo} onChange={(e) => setFQuery((q) => ({ ...q, dateTo: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[12px] font-semibold text-slate-800 flex items-center gap-1.5"><Filter className="h-3.5 w-3.5 text-slate-400" /> 2. Filtres</h4>
                <button onClick={addFilter} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"><Plus className="h-3 w-3" /> Ajouter</button>
              </div>
              {fQuery.filters.length === 0 && <p className="text-[11px] text-slate-400">Aucun filtre — toutes les données seront incluses</p>}
              {fQuery.filters.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={f.field} onValueChange={(v) => updateFilter(idx, { field: v })}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Champ" /></SelectTrigger>
                    <SelectContent>{allFields.map((fd) => <SelectItem key={fd.name} value={fd.name}>{fd.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={f.operator} onValueChange={(v) => updateFilter(idx, { operator: v })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <input className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none" placeholder="Valeur" value={f.value} onChange={(e) => updateFilter(idx, { value: e.target.value })} />
                  <button onClick={() => removeFilter(idx)} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>

            {/* Group By + Aggregate */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <h4 className="text-[12px] font-semibold text-slate-800">3. Regrouper et agréger</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Regrouper par</label>
                  <Select value={fQuery.groupBy || "none"} onValueChange={(v) => setFQuery((q) => ({ ...q, groupBy: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun (total global)</SelectItem>
                      {groupableFields.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Fonction d&apos;agrégation</label>
                  <Select value={fQuery.aggregate} onValueChange={(v) => setFQuery((q) => ({ ...q, aggregate: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AGGREGATES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Champ à agréger {fQuery.aggregate !== "count" ? "*" : ""}</label>
                  <Select value={fQuery.aggregateField || "none"} onValueChange={(v) => setFQuery((q) => ({ ...q, aggregateField: v === "none" ? "" : v }))} disabled={fQuery.aggregate === "count"}>
                    <SelectTrigger><SelectValue placeholder={fQuery.aggregate === "count" ? "N/A (comptage)" : "Sélectionner..."} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">N/A</SelectItem>
                      {aggregableFields.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Trier par</label>
                  <Select value={fQuery.sortBy} onValueChange={(v) => setFQuery((q) => ({ ...q, sortBy: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">Valeur</SelectItem>
                      <SelectItem value="label">Label (A-Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Ordre</label>
                  <Select value={fQuery.sortDir} onValueChange={(v) => setFQuery((q) => ({ ...q, sortDir: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Décroissant ↓</SelectItem>
                      <SelectItem value="asc">Croissant ↑</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input label="Limite de résultats" type="number" min={1} max={100} value={fQuery.limit} onChange={(e) => setFQuery((q) => ({ ...q, limit: parseInt(e.target.value) || 20 }))} />
              </div>
            </div>

            {/* Color */}
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-medium text-slate-700">Couleur :</span>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setFColor(c)} className={cn("h-6 w-6 rounded-full ring-2 ring-offset-2 transition-all", fColor === c ? "ring-blue-500" : "ring-transparent hover:ring-slate-300")} style={{ backgroundColor: c }} />
              ))}
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[13px] font-semibold text-slate-900">Aperçu en direct</h4>
                <Button variant="primary" size="sm" onClick={runPreview} loading={previewLoading}>
                  <Play className="h-3.5 w-3.5" /> Exécuter la requête
                </Button>
              </div>
              {previewError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700 mb-3">{previewError}</div>}
              {previewResults ? (
                <WidgetPreview results={previewResults} chartType={fChart} color={fColor} name={fName || "Widget"} aggregate={fQuery.aggregate} />
              ) : (
                <p className="text-center py-6 text-[12px] text-slate-400">Cliquez « Exécuter la requête » pour voir l&apos;aperçu</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={() => { setCreating(false); resetForm(); }}>Annuler</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={!fName.trim()}>
                <Save className="h-3.5 w-3.5" /> {editing ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Widget cards */}
      {/* ============================================================ */}
      {widgets.length === 0 && !creating && (
        <Card><CardContent className="p-12 text-center">
          <BarChart3 className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-[15px] font-semibold text-slate-900">Aucun widget</h3>
          <p className="mt-1 text-[13px] text-slate-500">Créez des widgets personnalisés avec le query builder.</p>
          <Button variant="primary" className="mt-4" onClick={startCreate}><Plus className="h-4 w-4" /> Créer</Button>
        </CardContent></Card>
      )}

      {widgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {widgets.map((w) => {
            const ds = datasets.find((d) => d.id === w.query.dataset);
            const grp = ds?.fields.find((f) => f.name === w.query.groupBy);
            return (
              <Card key={w.id} className="hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: w.color + "20" }}>
                        <BarChart3 className="h-4 w-4" style={{ color: w.color }} />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-slate-900">{w.name}</p>
                        {w.description && <p className="text-[10px] text-slate-500">{w.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => startEdit(w)} className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDuplicate(w)} className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(w.id)} className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="default" className="text-[9px]">{ds?.label ?? w.query.dataset}</Badge>
                    <Badge variant="default" className="text-[9px]">{AGGREGATES.find((a) => a.id === w.query.aggregate)?.label}</Badge>
                    {grp && <Badge variant="default" className="text-[9px]">↳ {grp.label}</Badge>}
                    <Badge variant="default" className="text-[9px]">{CHART_TYPES.find((c) => c.id === w.chartType)?.label}</Badge>
                    {w.query.filters.length > 0 && <Badge variant="warning" className="text-[9px]">{w.query.filters.length} filtre{w.query.filters.length > 1 ? "s" : ""}</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Preview
// ===========================================================================
function WidgetPreview({ results, chartType, color, name, aggregate }: {
  results: QueryResult[]; chartType: ChartType; color: string; name: string; aggregate: string;
}) {
  if (!results.length) return <p className="text-center py-4 text-[12px] text-slate-400">Aucun résultat</p>;

  const isSingle = results.length === 1 && results[0].label === "Total";
  const maxVal = Math.max(...results.map((r) => r.value), 1);

  if (chartType === "number" || isSingle) {
    return (
      <div className="text-center py-4">
        <p className="text-[11px] text-slate-500 mb-1">{name}</p>
        <p className="text-3xl font-bold tabular-nums" style={{ color }}>{results[0].value.toLocaleString("fr-CA")}</p>
        <p className="text-[10px] text-slate-400 mt-1">{aggregate}</p>
      </div>
    );
  }

  if (chartType === "progress" && isSingle) {
    const pct = Math.min(100, Math.max(0, results[0].value));
    return (
      <div className="py-4 space-y-2">
        <div className="flex justify-between"><span className="text-[11px] text-slate-500">{name}</span><span className="text-[14px] font-bold" style={{ color }}>{pct}%</span></div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
      </div>
    );
  }

  if (chartType === "bar") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <div className="flex items-end gap-1 h-28">
          {results.map((r, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full relative" style={{ height: "96px" }}>
                <div className="absolute bottom-0 left-0 right-0 rounded-t" style={{ height: `${Math.max((r.value / maxVal) * 100, 4)}%`, backgroundColor: color }} />
              </div>
              <span className="text-[8px] text-slate-400 truncate max-w-full text-center">{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chartType === "horizontal_bar") {
    return (
      <div className="py-2 space-y-1.5">
        <p className="text-[11px] text-slate-500 mb-1">{name}</p>
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 w-28 truncate">{r.label}</span>
            <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(r.value / maxVal) * 100}%`, backgroundColor: color }} />
            </div>
            <span className="text-[10px] font-bold text-slate-700 tabular-nums w-16 text-right">{r.value.toLocaleString("fr-CA")}</span>
          </div>
        ))}
      </div>
    );
  }

  if (chartType === "line") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ReTooltip />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "area") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ReTooltip />
            <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.25} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    const pieColors = generatePieColors(color, results.length);
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={results}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={chartType === "donut" ? 45 : 0}
              label={(e: any) => `${e.label} (${e.value})`}
              labelLine={false}
            >
              {results.map((_, i) => (
                <Cell key={i} fill={pieColors[i % pieColors.length]} />
              ))}
            </Pie>
            <ReTooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "scatter") {
    const scatterData = results.map((r, i) => ({ x: i + 1, y: r.value, label: r.label }));
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <ReScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="x" name="Index" tick={{ fontSize: 10 }} />
            <YAxis dataKey="y" name="Valeur" tick={{ fontSize: 10 }} />
            <ReTooltip cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={scatterData} fill={color} />
          </ReScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "radar") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={results}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
            <PolarRadiusAxis tick={{ fontSize: 9 }} />
            <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.4} />
            <ReTooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "sankey") {
    // Simple 2-level Sankey: all results flow from a virtual "Total" source into each label
    const nodes = [{ name: "Total" }, ...results.map((r) => ({ name: r.label }))];
    const links = results.map((r, i) => ({ source: 0, target: i + 1, value: r.value || 1 }));
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={240}>
          <Sankey
            data={{ nodes, links }}
            nodePadding={20}
            nodeWidth={12}
            link={{ stroke: color, strokeOpacity: 0.4 }}
            node={{ stroke: color, fill: color } as any}
          >
            <ReTooltip />
          </Sankey>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "table") {
    return (
      <div className="py-2">
        <table className="w-full text-[11px]">
          <thead><tr className="border-b border-slate-200"><th className="pb-1 text-left text-slate-500 font-medium">Label</th><th className="pb-1 text-right text-slate-500 font-medium">Valeur</th></tr></thead>
          <tbody>{results.map((r, i) => <tr key={i} className="border-b border-slate-100"><td className="py-1 text-slate-700">{r.label}</td><td className="py-1 text-right font-medium tabular-nums" style={{ color }}>{r.value.toLocaleString("fr-CA")}</td></tr>)}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="py-2 space-y-1">
      {results.map((r, i) => (
        <div key={i} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
          <span className="text-[11px] text-slate-700">{r.label}</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{r.value.toLocaleString("fr-CA")}</span>
        </div>
      ))}
    </div>
  );
}
