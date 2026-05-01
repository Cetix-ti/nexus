"use client";

// ============================================================================
// Éditeur de widgets — inspiré du « Gauge Builder » de BrightGauge.
//
// Philosophie :
//   - Assistant étape par étape, chaque section est une carte numérotée.
//   - Aperçu en direct à droite (sticky), rafraîchi automatiquement (debounce).
//   - Sélecteur visuel de graphique (grille d'icônes) au lieu d'un dropdown.
//   - Sélecteur visuel de dataset (cartes cliquables).
//   - Regroupement par date (jour / semaine / mois / trimestre / année).
//   - Agrégations complètes : count, count_distinct, sum, avg, min, max,
//     median, percentage.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus, Pencil, Trash2, Copy, X, Save, BarChart3, Hash, List,
  Table, Activity, ArrowLeft, Filter, Play,
  LineChart as LineChartIcon, AreaChart as AreaChartIcon, PieChart as PieChartIcon,
  Donut, ScatterChart, Radar as RadarIcon, Network,
  Ticket, Clock, User, Building2, FileText, Cpu, Briefcase,
  Receipt, ShoppingCart, Shield, Calendar, Database, Layers,
  RefreshCw, Check, Palette, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart as ReScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Sankey, Treemap, Tooltip as ReTooltip, Legend,
  XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import { cn } from "@/lib/utils";
import { remapBaseCategoryResults } from "@/lib/analytics/base-category-remap";
import { FilterRow } from "@/components/analytics/filter-row";
import { WidgetAppearance } from "@/components/analytics/widget-appearance";
import { WidgetAiAssistant, type WidgetDraft } from "@/components/analytics/widget-ai-assistant";
import { AnalyticsSectionTabs } from "@/components/analytics/section-tabs";
import {
  type VisualStyle, DEFAULT_STYLE, mergeStyle,
  colorsForResults, colorForIndex, formatValue,
  cornerRadiusForBar, cornerRadiusForHorizontalBar, cornerRadiusForTreemap,
  legendLayoutForPosition, gridStrokeDasharray,
} from "@/lib/analytics/widget-style";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WidgetChart, type ChartDatum } from "@/components/widgets/widget-chart";

// ===========================================================================
// Types
// ===========================================================================
type ChartType =
  | "number" | "bar" | "horizontal_bar" | "stacked_bar" | "progress" | "table"
  | "list" | "line" | "area" | "combo" | "pie" | "donut" | "scatter" | "radar"
  | "funnel" | "treemap" | "heatmap" | "gauge" | "sankey";

interface FieldDef { name: string; label: string; type: string; groupable: boolean; aggregable: boolean; values?: readonly string[]; virtual?: boolean }
interface DatasetDef { id: string; label: string; fields: FieldDef[]; defaultDateField: string; dateFields?: string[] }
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
  // Source secondaire optionnelle — utilisée par Sankey pour les
  // diagrammes de flux à 2 sources (ex. Revenus + Dépenses QBO).
  // Si `secondaryDataset` est vide, la requête est single-source.
  secondaryDataset?: string;
  secondaryGroupBy?: string;
  secondaryAggregate?: string;
  secondaryAggregateField?: string;
  secondaryDateField?: string;
  primarySourceLabel?: string;
  secondarySourceLabel?: string;
}
interface CustomWidget {
  id: string;
  name: string;
  description: string;
  chartType: ChartType;
  color: string;
  /** Style visuel — optionnel : les widgets créés avant cette feature utilisent
   * DEFAULT_STYLE via mergeStyle(). */
  style?: Partial<VisualStyle>;
  query: WidgetQuery;
  createdAt: string;
  /**
   * Si défini : widget attribué à une organisation spécifique. Visible dans
   * l'onglet Rapports de cette org ET dans /analytics?orgContext=<orgId>.
   * Les widgets globaux (undefined) restent visibles partout.
   */
  organizationId?: string;
}
// `source` optionnel : quand la requête est dual-source (Sankey cashflow
// Revenus + Dépenses par exemple), chaque ligne porte le libellé de son
// dataset d'origine. Le renderer Sankey le détecte pour construire un
// flux 2-sources → N cibles.
interface QueryResult { label: string; value: number; source?: string }

// ===========================================================================
// Constants
// ===========================================================================
const DATE_BUCKETS = [
  { id: "_by_day", label: "Jour" },
  { id: "_by_week", label: "Semaine" },
  { id: "_by_month", label: "Mois" },
  { id: "_by_quarter", label: "Trimestre" },
  { id: "_by_year", label: "Année" },
] as const;

const DATASET_ICONS: Record<string, React.ReactNode> = {
  tickets: <Ticket className="h-5 w-5" />,
  time_entries: <Clock className="h-5 w-5" />,
  contacts: <User className="h-5 w-5" />,
  organizations: <Building2 className="h-5 w-5" />,
  contracts: <FileText className="h-5 w-5" />,
  assets: <Cpu className="h-5 w-5" />,
  projects: <Briefcase className="h-5 w-5" />,
  expense_reports: <Receipt className="h-5 w-5" />,
  purchase_orders: <ShoppingCart className="h-5 w-5" />,
  monitoring_alerts: <Activity className="h-5 w-5" />,
  security_alerts: <Shield className="h-5 w-5" />,
  calendar_events: <Calendar className="h-5 w-5" />,
  qbo_invoices: <FileText className="h-5 w-5" />,
  qbo_customers: <User className="h-5 w-5" />,
  qbo_payments: <Receipt className="h-5 w-5" />,
  qbo_expenses: <ShoppingCart className="h-5 w-5" />,
};

const CHART_TYPES: { id: ChartType; label: string; icon: React.ReactNode; family: string }[] = [
  { id: "number", label: "KPI", icon: <Hash className="h-5 w-5" />, family: "single" },
  { id: "progress", label: "Jauge %", icon: <Activity className="h-5 w-5" />, family: "single" },
  { id: "gauge", label: "Jauge à aiguille", icon: <Activity className="h-5 w-5" />, family: "single" },
  { id: "bar", label: "Barres", icon: <BarChart3 className="h-5 w-5" />, family: "series" },
  { id: "horizontal_bar", label: "Barres horiz.", icon: <List className="h-5 w-5" />, family: "series" },
  { id: "stacked_bar", label: "Barres empilées", icon: <Layers className="h-5 w-5" />, family: "series" },
  { id: "line", label: "Courbe", icon: <LineChartIcon className="h-5 w-5" />, family: "series" },
  { id: "area", label: "Aire", icon: <AreaChartIcon className="h-5 w-5" />, family: "series" },
  { id: "combo", label: "Combiné", icon: <BarChart3 className="h-5 w-5" />, family: "series" },
  { id: "pie", label: "Circulaire", icon: <PieChartIcon className="h-5 w-5" />, family: "proportion" },
  { id: "donut", label: "Anneau", icon: <Donut className="h-5 w-5" />, family: "proportion" },
  { id: "funnel", label: "Entonnoir", icon: <BarChart3 className="h-5 w-5" />, family: "proportion" },
  { id: "treemap", label: "Treemap", icon: <PieChartIcon className="h-5 w-5" />, family: "proportion" },
  { id: "heatmap", label: "Carte chaleur", icon: <Table className="h-5 w-5" />, family: "proportion" },
  { id: "scatter", label: "Nuage de points", icon: <ScatterChart className="h-5 w-5" />, family: "series" },
  { id: "radar", label: "Radar", icon: <RadarIcon className="h-5 w-5" />, family: "series" },
  { id: "sankey", label: "Sankey", icon: <Network className="h-5 w-5" />, family: "proportion" },
  { id: "table", label: "Tableau", icon: <Table className="h-5 w-5" />, family: "data" },
  { id: "list", label: "Liste", icon: <List className="h-5 w-5" />, family: "data" },
];

const AGGREGATES = [
  { id: "count", label: "Compter", hint: "Nombre d'enregistrements" },
  { id: "count_distinct", label: "Compter (distinct)", hint: "Valeurs uniques" },
  { id: "sum", label: "Somme", hint: "Total d'un champ numérique" },
  { id: "avg", label: "Moyenne", hint: "Moyenne arithmétique" },
  { id: "median", label: "Médiane", hint: "Valeur médiane" },
  { id: "min", label: "Minimum", hint: "Plus petite valeur" },
  { id: "max", label: "Maximum", hint: "Plus grande valeur" },
  { id: "percentage", label: "Pourcentage", hint: "% du total (par groupe)" },
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
  { id: "isnull", label: "Est vide" },
  { id: "between", label: "Entre" },
];

