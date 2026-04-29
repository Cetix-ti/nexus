"use client";

// ============================================================================
// Rendu partagé d'un widget custom (query builder) pour les 19 types de
// graphiques supportés. Source de vérité unique : utilisé par
//   - /analytics/widgets (aperçu live de l'édition)
//   - /analytics/dashboards (affichage dans le grid)
//
// Honore la VisualStyle persistée sur le widget (axes, étiquettes valeurs
// au-dessus des barres, légende, grille, format des valeurs, etc.) — ces
// choix se reflètent maintenant en dashboard et plus seulement dans
// l'aperçu de l'éditeur. Drill-down disponible pour bar / horizontal_bar /
// pie / donut quand `onDrillDown` est passé.
// ============================================================================

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart as ReScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Sankey, Treemap, Tooltip as ReTooltip,
  XAxis, YAxis, CartesianGrid, Legend, LabelList,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  type VisualStyle,
  mergeStyle,
  formatValue,
  colorsForResults,
  cornerRadiusForBar,
  cornerRadiusForHorizontalBar,
  legendLayoutForPosition,
  gridStrokeDasharray,
} from "@/lib/analytics/widget-style";

export type ChartType =
  | "number"
  | "bar"
  | "horizontal_bar"
  | "stacked_bar"
  | "progress"
  | "table"
  | "list"
  | "line"
  | "area"
  | "combo"
  | "pie"
  | "donut"
  | "scatter"
  | "radar"
  | "funnel"
  | "treemap"
  | "heatmap"
  | "gauge"
  | "sankey";

export interface ChartDatum { label: string; value: number; source?: string }

export function generatePieColors(baseColor: string, count: number): string[] {
  const palette = [
    baseColor,
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
  ];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(palette[i % palette.length]);
  return out;
}

interface WidgetChartProps {
  results: ChartDatum[];
  chartType: ChartType;
  /** Couleur principale de fallback. La VisualStyle (si fournie) prime. */
  color: string;
  /**
   * Titre affiché au-dessus du graphique. Passer une chaîne vide pour
   * masquer complètement le titre interne (utile quand le caller rend
   * le titre séparément pour lui appliquer une taille distincte).
   */
  name: string;
  /** Optionnel — affiché sous la valeur en mode "number" (ex: "Somme") */
  aggregate?: string;
  /**
   * Configuration visuelle persistée sur la définition du widget : axes,
   * étiquettes de valeurs, légende, grille, format. Si absente, defaults
   * raisonnables via mergeStyle().
   */
  style?: Partial<VisualStyle>;
  /**
   * Callback appelé quand l'utilisateur clique sur un point de données
   * (barre, part de pie, cellule treemap, etc.). Reçoit le label du point
   * cliqué. Utilisé pour le drill-down : le caller construit l'URL via
   * buildDrillDownUrl() et navigue.
   */
  onDrillDown?: (label: string) => void;
}