const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#4f46e5", "#0d9488", "#ea580c"];
const STORAGE_KEY = "nexus:custom-widgets-v2";

// Detect BUCKET suffix in a groupBy string — the API accepts field_by_day etc.
function splitBucket(groupBy: string): { base: string; bucket: string } {
  for (const b of DATE_BUCKETS) {
    if (groupBy.endsWith(b.id)) return { base: groupBy.slice(0, -b.id.length), bucket: b.id };
  }
  return { base: groupBy, bucket: "" };
}

function generatePieColors(baseColor: string, count: number): string[] {
  const palette = [baseColor, "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16"];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

function loadWidgets(): CustomWidget[] { try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {} return []; }
function saveWidgets(w: CustomWidget[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); } catch {}
  // Notifie les dashboards ouverts (même onglet et autres onglets) que la
  // définition source d'un ou plusieurs widgets a changé. Dans le même
  // onglet, `localStorage.setItem` n'émet PAS l'événement `storage` natif —
  // d'où le custom event. Les overrides per-instance (overrideColor,
  // overrideChartType, scales) restent intacts : seules les valeurs source
  // (query, name, color de base, chartType de base) sont rafraîchies.
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("nexus:widgets-updated")); } catch {}
  }
}

/**
 * Retourne true si le type de graphique est adapté à la forme des
 * résultats courants. Signale visuellement (pastille verte) les choix
 * recommandés pour guider l'utilisateur sans bloquer sa liberté.
 */
function isChartRecommended(
  chartId: ChartType,
  results: QueryResult[] | null,
  dateBucket: string | null | undefined,
): boolean {
  if (!results) return false;
  const n = results.length;
  const isSingle = n === 1 && results[0].label === "Total";
  const isTimeSeries = !!dateBucket;

  if (isSingle) return ["number", "progress", "gauge"].includes(chartId);
  if (isTimeSeries) return ["line", "area", "combo", "bar"].includes(chartId);
  if (n <= 2) return ["number", "bar", "horizontal_bar"].includes(chartId);
  if (n <= 6) return ["bar", "horizontal_bar", "pie", "donut"].includes(chartId);
  if (n <= 12) return ["horizontal_bar", "bar", "treemap", "pie"].includes(chartId);
  return ["horizontal_bar", "table", "treemap"].includes(chartId);
}

const emptyQuery = (): WidgetQuery => ({
  dataset: "tickets", filters: [], groupBy: "", aggregate: "count", aggregateField: "",
  sortBy: "value", sortDir: "desc", limit: 20, dateField: "", dateFrom: "", dateTo: "",
});

// ---------------------------------------------------------------------------
// Presets — widgets prédéfinis que l'utilisateur peut créer en 1 clic.
// Chaque preset remplit le formulaire ; l'utilisateur peut ensuite ajuster.
// ---------------------------------------------------------------------------
interface WidgetPreset {
  id: string;
  label: string;
  description: string;
  chartType: ChartType;
  color: string;
  query: WidgetQuery;
}

/**
 * Génère des données mockées plausibles pour l'aperçu d'un preset, selon
 * son `chartType`. L'objectif n'est pas la réalité métier, mais de donner
 * une représentation visuelle FIDÈLE du type de graphique au moment où
 * l'agent parcourt les modèles. Les chiffres sont tirés d'une distribution
 * descendante (premier le plus grand) qui rend bien sur les barres / pies.
 */
function mockDataForPreset(p: WidgetPreset): ChartDatum[] {
  // Seed déterministe sur l'id pour que chaque preset ait toujours le même
  // aperçu (pas de scintillement entre re-renders).
  let seed = 0;
  for (let i = 0; i < p.id.length; i++) seed = (seed * 31 + p.id.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xFFFF) / 0xFFFF; };

  const ct = p.chartType;
  if (ct === "number") return [{ label: "Total", value: 42 + Math.floor(rnd() * 200) }];
  if (ct === "gauge" || ct === "progress") {
    return [{ label: "Total", value: 35 + Math.floor(rnd() * 50) }];
  }
  if (ct === "line" || ct === "area" || ct === "combo") {
    const months = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil"];
    let v = 30 + Math.floor(rnd() * 30);
    return months.map((m) => {
      v = Math.max(8, v + Math.floor(rnd() * 24) - 9);
      return { label: m, value: v };
    });
  }
  if (ct === "pie" || ct === "donut" || ct === "funnel") {
    const labels = ["Catégorie A", "Catégorie B", "Catégorie C", "Catégorie D"];
    return labels.map((l, i) => ({ label: l, value: Math.max(5, 50 - i * 10 - Math.floor(rnd() * 8)) }));
  }
  if (ct === "table" || ct === "list") {
    const labels = ["Premier", "Deuxième", "Troisième", "Quatrième"];
    return labels.map((l, i) => ({ label: l, value: 100 - i * 18 - Math.floor(rnd() * 12) }));
  }
  if (ct === "scatter" || ct === "radar" || ct === "treemap" || ct === "heatmap" || ct === "sankey") {
    const labels = ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5"];
    return labels.map((l, i) => ({ label: l, value: 30 + Math.floor(rnd() * 60) - i * 4 }));
  }
  // bar / horizontal_bar / stacked_bar par défaut
  const labels = ["Premier", "Deuxième", "Troisième", "Quatrième", "Cinquième"];
  return labels.map((l, i) => ({ label: l, value: Math.max(10, 70 - i * 12 - Math.floor(rnd() * 10)) }));
}

const WIDGET_PRESETS: WidgetPreset[] = [
  {
    id: "travel_count_total",
    label: "Nombre de déplacements facturés",
    description: "Total des saisies de temps où le déplacement a été coché",
    chartType: "number",
    color: "#d97706",
    query: {
      dataset: "time_entries",
      filters: [{ field: "hasTravelBilled", operator: "eq", value: "true" }],
      groupBy: "", aggregate: "count", aggregateField: "",
      sortBy: "value", sortDir: "desc", limit: 20,
      dateField: "startedAt", dateFrom: "", dateTo: "",
    },
  },
  {
    id: "travel_count_by_agent",
    label: "Déplacements par technicien",
    description: "Nombre de déplacements facturés décomposé par technicien",
    chartType: "horizontal_bar",
    color: "#d97706",
    query: {
      dataset: "time_entries",
      filters: [{ field: "hasTravelBilled", operator: "eq", value: "true" }],
      groupBy: "agentId", aggregate: "count", aggregateField: "",
      sortBy: "value", sortDir: "desc", limit: 15,
      dateField: "startedAt", dateFrom: "", dateTo: "",
    },
  },
  {
    id: "travel_count_by_org",
    label: "Déplacements par client",
    description: "Nombre de déplacements facturés par organisation",
    chartType: "horizontal_bar",
    color: "#2563eb",
    query: {
      dataset: "time_entries",
      filters: [{ field: "hasTravelBilled", operator: "eq", value: "true" }],
      groupBy: "organizationId", aggregate: "count", aggregateField: "",
      sortBy: "value", sortDir: "desc", limit: 15,
      dateField: "startedAt", dateFrom: "", dateTo: "",
    },
  },
  {
    id: "travel_trend_monthly",
    label: "Tendance mensuelle des déplacements",
    description: "Évolution mensuelle des déplacements facturés",
    chartType: "line",
    color: "#059669",
    query: {
      dataset: "time_entries",
      filters: [{ field: "hasTravelBilled", operator: "eq", value: "true" }],
      groupBy: "startedAt_by_month", aggregate: "count", aggregateField: "",
      sortBy: "chronological", sortDir: "asc", limit: 24,
      dateField: "startedAt", dateFrom: "", dateTo: "",
    },
  },
  {
    id: "hours_billable_by_category",
    label: "Heures facturables par catégorie",
    description: "Total d'heures décomposé par catégorie de base (timeType)",
    chartType: "donut",
    color: "#7c3aed",
    query: {
      dataset: "time_entries",
      filters: [{ field: "coverageStatus", operator: "in", value: "billable,travel_billable,hour_bank_overage,msp_overage" }],
      groupBy: "timeType", aggregate: "sum", aggregateField: "durationMinutes",
      sortBy: "value", sortDir: "desc", limit: 10,
      dateField: "startedAt", dateFrom: "", dateTo: "",
    },
  },
  {
    id: "tickets_by_status",
    label: "Tickets par statut",
    description: "Répartition actuelle des tickets par statut",
    chartType: "pie",
    color: "#2563eb",
    query: {
      dataset: "tickets",
      filters: [],
      groupBy: "status", aggregate: "count", aggregateField: "",
      sortBy: "value", sortDir: "desc", limit: 15,
      dateField: "createdAt", dateFrom: "", dateTo: "",
    },
  },
];

// ===========================================================================
// Page
// ===========================================================================
// ===========================================================================
// Helpers UI partagés — galerie des modèles + galerie des widgets custom
// ===========================================================================

/** Sélecteur du nombre de colonnes de la galerie. Persiste en localStorage
 *  via le state du composant parent. Plage 2-5. */
function ColumnsPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const choices = [2, 3, 4, 5] as const;
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
      <span className="px-2 text-[10.5px] font-medium uppercase tracking-wide text-slate-500">Colonnes</span>
      {choices.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "h-6 w-7 rounded text-[11.5px] font-semibold tabular-nums transition-colors",
            value === n
              ? "bg-violet-600 text-white"
              : "text-slate-600 hover:bg-slate-100",
          )}
          aria-label={`${n} colonnes`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Mappe le nombre de colonnes vers les classes Tailwind responsive
 *  appropriées. On garde toujours 1 colonne sur mobile et 2 sur sm —
 *  l'override n'agit qu'à partir de lg pour les écrans larges. */
function gridColsClass(n: number): string {
  switch (n) {
    case 2: return "lg:grid-cols-2";
    case 3: return "lg:grid-cols-3";
    case 4: return "lg:grid-cols-3 xl:grid-cols-4";
    case 5: return "lg:grid-cols-3 xl:grid-cols-5";
    default: return "lg:grid-cols-3";
  }
}

/** Hauteur du chart d'aperçu : adaptative selon le nombre de colonnes
 *  (cards plus étroites = chart plus court pour rester lisible). */
function previewChartHeight(n: number): string {
  if (n >= 5) return "h-[88px]";
  if (n === 4) return "h-[100px]";
  return "h-[120px]";
}

export default function WidgetEditorPage() {
  // Contexte organisation : si ?orgContext=<orgId> dans l'URL, la page se
  // comporte comme un atelier scoped à cette org — filtre les widgets et
  // tag les nouveaux avec cet orgId. Utilisé par l'onglet Rapports des orgs.
  const searchParams = useSearchParams();
  const orgContextId = searchParams?.get("orgContext") ?? null;
  const orgContextName = searchParams?.get("orgName") ?? null;

  const [allWidgets, setAllWidgets] = useState<CustomWidget[]>(() => loadWidgets());
  // Vue filtrée : si orgContextId défini, on montre les widgets de cette org
  // + les widgets globaux. Sinon on montre tout.
  const widgets = useMemo(() => {
    if (!orgContextId) return allWidgets;
    return allWidgets.filter((w) => !w.organizationId || w.organizationId === orgContextId);
  }, [allWidgets, orgContextId]);
  const setWidgets = setAllWidgets;
  const [datasets, setDatasets] = useState<DatasetDef[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomWidget | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fChart, setFChart] = useState<ChartType>("bar");
  const [fColor, setFColor] = useState(COLORS[0]);
  const [fStyle, setFStyle] = useState<VisualStyle>(() => ({ ...DEFAULT_STYLE }));
  const [fQuery, setFQuery] = useState<WidgetQuery>(emptyQuery());

  // Preview state
  const [previewResults, setPreviewResults] = useState<QueryResult[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nombre de colonnes pour la grille des modèles + widgets de la galerie.
  // Persisté côté agent pour conserver la préférence entre sessions.
  // Plage 2-5 : moins de 2 = trop large par carte, plus de 5 = chart
  // illisible dans une carte aussi étroite.
  const COLUMNS_KEY = "nexus:widgets-grid-columns";
  const [gridColumns, setGridColumns] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    const v = parseInt(localStorage.getItem(COLUMNS_KEY) ?? "3", 10);
    return [2, 3, 4, 5].includes(v) ? v : 3;
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(COLUMNS_KEY, String(gridColumns));
  }, [gridColumns]);

  // Cache des données réelles fetchées pour chaque widget custom — utilisé
  // pour rendre l'aperçu visuel des cards de la galerie. Fetch en parallèle
  // au mount, mise à jour quand un widget est créé/édité.
  const [previewByWidgetId, setPreviewByWidgetId] = useState<Map<string, QueryResult[]>>(new Map());
  const [previewLoadingIds, setPreviewLoadingIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Fetch sequentiel borné : on évite de saturer le moteur de query pour
    // les agents avec beaucoup de widgets. Promise.all + slice limit.
    if (widgets.length === 0) return;
    let cancelled = false;
    setPreviewLoadingIds(new Set(widgets.map((w) => w.id)));
    Promise.all(
      widgets.map(async (w) => {
        try {
          const r = await fetch("/api/v1/analytics/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(w.query),
          });
          if (!r.ok) return [w.id, [] as QueryResult[]] as const;
          const j = await r.json();
          return [w.id, (j?.results as QueryResult[]) ?? []] as const;
        } catch {
          return [w.id, [] as QueryResult[]] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const map = new Map<string, QueryResult[]>();
      for (const [id, res] of entries) map.set(id, res);
      setPreviewByWidgetId(map);
      setPreviewLoadingIds(new Set());
    });
    return () => { cancelled = true; };
    // Dépendance sur la longueur + IDs concaténés : refetch quand un widget
    // est ajouté/supprimé/édité (id change ou liste change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets.map((w) => `${w.id}:${w.query.dataset}:${w.query.aggregate}:${w.query.groupBy}`).join("|")]);

  // Load datasets schema
  useEffect(() => {
    fetch("/api/v1/analytics/query")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.datasets) setDatasets(d.datasets); })
      .catch(() => {});
  }, []);

  const currentDataset = datasets.find((d) => d.id === fQuery.dataset);
  const groupableFields = currentDataset?.fields.filter((f) => f.groupable) ?? [];
  const aggregableFields = currentDataset?.fields.filter((f) => f.aggregable) ?? [];
  const allFields = currentDataset?.fields ?? [];

  // Current groupBy parsed — the base name and optional bucket suffix
  const { base: groupByBase, bucket: groupByBucket } = useMemo(() => splitBucket(fQuery.groupBy), [fQuery.groupBy]);
  const groupByFieldDef = groupableFields.find((f) => f.name === groupByBase);
  const groupByIsDate = groupByFieldDef?.type === "date";

  // ==== Form helpers ====
  function resetForm() {
    setFName(""); setFDesc(""); setFChart("bar"); setFColor(COLORS[0]);
    setFStyle({ ...DEFAULT_STYLE });
    setFQuery(emptyQuery()); setPreviewResults(null); setPreviewError(null);
  }
  function startCreate() { resetForm(); setEditing(null); setCreating(true); }

  /** Démarre une création avec un preset prérempli. */
  function startCreateFromPreset(preset: WidgetPreset) {
    resetForm();
    setEditing(null);
    setFName(preset.label);
    setFDesc(preset.description);
    setFChart(preset.chartType);
    setFColor(preset.color);
    setFStyle({ ...DEFAULT_STYLE, primaryColor: preset.color });
    setFQuery(preset.query);
    setCreating(true);
  }

  /** Applique un widget généré par l'IA au formulaire. */
  function applyAiDraft(draft: WidgetDraft) {
    resetForm();
    setEditing(null);
    setFName(draft.name);
    setFDesc(draft.description ?? "");
    setFChart(draft.chartType as ChartType);
    const color = draft.color ?? COLORS[0];
    setFColor(color);
    setFStyle({ ...DEFAULT_STYLE, primaryColor: color });
    setFQuery(draft.query as WidgetQuery);
    setCreating(true);
  }

  const [aiOpen, setAiOpen] = useState(false);
  function startEdit(w: CustomWidget) {
    setFName(w.name); setFDesc(w.description); setFChart(w.chartType); setFColor(w.color);
    setFStyle(mergeStyle(w.style, w.color));
    // Les widgets créés avant le changement "période au dashboard"
    // peuvent encore porter des dateFrom/dateTo. On les vide en édition
    // pour éviter qu'ils viennent surcouper la période du dashboard.
    setFQuery({ ...w.query, dateFrom: "", dateTo: "" });
    setEditing(w); setCreating(true); setPreviewResults(null);
  }
  function handleSave() {
    if (!fName.trim()) return;
    const w: CustomWidget = {
      id: editing?.id || `cw_${Date.now()}`,
      name: fName.trim(), description: fDesc.trim(),
      chartType: fChart, color: fColor,
      style: fStyle,
      query: fQuery,
      createdAt: editing?.createdAt || new Date().toISOString(),
      // Lors de l'édition on conserve l'orgId existant. En création, on
      // applique l'orgContext de l'URL (si on est en mode atelier organisation).
      organizationId: editing?.organizationId ?? orgContextId ?? undefined,
    };
    // On écrit dans le pool global, pas la vue filtrée — sinon on perd les
    // widgets d'autres orgs.
    const updated = editing
      ? allWidgets.map((x) => x.id === editing.id ? w : x)
      : [...allWidgets, w];
    setWidgets(updated); saveWidgets(updated); setCreating(false); resetForm();
  }
  function handleDelete(id: string) {
    if (!confirm("Supprimer ce widget ?")) return;
    const u = allWidgets.filter((w) => w.id !== id); setWidgets(u); saveWidgets(u);
  }
  function handleDuplicate(w: CustomWidget) {
    const d: CustomWidget = {
      ...w,
      id: `cw_${Date.now()}`,
      name: `${w.name} (copie)`,
      createdAt: new Date().toISOString(),
      // Un duplicata hérite de l'orgId source, OU bascule sur l'orgContext
      // actif si on est en mode atelier d'une autre org.
      organizationId: orgContextId ?? w.organizationId,
    };
    const u = [...allWidgets, d]; setWidgets(u); saveWidgets(u);
  }

  function addFilter() {
    setFQuery((q) => ({ ...q, filters: [...q.filters, { field: allFields[0]?.name || "", operator: "eq", value: "" }] }));
  }
  function removeFilter(idx: number) {
    setFQuery((q) => ({ ...q, filters: q.filters.filter((_, i) => i !== idx) }));
  }
  function updateFilter(idx: number, patch: Partial<QueryFilter>) {
    setFQuery((q) => ({ ...q, filters: q.filters.map((f, i) => i === idx ? { ...f, ...patch } : f) }));
  }

  // Dataset change — reset dependent fields to safe defaults
  function pickDataset(id: string) {
    const ds = datasets.find((d) => d.id === id);
    setFQuery((q) => ({
      ...q, dataset: id, groupBy: "", aggregate: "count", aggregateField: "", filters: [],
      dateField: ds?.defaultDateField ?? "",
    }));
  }

  // Les agrégations numériques (sum/avg/min/max/median) n'ont de sens
  // que si le dataset expose au moins un champ numérique. Sinon on
  // désactive les boutons correspondants et on repli vers "count".
  const hasNumericAggField = useMemo(
    () => (currentDataset?.fields ?? []).some((f) => f.aggregable && f.type === "number"),
    [currentDataset],
  );
  const numericAggFields = useMemo(
    () => (currentDataset?.fields ?? []).filter((f) => f.aggregable && f.type === "number"),
    [currentDataset],
  );

  function pickAggregate(id: string) {
    setFQuery((q) => {
      const needsNumericField = ["sum", "avg", "min", "max", "median"].includes(id);
      if (needsNumericField && !hasNumericAggField) {
        // Dataset sans champ numérique → silencieusement bloqué par le
        // bouton désactivé. Mais si un ancien widget a stocké cette
        // agrégation, on la remappe à count.
        return { ...q, aggregate: "count", aggregateField: "" };
      }
      return {
        ...q, aggregate: id,
        aggregateField: needsNumericField && !q.aggregateField && numericAggFields[0]
          ? numericAggFields[0].name
          : q.aggregateField,
      };
    });
  }

  function pickGroupBy(base: string, bucket: string = "") {
    if (!base) { setFQuery((q) => ({ ...q, groupBy: "" })); return; }
    const def = groupableFields.find((f) => f.name === base);
    if (def?.type === "date") {
      const b = bucket || "_by_month";
      // Quand on passe à un groupBy date, on propose le tri chronologique
      // par défaut (ascendant = plus ancien → plus récent) car c'est le
      // cas d'usage principal (évolution temporelle). L'user peut toujours
      // basculer sur "value" ou autre.
      setFQuery((q) => ({
        ...q,
        groupBy: base + b,
        sortBy: q.sortBy === "value" || q.sortBy === "label" ? "chronological" : q.sortBy,
        sortDir: q.sortBy === "value" || q.sortBy === "label" ? "asc" : q.sortDir,
      }));
    } else {
      // Sortie d'un groupBy date → si le tri était chronologique, on repli
      // sur "value desc" (défaut universel).
      setFQuery((q) => ({
        ...q,
        groupBy: base,
        sortBy: q.sortBy === "chronological" ? "value" : q.sortBy,
        sortDir: q.sortBy === "chronological" ? "desc" : q.sortDir,
      }));
    }
  }

  // ==== Auto-preview on any meaningful change (debounced) ====
  async function runPreview() {
    if (!fQuery.dataset) return;
    setPreviewLoading(true); setPreviewError(null);
    try {
      const res = await fetch("/api/v1/analytics/query", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fQuery),
      });
      const d = await res.json();
      if (d.error) { setPreviewError(d.error); setPreviewResults(null); }
      else {
        // Remap labels des catégories de base si applicable (raw enum
        // → libellé utilisateur de Paramètres → Facturation).
        const remapped = remapBaseCategoryResults(fQuery.groupBy, d.results ?? []);
        setPreviewResults(remapped);
      }
    } catch {
      setPreviewError("Erreur réseau");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (!creating) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runPreview(); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating, fQuery]);

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className="space-y-5">
      <AnalyticsSectionTabs section="data" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Éditeur de widgets</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">{datasets.length} datasets · {widgets.length} widgets {orgContextId ? "visibles dans cet atelier" : "créés"}</p>
        </div>
        {!creating && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" /> Créer avec l&apos;IA
            </Button>
            <Button variant="primary" size="sm" onClick={startCreate}>
              <Plus className="h-3.5 w-3.5" /> Nouveau widget
            </Button>
          </div>
        )}
      </div>

      {orgContextId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2 flex-wrap">
          <Building2 className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-[12.5px] text-blue-900">
            <strong>Atelier organisation{orgContextName ? ` : ${orgContextName}` : ""}</strong>
            <div className="text-[11.5px] text-blue-800 mt-0.5">
              Les widgets créés ici seront attribués à cette organisation. Les widgets globaux restent visibles.
            </div>
          </div>
          <Link href="/analytics/widgets" className="text-[11.5px] text-blue-700 hover:text-blue-800 underline font-medium shrink-0">
            Voir tous les widgets →
          </Link>
        </div>
      )}

      {/* ============================================================ */}
      {/* Builder */}
      {/* ============================================================ */}
      {creating && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* LEFT column — wizard steps */}
          <div className="lg:col-span-3 space-y-3">
            {/* Step 1 — Dataset */}
            <StepCard number={1} title="Source de données" icon={<Database className="h-4 w-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {datasets.map((d) => {
                  const active = fQuery.dataset === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => pickDataset(d.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all",
                        active
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <span className={cn("flex-shrink-0", active ? "text-blue-600" : "text-slate-500")}>
                        {DATASET_ICONS[d.id] ?? <Database className="h-5 w-5" />}
                      </span>
                      <span className={cn("text-[12px] font-medium truncate", active ? "text-blue-900" : "text-slate-700")}>{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </StepCard>

            {/* Step 2 — Métrique */}
            <StepCard number={2} title="Que voulez-vous mesurer ?" icon={<Hash className="h-4 w-4" />}>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1.5">Fonction</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {AGGREGATES.map((a) => {
                      const active = fQuery.aggregate === a.id;
                      const needsNumeric = ["sum", "avg", "min", "max", "median"].includes(a.id);
                      const disabled = needsNumeric && !hasNumericAggField;
                      return (
                        <button
                          key={a.id}
                          onClick={() => { if (!disabled) pickAggregate(a.id); }}
                          disabled={disabled}
                          title={disabled
                            ? `${a.hint} — indisponible : aucun champ numérique dans ce dataset`
                            : a.hint}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-[11px] font-medium transition-all",
                            disabled
                              ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                              : active
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                          )}
                        >
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                  {!hasNumericAggField && currentDataset && (
                    <p className="mt-2 text-[10.5px] text-amber-700 bg-amber-50/60 border border-amber-200 rounded px-2 py-1">
                      Ce dataset n&apos;a pas de champ numérique agrégeable — seules les
                      fonctions <strong>Compter</strong> / <strong>Distinct</strong> /{" "}
                      <strong>Pourcentage</strong> sont disponibles.
                    </p>
                  )}
                </div>

                {["sum", "avg", "min", "max", "median"].includes(fQuery.aggregate) && hasNumericAggField && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Champ à agréger *</label>
                    <Select
                      value={fQuery.aggregateField || ""}
                      onValueChange={(v) => setFQuery((q) => ({ ...q, aggregateField: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Sélectionner un champ numérique…" /></SelectTrigger>
                      <SelectContent>
                        {numericAggFields.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </StepCard>

            {/* Step 3 — Décomposer par */}
            <StepCard number={3} title="Décomposer par (optionnel)" icon={<Layers className="h-4 w-4" />}>
              <div className="space-y-2.5">
                <Select
                  value={groupByBase || "__none__"}
                  onValueChange={(v) => pickGroupBy(v === "__none__" ? "" : v, groupByBucket)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucun (total global)</SelectItem>
                    {groupableFields.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                {groupByIsDate && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1.5">Granularité</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {DATE_BUCKETS.map((b) => {
                        const active = groupByBucket === b.id;
                        return (
                          <button
                            key={b.id}
                            onClick={() => pickGroupBy(groupByBase, b.id)}
                            className={cn(
                              "rounded-md border px-2 py-1.5 text-[11px] font-medium transition-all",
                              active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                            )}
                          >
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </StepCard>

            {/* Step 4 — Filtres (la période est appliquée au dashboard, pas au widget) */}
            <StepCard number={4} title="Filtres" icon={<Filter className="h-4 w-4" />}>
              <div className="space-y-3">
                {/* Sélecteur de champ de date — conservé pour que le
                    dashboard sache sur quel champ appliquer sa période.
                    Aucune date fixée ici : par défaut "toute la période". */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Champ de date (optionnel)
                    </label>
                    <Select
                      value={fQuery.dateField || "__none__"}
                      onValueChange={(v) => setFQuery((q) => ({ ...q, dateField: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Aucun — toute la période</SelectItem>
                        {(currentDataset?.dateFields ?? [currentDataset?.defaultDateField].filter(Boolean) as string[]).map((df) => (
                          <SelectItem key={df} value={df}>{currentDataset?.fields.find((f) => f.name === df)?.label ?? df}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-900 leading-snug">
                    <strong>Aucune période par défaut.</strong> La plage de dates
                    s&apos;applique depuis le rapport ou le dashboard qui affiche
                    le widget, sur le champ de date ci-contre.
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-600">Filtres ({fQuery.filters.length})</span>
                    <button onClick={addFilter} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Ajouter
                    </button>
                  </div>
                  {fQuery.filters.length === 0 && (
                    <p className="text-[11px] text-slate-400">Aucun filtre — toutes les données seront incluses</p>
                  )}
                  {fQuery.filters.map((f, idx) => (
                    <FilterRow
                      key={idx}
                      filter={f}
                      fields={allFields}
                      onChange={(patch) => updateFilter(idx, patch)}
                      onRemove={() => removeFilter(idx)}
                    />
                  ))}
                </div>
              </div>
            </StepCard>

            {/* Step 5 — Visualisation */}
            <StepCard number={5} title="Type de visualisation" icon={<BarChart3 className="h-4 w-4" />}>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {CHART_TYPES.map((c) => {
                  const active = fChart === c.id;
                  // Recommandation basée sur la forme du résultat :
                  // - 1 seule valeur (Total)     → number / progress / gauge
                  // - groupBy date (time series) → line / area / combo
                  // - 2-8 catégories             → bar / horizontal_bar / pie / donut
                  // - 9+ catégories              → horizontal_bar / table / treemap
                  const recommended = isChartRecommended(c.id, previewResults, groupByBucket);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setFChart(c.id)}
                      className={cn(
                        "relative flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 transition-all",
                        active
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                          : recommended
                          ? "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      )}
                      title={recommended ? `${c.label} — recommandé pour ces données` : c.label}
                    >
                      {recommended && !active && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" title="Recommandé" />
                      )}
                      <span className={cn(active ? "text-blue-600" : recommended ? "text-emerald-600" : "text-slate-500")}>{c.icon}</span>
                      <span className={cn("text-[10px] font-medium text-center leading-tight line-clamp-2", active ? "text-blue-900" : "text-slate-600")}>
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </StepCard>

            {/* Step 5b — Source secondaire (Sankey uniquement) */}
            {fChart === "sankey" && (
              <SecondarySourceCard
                datasets={datasets}
                query={fQuery}
                setQuery={setFQuery}
              />
            )}

            {/* Step 6 — Finitions */}
            <StepCard number={6} title="Nom & apparence" icon={<Pencil className="h-4 w-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input label="Nom *" placeholder="Ex: Tickets par statut" value={fName} onChange={(e) => setFName(e.target.value)} />
                  <Input label="Description" placeholder="Optionnel" value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Trier par</label>
                    <Select value={fQuery.sortBy} onValueChange={(v) => setFQuery((q) => ({ ...q, sortBy: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {/* "Chronologique" recommandé quand groupBy est un
                            bucket date — parse 2026-01 / 2026-S14 / 2026-T2
                            et trie par timestamp réel. */}
                        {groupByIsDate && (
                          <SelectItem value="chronological">
                            Chronologique (évolution dans le temps){groupByIsDate && fQuery.sortBy !== "chronological" ? " ✨" : ""}
                          </SelectItem>
                        )}
                        <SelectItem value="value">Valeur (numérique)</SelectItem>
                        <SelectItem value="label">Label alphabétique</SelectItem>
                        <SelectItem value="none">Ordre naturel (aucun tri)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Ordre</label>
                    <Select
                      value={fQuery.sortDir}
                      onValueChange={(v) => setFQuery((q) => ({ ...q, sortDir: v }))}
                      disabled={fQuery.sortBy === "none"}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fQuery.sortBy === "chronological" ? (
                          <>
                            <SelectItem value="asc">Plus ancien → plus récent</SelectItem>
                            <SelectItem value="desc">Plus récent → plus ancien</SelectItem>
                          </>
                        ) : fQuery.sortBy === "label" ? (
                          <>
                            <SelectItem value="asc">A → Z</SelectItem>
                            <SelectItem value="desc">Z → A</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="desc">Décroissant ↓ (plus gros en premier)</SelectItem>
                            <SelectItem value="asc">Croissant ↑ (plus petit en premier)</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input label="Limite" type="number" min={1} max={1000} value={fQuery.limit}
                    onChange={(e) => setFQuery((q) => ({ ...q, limit: parseInt(e.target.value) || 20 }))} />
                </div>

              </div>
            </StepCard>

            {/* Step 7 — Apparence */}
            <StepCard number={7} title="Apparence" icon={<Palette className="h-4 w-4" />}>
              <WidgetAppearance
                style={fStyle}
                onChange={(patch) => {
                  setFStyle((s) => ({ ...s, ...patch }));
                  // Synchronise fColor (usage legacy partout dans le fichier)
                  // quand l'utilisateur change la couleur primaire.
                  if (patch.primaryColor) setFColor(patch.primaryColor);
                }}
                labels={previewResults?.map((r) => r.label) ?? []}
              />
            </StepCard>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2">
              {/* Indicateur de validité — aide l'utilisateur à voir ce
                  qui manque avant de pouvoir sauvegarder. */}
              <ValidityHints
                name={fName}
                dataset={fQuery.dataset}
                aggregate={fQuery.aggregate}
                aggregateField={fQuery.aggregateField}
                hasPreview={!!previewResults}
                previewError={previewError}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCreating(false); resetForm(); }}>Annuler</Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!fName.trim() || !fQuery.dataset || (
                    ["sum", "avg", "min", "max", "median"].includes(fQuery.aggregate) && !fQuery.aggregateField
                  )}
                >
                  <Save className="h-3.5 w-3.5" /> {editing ? "Enregistrer" : "Créer le widget"}
                </Button>
              </div>
            </div>
          </div>

          {/* RIGHT column — live preview */}
          <div className="lg:col-span-2">
            <div className="sticky top-4 space-y-3">
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-7 w-7 rounded-md flex items-center justify-center" style={{ backgroundColor: fColor + "20" }}>
                        {previewLoading
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" style={{ color: fColor }} />
                          : <Check className="h-3.5 w-3.5" style={{ color: fColor }} />}
                      </div>
                      <h3 className="text-[13px] font-semibold text-slate-900">Aperçu en direct</h3>
                    </div>
                    <button onClick={runPreview} className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
                      <Play className="h-3 w-3" /> Rafraîchir
                    </button>
                  </div>

                  {previewError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700 mb-3">
                      <p className="font-semibold mb-0.5">Erreur</p>
                      <p>{previewError}</p>
                    </div>
                  )}

                  {!previewResults && !previewError && (
                    <p className="text-center py-8 text-[12px] text-slate-400">
                      {fQuery.dataset ? "Chargement…" : "Sélectionnez une source de données"}
                    </p>
                  )}

                  {previewResults && !previewError && (
                    <>
                      <WidgetPreview
                        results={previewResults}
                        chartType={fChart}
                        color={fColor}
                        style={fStyle}
                        name={fName || "Aperçu"}
                        aggregate={fQuery.aggregate}
                      />
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{previewResults.length} résultat{previewResults.length > 1 ? "s" : ""}</span>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <Badge variant="default" className="text-[9px]">{currentDataset?.label}</Badge>
                          <Badge variant="default" className="text-[9px]">{AGGREGATES.find((a) => a.id === fQuery.aggregate)?.label}</Badge>
                          {groupByBase && (
                            <Badge variant="default" className="text-[9px]">
                              ↳ {groupByFieldDef?.label}{groupByBucket && ` / ${DATE_BUCKETS.find((b) => b.id === groupByBucket)?.label}`}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Presets — création rapide */}
      {/* ============================================================ */}
      {!creating && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h3 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-violet-600" /> Modèles prédéfinis
                </h3>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  Aperçu visuel des modèles. Clique pour créer en un clic, tu pourras ensuite ajuster avec tes vraies données.
                </p>
              </div>
              <ColumnsPicker value={gridColumns} onChange={setGridColumns} />
            </div>
            <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", gridColsClass(gridColumns))}>
              {WIDGET_PRESETS.map((p) => {
                const mockResults = mockDataForPreset(p);
                const chartTypeLabel = CHART_TYPES.find((c) => c.id === p.chartType)?.label ?? p.chartType;
                const datasetLabel = datasets.find((d) => d.id === p.query.dataset)?.label ?? p.query.dataset;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => startCreateFromPreset(p)}
                    className="group text-left rounded-xl border border-slate-200 bg-white hover:border-violet-400 hover:shadow-md transition-all overflow-hidden flex flex-col"
                  >
                    {/* Aperçu visuel — vrai rendu du chart avec données mockées
                        plausibles. overflow-hidden pour clipper Recharts qui
                        peut dépasser légèrement son container. */}
                    <div
                      className="relative border-b border-slate-100 px-3 py-3 group-hover:bg-slate-50/50 transition-colors overflow-hidden"
                      style={{ backgroundColor: p.color + "08" }}
                    >
                      <div className={cn(previewChartHeight(gridColumns), "pointer-events-none overflow-hidden")}>
                        <WidgetChart
                          results={mockResults}
                          chartType={p.chartType}
                          color={p.color}
                          name=""
                          aggregate=""
                        />
                      </div>
                      {/* Badge type de chart en overlay */}
                      <span
                        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200"
                      >
                        {CHART_TYPES.find((c) => c.id === p.chartType)?.icon ?? <BarChart3 className="h-3 w-3" />}
                        {chartTypeLabel}
                      </span>
                    </div>
                    {/* Titre + description + dataset badge */}
                    <div className="p-3 flex-1 flex flex-col gap-1.5">
                      <div className="text-[13px] font-semibold text-slate-900 leading-tight group-hover:text-violet-700 transition-colors line-clamp-2">
                        {p.label}
                      </div>
                      <p className="text-[11.5px] text-slate-500 line-clamp-2 leading-snug">{p.description}</p>
                      <div className="mt-auto pt-1 flex items-center gap-1 flex-wrap">
                        <Badge variant="default" className="text-[9.5px] uppercase tracking-wide">
                          {datasetLabel}
                        </Badge>
                        {p.query.filters.length > 0 && (
                          <Badge variant="warning" className="text-[9.5px]">
                            {p.query.filters.length} filtre{p.query.filters.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Widget cards */}
      {/* ============================================================ */}
      {widgets.length === 0 && !creating && (
        <Card>
          <CardContent className="p-12 text-center">
            <BarChart3 className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-slate-900">Aucun widget créé</h3>
            <p className="mt-1 text-[13px] text-slate-500">Commence avec un modèle ci-dessus, ou lance l&apos;assistant vide.</p>
            <Button variant="primary" className="mt-4" onClick={startCreate}><Plus className="h-4 w-4" /> Créer depuis zéro</Button>
          </CardContent>
        </Card>
      )}

      {widgets.length > 0 && !creating && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h3 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-blue-600" /> Mes widgets
                </h3>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  {widgets.length} widget{widgets.length > 1 ? "s" : ""} créé{widgets.length > 1 ? "s" : ""}. Aperçu calculé sur les vraies données.
                </p>
              </div>
              <ColumnsPicker value={gridColumns} onChange={setGridColumns} />
            </div>
            <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", gridColsClass(gridColumns))}>
              {widgets.map((w) => {
                const ds = datasets.find((d) => d.id === w.query.dataset);
                const { base } = splitBucket(w.query.groupBy);
                const grp = ds?.fields.find((f) => f.name === base);
                const chartTypeLabel = CHART_TYPES.find((c) => c.id === w.chartType)?.label ?? w.chartType;
                const previewData = previewByWidgetId.get(w.id);
                const isLoadingPreview = previewLoadingIds.has(w.id) && !previewData;
                const hasData = previewData && previewData.length > 0;
                return (
                  <div
                    key={w.id}
                    className="group relative rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all overflow-hidden flex flex-col"
                  >
                    {/* Aperçu — vraies données fetchées en parallèle au mount */}
                    <button
                      type="button"
                      onClick={() => startEdit(w)}
                      className="block text-left w-full"
                      title="Cliquer pour éditer"
                    >
                      <div
                        className="relative border-b border-slate-100 px-3 py-3 group-hover:bg-slate-50/50 transition-colors overflow-hidden"
                        style={{ backgroundColor: w.color + "08" }}
                      >
                        <div className={cn(previewChartHeight(gridColumns), "pointer-events-none overflow-hidden")}>
                          {isLoadingPreview ? (
                            <div className="h-full flex items-center justify-center">
                              <div className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
                            </div>
                          ) : hasData ? (
                            <WidgetChart
                              results={previewData}
                              chartType={w.chartType}
                              color={w.color}
                              name=""
                              aggregate=""
                              style={w.style}
                            />
                          ) : (
                            <div className="h-full flex items-center justify-center text-[11px] text-slate-400 italic">
                              Aucune donnée
                            </div>
                          )}
                        </div>
                        {/* Badge type de chart en overlay */}
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                          {CHART_TYPES.find((c) => c.id === w.chartType)?.icon ?? <BarChart3 className="h-3 w-3" />}
                          {chartTypeLabel}
                        </span>
                      </div>
                    </button>
                    {/* Titre + description + actions + badges */}
                    <div className="p-3 flex-1 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-slate-900 leading-tight group-hover:text-blue-700 transition-colors line-clamp-2">
                            {w.name}
                          </div>
                          {w.description && (
                            <p className="text-[11.5px] text-slate-500 line-clamp-2 leading-snug mt-0.5">
                              {w.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => startEdit(w)} className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Éditer">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => handleDuplicate(w)} className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50" title="Dupliquer">
                            <Copy className="h-3 w-3" />
                          </button>
                          <button onClick={() => handleDelete(w.id)} className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50" title="Supprimer">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-auto pt-1 flex items-center gap-1 flex-wrap">
                        <Badge variant="default" className="text-[9.5px] uppercase tracking-wide">
                          {ds?.label ?? w.query.dataset}
                        </Badge>
                        {grp && (
                          <Badge variant="default" className="text-[9.5px]">↳ {grp.label}</Badge>
                        )}
                        {w.query.filters.length > 0 && (
                          <Badge variant="warning" className="text-[9.5px]">
                            {w.query.filters.length} filtre{w.query.filters.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {aiOpen && (
        <WidgetAiAssistant
          open
          onClose={() => setAiOpen(false)}
          onApply={applyAiDraft}
        />
      )}
    </div>
  );
}

// ===========================================================================
// SecondarySourceCard — 2e dataset pour un Sankey cashflow
// (ex. Revenus QBO → client A, B… + Dépenses QBO → fournisseur X, Y…)
// ===========================================================================
function SecondarySourceCard({
  datasets, query, setQuery,
}: {
  datasets: DatasetDef[];
  query: WidgetQuery;
  setQuery: React.Dispatch<React.SetStateAction<WidgetQuery>>;
}) {
  const enabled = !!query.secondaryDataset;
  const currentDs = datasets.find((d) => d.id === query.secondaryDataset);
  const groupable = currentDs?.fields.filter((f) => f.groupable) ?? [];
  const aggregable = currentDs?.fields.filter((f) => f.aggregable) ?? [];
  const needsField = !["count", "count_distinct", "percentage"].includes(query.secondaryAggregate ?? "count");

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-[11px] font-bold">S</div>
          <div className="flex items-center gap-1.5 text-slate-700">
            <Layers className="h-4 w-4 text-violet-500" />
            <h4 className="text-[13px] font-semibold">Source secondaire (Sankey)</h4>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              if (e.target.checked) {
                setQuery((q) => ({ ...q, secondaryDataset: datasets[0]?.id ?? "tickets", secondaryAggregate: "count" }));
              } else {
                setQuery((q) => ({
                  ...q,
                  secondaryDataset: "", secondaryGroupBy: "", secondaryAggregate: "",
                  secondaryAggregateField: "", secondaryDateField: "",
                  primarySourceLabel: "", secondarySourceLabel: "",
                }));
              }
            }}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          Activer
        </label>
      </div>

      {!enabled && (
        <p className="text-[11.5px] text-slate-500 leading-relaxed">
          Active pour créer un Sankey cashflow avec deux sources distinctes
          (ex.&nbsp;: <strong>Revenus QBO + Dépenses QBO → par catégorie</strong>).
          Chaque dataset fournit ses propres lignes ; le diagramme les présente
          comme deux nœuds sources.
        </p>
      )}

      {enabled && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Dataset secondaire</label>
              <Select
                value={query.secondaryDataset || ""}
                onValueChange={(v) => setQuery((q) => ({ ...q, secondaryDataset: v, secondaryGroupBy: "", secondaryAggregateField: "" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Libellé secondaire"
              placeholder="Ex: Dépenses"
              value={query.secondarySourceLabel ?? ""}
              onChange={(e) => setQuery((q) => ({ ...q, secondarySourceLabel: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Décomposer par</label>
              <Select
                value={query.secondaryGroupBy || "__none__"}
                onValueChange={(v) => setQuery((q) => ({ ...q, secondaryGroupBy: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Aucun (total)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun (total global)</SelectItem>
                  {groupable.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Fonction d&apos;agrégation</label>
              <Select
                value={query.secondaryAggregate || "count"}
                onValueChange={(v) => setQuery((q) => ({ ...q, secondaryAggregate: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">Compter</SelectItem>
                  <SelectItem value="count_distinct">Compter (distinct)</SelectItem>
                  <SelectItem value="sum">Somme</SelectItem>
                  <SelectItem value="avg">Moyenne</SelectItem>
                  <SelectItem value="min">Minimum</SelectItem>
                  <SelectItem value="max">Maximum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsField && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Champ à agréger *</label>
              <Select
                value={query.secondaryAggregateField || ""}
                onValueChange={(v) => setQuery((q) => ({ ...q, secondaryAggregateField: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Sélectionner un champ numérique…" /></SelectTrigger>
                <SelectContent>
                  {aggregable.length === 0 && <SelectItem value="_none" disabled>Aucun champ numérique</SelectItem>}
                  {aggregable.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Input
            label="Libellé primaire (optionnel)"
            placeholder="Ex: Revenus — hérite du dataset par défaut"
            value={query.primarySourceLabel ?? ""}
            onChange={(e) => setQuery((q) => ({ ...q, primarySourceLabel: e.target.value }))}
          />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// StepCard — visual container for each wizard step
// ===========================================================================
// ===========================================================================
// ValidityHints — affiche le premier champ manquant / la première erreur
// de manière compacte à côté du bouton Save. Aide l'user à comprendre
// pourquoi Save est bloqué sans avoir à deviner.
// ===========================================================================
function ValidityHints({
  name, dataset, aggregate, aggregateField, hasPreview, previewError,
}: {
  name: string; dataset: string; aggregate: string; aggregateField: string;
  hasPreview: boolean; previewError: string | null;
}) {
  if (previewError) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Erreur : {previewError.slice(0, 60)}
      </div>
    );
  }
  if (!dataset) {
    return <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Choisis une source de données</div>;
  }
  if (["sum", "avg", "min", "max", "median"].includes(aggregate) && !aggregateField) {
    return <div className="flex items-center gap-1.5 text-[11px] text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Choisis un champ à agréger</div>;
  }
  if (!name.trim()) {
    return <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Donne un nom au widget</div>;
  }
  if (hasPreview) {
    return <div className="flex items-center gap-1.5 text-[11px] text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Prêt à créer</div>;
  }
  return null;
}

function StepCard({
  number, title, icon, children,
}: {
  number: number; title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold">
          {number}
        </div>
        <div className="flex items-center gap-1.5 text-slate-700">
          <span className="text-slate-400">{icon}</span>
          <h4 className="text-[13px] font-semibold">{title}</h4>
        </div>
      </div>
      {children}
    </div>
  );
}

// ===========================================================================
// Preview renderer (unchanged — shared with dashboard grid via widget-chart.tsx)
// ===========================================================================
function WidgetPreview({ results, chartType, color, style: rawStyle, name, aggregate }: {
  results: QueryResult[]; chartType: ChartType; color: string; style?: VisualStyle; name: string; aggregate: string;
}) {
  if (!results.length) return <p className="text-center py-4 text-[12px] text-slate-400">Aucun résultat</p>;

  const style = mergeStyle(rawStyle, color);
  const isSingle = results.length === 1 && results[0].label === "Total";
  const maxVal = Math.max(...results.map((r) => r.value), 1);
  const barColors = colorsForResults(style, results);
  const pieColors = style.colorMode !== "single" ? barColors : generatePieColors(style.primaryColor, results.length);
  const gridDash = gridStrokeDasharray(style);
  const legendLayout = legendLayoutForPosition(style.legendPosition);
  const fmt = (v: number) => formatValue(v, style);
  // Wrappers pour satisfaire les types Recharts (ValueType | undefined).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtTooltip: any = (v: any) => fmt(Number(v ?? 0));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtAxis: any = (v: any) => fmt(Number(v ?? 0));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtLabel: any = (v: any) => fmt(Number(v ?? 0));

  if (chartType === "number" || isSingle) {
    return (
      <div className="text-center py-4">
        <p className="text-[11px] text-slate-500 mb-1">{name}</p>
        <p className="text-3xl font-bold tabular-nums" style={{ color: style.primaryColor }}>{fmt(results[0].value)}</p>
        <p className="text-[10px] text-slate-400 mt-1">{aggregate}</p>
      </div>
    );
  }

  if (chartType === "progress" && isSingle) {
    const pct = Math.min(100, Math.max(0, results[0].value));
    return (
      <div className="py-4 space-y-2">
        <div className="flex justify-between"><span className="text-[11px] text-slate-500">{name}</span><span className="text-[14px] font-bold" style={{ color: style.primaryColor }}>{fmt(pct)}{style.valueFormat === "percent" ? "" : "%"}</span></div>
        <div className={cn("h-3 bg-slate-100 overflow-hidden", style.corners === "sharp" ? "rounded-none" : style.corners === "pill" ? "rounded-full" : "rounded-md")}>
          <div className={cn("h-full", style.corners === "sharp" ? "rounded-none" : style.corners === "pill" ? "rounded-full" : "rounded-md")} style={{ width: `${pct}%`, backgroundColor: style.primaryColor }} />
        </div>
      </div>
    );
  }

  if (chartType === "bar") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }} barCategoryGap={`${style.barGapPercent}%`}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={style.xAxisRotation} textAnchor={style.xAxisRotation === 0 ? "middle" : "end"} height={style.xAxisRotation !== 0 ? 60 : 30} label={style.xAxisTitle ? { value: style.xAxisTitle, position: "insideBottom", offset: -10, fontSize: 11 } : undefined} />}
            {style.showYAxis && <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} label={style.yAxisTitle ? { value: style.yAxisTitle, angle: -90, position: "insideLeft", fontSize: 11 } : undefined} />}
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
            <Bar dataKey="value" radius={cornerRadiusForBar(style)}>
              {results.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
              {style.showDataLabels && <LabelList dataKey="value" position="top" formatter={fmtLabel} fontSize={10} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "horizontal_bar") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={Math.max(220, results.length * 32)}>
          <BarChart data={results} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />}
            {style.showYAxis && <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={120} />}
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
            <Bar dataKey="value" radius={cornerRadiusForHorizontalBar(style)}>
              {results.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
              {style.showDataLabels && <LabelList dataKey="value" position="right" formatter={fmtLabel} fontSize={10} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "line") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={style.xAxisRotation} textAnchor={style.xAxisRotation === 0 ? "middle" : "end"} height={style.xAxisRotation !== 0 ? 60 : 30} />}
            {style.showYAxis && <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />}
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
            <Line type="monotone" dataKey="value" stroke={style.primaryColor} strokeWidth={style.strokeWidth} dot={{ r: 3 }}>
              {style.showDataLabels && <LabelList dataKey="value" position="top" formatter={fmtLabel} fontSize={10} />}
            </Line>
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
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={style.xAxisRotation} textAnchor={style.xAxisRotation === 0 ? "middle" : "end"} height={style.xAxisRotation !== 0 ? 60 : 30} />}
            {style.showYAxis && <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />}
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
            <Area type="monotone" dataKey="value" stroke={style.primaryColor} strokeWidth={style.strokeWidth} fill={style.primaryColor} fillOpacity={0.25}>
              {style.showDataLabels && <LabelList dataKey="value" position="top" formatter={fmtLabel} fontSize={10} />}
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
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
              label={style.showDataLabels ? ((e: unknown) => {
                const entry = e as { name?: string; value?: number };
                return `${entry.name ?? ""} · ${fmt(Number(entry.value ?? 0))}`;
              }) as unknown as undefined : false}
              labelLine={false}
            >
              {results.map((_, i) => (
                <Cell key={i} fill={pieColors[i % pieColors.length]} />
              ))}
            </Pie>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <ReTooltip formatter={((v: any) => fmt(Number(v))) as any} />
            {style.showLegend && <Legend {...legendLayout} />}
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
    // Dual-source : si au moins 1 ligne porte un `source`, on construit
    // N sources (gauche) → M cibles (droite). Sinon, fallback 1 source
    // ("Total") → N cibles pour rester compatible avec les anciens widgets.
    const hasDual = results.some((r) => r.source);
    let nodes: { name: string }[];
    let links: { source: number; target: number; value: number }[];
    if (hasDual) {
      const sourceNames = Array.from(new Set(results.map((r) => r.source ?? "Total")));
      const targetNames = Array.from(new Set(results.map((r) => r.label)));
      nodes = [
        ...sourceNames.map((s) => ({ name: s })),
        ...targetNames.map((t) => ({ name: t })),
      ];
      const srcIdx = new Map(sourceNames.map((s, i) => [s, i]));
      const tgtIdx = new Map(targetNames.map((t, i) => [t, sourceNames.length + i]));
      links = results.map((r) => ({
        source: srcIdx.get(r.source ?? "Total") ?? 0,
        target: tgtIdx.get(r.label) ?? 0,
        value: r.value || 1,
      }));
    } else {
      nodes = [{ name: "Total" }, ...results.map((r) => ({ name: r.label }))];
      links = results.map((r, i) => ({ source: 0, target: i + 1, value: r.value || 1 }));
    }
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

  if (chartType === "combo" || chartType === "stacked_bar") {
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ReTooltip />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            {chartType === "combo" && (
              <Line type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "funnel") {
    const sorted = [...results].sort((a, b) => b.value - a.value);
    const maxVal = sorted[0]?.value ?? 1;
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <div className="space-y-1">
          {sorted.map((r, i) => {
            const widthPct = Math.max(10, (r.value / maxVal) * 100);
            return (
              <div key={i} className="flex items-center gap-2 justify-center">
                <div
                  className="h-8 rounded flex items-center justify-center text-[11px] font-semibold text-white transition-all mx-auto"
                  style={{ width: `${widthPct}%`, backgroundColor: pieColors[i % pieColors.length] }}
                  title={`${r.label}: ${r.value.toLocaleString("fr-CA")}`}
                >
                  <span className="truncate px-2">{r.label} — {r.value.toLocaleString("fr-CA")}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (chartType === "treemap") {
    const tmData = results.map((r, i) => ({
      name: r.label,
      size: Math.max(1, r.value),
      fill: pieColors[i % pieColors.length],
    }));
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <ResponsiveContainer width="100%" height={240}>
          <Treemap
            data={tmData}
            dataKey="size"
            nameKey="name"
            stroke="#fff"
            content={({ x, y, width: w, height: h, name, fill }: any) => (
              <g>
                <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#fff" strokeWidth={2} rx={4} />
                {w > 40 && h > 20 && (
                  <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#fff" fontWeight={600}>
                    {String(name).slice(0, Math.floor(w / 7))}
                  </text>
                )}
              </g>
            )}
          >
            <ReTooltip />
          </Treemap>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "heatmap") {
    const maxVal = Math.max(1, ...results.map((r) => r.value));
    const cols = Math.ceil(Math.sqrt(results.length));
    return (
      <div className="py-2">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {results.map((r, i) => {
            const intensity = r.value / maxVal;
            return (
              <div
                key={i}
                className="rounded p-2 text-center"
                style={{ backgroundColor: color, opacity: 0.15 + intensity * 0.85 }}
                title={`${r.label}: ${r.value.toLocaleString("fr-CA")}`}
              >
                <p className="text-[9px] text-white font-semibold truncate">{r.label}</p>
                <p className="text-[12px] text-white font-bold tabular-nums">{r.value.toLocaleString("fr-CA")}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (chartType === "gauge") {
    const val = results[0]?.value ?? 0;
    const maxGauge = 100;
    const pct = Math.min(1, val / maxGauge);
    const angle = -90 + pct * 180;
    return (
      <div className="py-2 flex flex-col items-center">
        <p className="text-[11px] text-slate-500 mb-2">{name}</p>
        <svg viewBox="0 0 200 120" className="w-48 h-28">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" strokeWidth={16} strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth={16} strokeLinecap="round"
            strokeDasharray={`${pct * 251.3} 251.3`} />
          <line x1="100" y1="100" x2={100 + 60 * Math.cos((angle * Math.PI) / 180)} y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
            stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
          <circle cx="100" cy="100" r="5" fill="#1e293b" />
          <text x="100" y="90" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e293b">{val}</text>
          <text x="100" y="115" textAnchor="middle" fontSize="10" fill="#64748b">{results[0]?.label ?? ""}</text>
        </svg>
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