export function WidgetChart({
  results,
  chartType,
  color,
  name,
  aggregate,
  style: rawStyle,
  onDrillDown,
}: WidgetChartProps) {
  if (!results || results.length === 0) {
    return <p className="text-center py-4 text-[12px] text-slate-400">Aucun résultat</p>;
  }

  const style = mergeStyle(rawStyle, color);
  const isSingle = results.length === 1 && results[0].label === "Total";
  const barColors = colorsForResults(style, results);
  const pieColors = style.colorMode !== "single"
    ? barColors
    : generatePieColors(style.primaryColor, results.length);
  const gridDash = gridStrokeDasharray(style);
  const legendLayout = legendLayoutForPosition(style.legendPosition);
  const fmt = (v: number) => formatValue(v, style);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtTooltip: any = (v: any) => fmt(Number(v ?? 0));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtAxis: any = (v: any) => fmt(Number(v ?? 0));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmtLabel: any = (v: any) => fmt(Number(v ?? 0));
  const showTitle = name !== "";

  const drillCursor: React.CSSProperties | undefined = onDrillDown ? { cursor: "pointer" } : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onBarClick = onDrillDown ? ((data: any) => {
    const label = data?.payload?.label ?? data?.label;
    if (typeof label === "string") onDrillDown(label);
  }) : undefined;

  if (chartType === "number" || isSingle) {
    return (
      <div className="text-center py-4">
        {showTitle && <p className="text-[11px] text-slate-500 mb-1">{name}</p>}
        <p className="text-3xl font-bold tabular-nums" style={{ color: style.primaryColor }}>
          {fmt(results[0].value)}
        </p>
        {aggregate && <p className="text-[10px] text-slate-400 mt-1">{aggregate}</p>}
      </div>
    );
  }

  if (chartType === "progress" && isSingle) {
    const pct = Math.min(100, Math.max(0, results[0].value));
    return (
      <div className="py-4 space-y-2">
        <div className="flex justify-between">
          {showTitle && <span className="text-[11px] text-slate-500">{name}</span>}
          <span className="text-[14px] font-bold" style={{ color: style.primaryColor }}>
            {fmt(pct)}{style.valueFormat === "percent" ? "" : "%"}
          </span>
        </div>
        <div className={cn(
          "h-3 bg-slate-100 overflow-hidden",
          style.corners === "sharp" ? "rounded-none" : style.corners === "pill" ? "rounded-full" : "rounded-md",
        )}>
          <div className={cn(
            "h-full",
            style.corners === "sharp" ? "rounded-none" : style.corners === "pill" ? "rounded-full" : "rounded-md",
          )} style={{ width: `${pct}%`, backgroundColor: style.primaryColor }} />
        </div>
      </div>
    );
  }

  if (chartType === "bar") {
    return (
      <div className="py-2">
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={results}
            margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            barCategoryGap={`${style.barGapPercent}%`}
          >
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              angle={style.xAxisRotation}
              textAnchor={style.xAxisRotation === 0 ? "middle" : "end"}
              height={style.xAxisRotation !== 0 ? 60 : 30}
              label={style.xAxisTitle ? { value: style.xAxisTitle, position: "insideBottom", offset: -10, fontSize: 11 } : undefined}
            />}
            {style.showYAxis && <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={fmtAxis}
              label={style.yAxisTitle ? { value: style.yAxisTitle, angle: -90, position: "insideLeft", fontSize: 11 } : undefined}
            />}
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
            <Bar dataKey="value" radius={cornerRadiusForBar(style)} onClick={onBarClick} style={drillCursor}>
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={Math.max(220, results.length * 32)}>
          <BarChart data={results} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />}
            {style.showYAxis && <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={120} />}
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
            <Bar dataKey="value" radius={cornerRadiusForHorizontalBar(style)} onClick={onBarClick} style={drillCursor}>
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              angle={style.xAxisRotation}
              textAnchor={style.xAxisRotation === 0 ? "middle" : "end"}
              height={style.xAxisRotation !== 0 ? 60 : 30}
              label={style.xAxisTitle ? { value: style.xAxisTitle, position: "insideBottom", offset: -10, fontSize: 11 } : undefined}
            />}
            {style.showYAxis && <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={fmtAxis}
              label={style.yAxisTitle ? { value: style.yAxisTitle, angle: -90, position: "insideLeft", fontSize: 11 } : undefined}
            />}
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              angle={style.xAxisRotation}
              textAnchor={style.xAxisRotation === 0 ? "middle" : "end"}
              height={style.xAxisRotation !== 0 ? 60 : 30}
              label={style.xAxisTitle ? { value: style.xAxisTitle, position: "insideBottom", offset: -10, fontSize: 11 } : undefined}
            />}
            {style.showYAxis && <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={fmtAxis}
              label={style.yAxisTitle ? { value: style.yAxisTitle, angle: -90, position: "insideLeft", fontSize: 11 } : undefined}
            />}
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
              onClick={onDrillDown ? ((data: unknown) => {
                const d = data as { payload?: { label?: string } } | { label?: string };
                const label = (d as { payload?: { label?: string } }).payload?.label ?? (d as { label?: string }).label;
                if (typeof label === "string") onDrillDown(label);
              }) : undefined}
              style={drillCursor}
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={220}>
          <ReScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis dataKey="x" name="Index" tick={{ fontSize: 10 }} />}
            {style.showYAxis && <YAxis dataKey="y" name="Valeur" tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />}
            <ReTooltip cursor={{ strokeDasharray: "3 3" }} formatter={fmtTooltip} />
            <Scatter data={scatterData} fill={style.primaryColor} />
          </ReScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "radar") {
    return (
      <div className="py-2">
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart data={results}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
            <PolarRadiusAxis tick={{ fontSize: 9 }} tickFormatter={fmtAxis} />
            <Radar dataKey="value" stroke={style.primaryColor} fill={style.primaryColor} fillOpacity={0.4} strokeWidth={style.strokeWidth} />
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "sankey") {
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={240}>
          <Sankey
            data={{ nodes, links }}
            nodePadding={20}
            nodeWidth={12}
            link={{ stroke: style.primaryColor, strokeOpacity: 0.4 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            node={{ stroke: style.primaryColor, fill: style.primaryColor } as any}
          >
            <ReTooltip formatter={fmtTooltip} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "combo" || chartType === "stacked_bar") {
    return (
      <div className="py-2">
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={results} margin={{ top: 10, right: 10, left: 0, bottom: 20 }} barCategoryGap={`${style.barGapPercent}%`}>
            {gridDash !== undefined && <CartesianGrid strokeDasharray={gridDash} stroke="#e2e8f0" />}
            {style.showXAxis && <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={style.xAxisRotation} textAnchor={style.xAxisRotation === 0 ? "middle" : "end"} height={style.xAxisRotation !== 0 ? 60 : 30} />}
            {style.showYAxis && <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtAxis} />}
            <ReTooltip formatter={fmtTooltip} />
            {style.showLegend && <Legend {...legendLayout} />}
            <Bar dataKey="value" radius={cornerRadiusForBar(style)} onClick={onBarClick} style={drillCursor}>
              {results.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
              {style.showDataLabels && <LabelList dataKey="value" position="top" formatter={fmtLabel} fontSize={10} />}
            </Bar>
            {chartType === "combo" && (
              <Line type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={style.strokeWidth} dot={{ r: 3 }} />
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <div className="space-y-1">
          {sorted.map((r, i) => {
            const widthPct = Math.max(10, (r.value / maxVal) * 100);
            return (
              <div key={i} className="flex items-center gap-2 justify-center">
                <div
                  className="h-8 rounded flex items-center justify-center text-[11px] font-semibold text-white transition-all mx-auto"
                  style={{ width: `${widthPct}%`, backgroundColor: pieColors[i % pieColors.length] }}
                  title={`${r.label}: ${fmt(r.value)}`}
                >
                  <span className="truncate px-2">{r.label} — {fmt(r.value)}</span>
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={240}>
          <Treemap
            data={tmData}
            dataKey="size"
            nameKey="name"
            stroke="#fff"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={({ x, y, width: w, height: h, name: n, fill }: any) => (
              <g>
                <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#fff" strokeWidth={2} rx={4} />
                {w > 40 && h > 20 && (
                  <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#fff" fontWeight={600}>
                    {String(n).slice(0, Math.floor(w / 7))}
                  </text>
                )}
              </g>
            )}
          >
            <ReTooltip formatter={fmtTooltip} />
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {results.map((r, i) => {
            const intensity = r.value / maxVal;
            return (
              <div
                key={i}
                className="rounded p-2 text-center"
                style={{ backgroundColor: style.primaryColor, opacity: 0.15 + intensity * 0.85 }}
                title={`${r.label}: ${fmt(r.value)}`}
              >
                <p className="text-[9px] text-white font-semibold truncate">{r.label}</p>
                <p className="text-[12px] text-white font-bold tabular-nums">{fmt(r.value)}</p>
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
        {showTitle && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <svg viewBox="0 0 200 120" className="w-48 h-28">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" strokeWidth={16} strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={style.primaryColor} strokeWidth={16} strokeLinecap="round"
            strokeDasharray={`${pct * 251.3} 251.3`} />
          <line x1="100" y1="100" x2={100 + 60 * Math.cos((angle * Math.PI) / 180)} y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
            stroke="#1e293b" strokeWidth={3} strokeLinecap="round" />
          <circle cx="100" cy="100" r="5" fill="#1e293b" />
          <text x="100" y="90" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e293b">{fmt(val)}</text>
          <text x="100" y="115" textAnchor="middle" fontSize="10" fill="#64748b">{results[0]?.label ?? ""}</text>
        </svg>
      </div>
    );
  }

  if (chartType === "table") {
    return (
      <div className="py-2">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-1 text-left text-slate-500 font-medium">Label</th>
              <th className="pb-1 text-right text-slate-500 font-medium">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1 text-slate-700">{r.label}</td>
                <td className="py-1 text-right font-medium tabular-nums" style={{ color: style.primaryColor }}>{fmt(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Fallback: list (simple key/value lines avec drill-down si dispo).
  return (
    <div className="py-2 space-y-1">
      {results.map((r, i) => {
        const inner = (
          <>
            <span className="text-[11px] text-slate-700">{r.label}</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: style.primaryColor }}>{fmt(r.value)}</span>
          </>
        );
        if (onDrillDown) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDrillDown(r.label)}
              className="w-full flex justify-between py-1 border-b border-slate-100 last:border-0 hover:bg-slate-50 rounded px-1 transition-colors"
              title={`Voir les entrées : ${r.label}`}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={i} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
