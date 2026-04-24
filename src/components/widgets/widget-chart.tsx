"use client";

// ============================================================================
// Rendu partagé d'un widget custom (query builder) pour les 19 types de
// graphiques supportés. Utilisé à la fois dans /analytics/widgets (aperçu
// live de l'édition) et /analytics/dashboards (affichage dans le grid).
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
  XAxis, YAxis, CartesianGrid,
} from "recharts";

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
   * Callback appelé quand l'utilisateur clique sur un point de données
   * (barre, part de pie, cellule treemap, etc.). Reçoit le label du point
   * cliqué. Utilisé pour le drill-down : le caller construit l'URL via
   * buildDrillDownUrl() et navigue.
   */
  onDrillDown?: (label: string) => void;
}

export function WidgetChart({ results, chartType, color, name, aggregate, onDrillDown }: WidgetChartProps) {
  if (!results || results.length === 0) {
    return <p className="text-center py-4 text-[12px] text-slate-400">Aucun résultat</p>;
  }

  const isSingle = results.length === 1 && results[0].label === "Total";
  const maxVal = Math.max(...results.map((r) => r.value), 1);
  const pieColors = generatePieColors(color, results.length);

  if (chartType === "number" || isSingle) {
    return (
      <div className="text-center py-4">
        {name && <p className="text-[11px] text-slate-500 mb-1">{name}</p>}
        <p className="text-3xl font-bold tabular-nums" style={{ color }}>
          {results[0].value.toLocaleString("fr-CA")}
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
          {name && <span className="text-[11px] text-slate-500">{name}</span>}
          <span className="text-[14px] font-bold" style={{ color }}>{pct}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
    );
  }

  if (chartType === "bar") {
    const drillable = !!onDrillDown;
    return (
      <div className="py-2">
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <div className="flex items-end gap-1 h-28">
          {results.map((r, i) => {
            const content = (
              <>
                <div className="w-full relative" style={{ height: "96px" }}>
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-t transition-opacity"
                    style={{ height: `${Math.max((r.value / maxVal) * 100, 4)}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-[8px] text-slate-400 truncate max-w-full text-center">{r.label}</span>
              </>
            );
            if (drillable) {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onDrillDown!(r.label)}
                  className="flex-1 flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 hover:brightness-110"
                  title={`Voir les entrées : ${r.label} (${r.value})`}
                >{content}</button>
              );
            }
            return <div key={i} className="flex-1 flex flex-col items-center gap-1">{content}</div>;
          })}
        </div>
      </div>
    );
  }

  if (chartType === "horizontal_bar") {
    const drillable = !!onDrillDown;
    return (
      <div className="py-2 space-y-1.5">
        {name && <p className="text-[11px] text-slate-500 mb-1">{name}</p>}
        {results.map((r, i) => {
          const inner = (
            <>
              <span className="text-[10px] text-slate-600 w-28 truncate text-left">{r.label}</span>
              <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(r.value / maxVal) * 100}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-[10px] font-bold text-slate-700 tabular-nums w-16 text-right">
                {r.value.toLocaleString("fr-CA")}
              </span>
            </>
          );
          if (drillable) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onDrillDown!(r.label)}
                className="w-full flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5 transition-colors"
                title={`Voir les entrées : ${r.label} (${r.value})`}
              >{inner}</button>
            );
          }
          return <div key={i} className="flex items-center gap-2">{inner}</div>;
        })}
      </div>
    );
  }

  if (chartType === "line") {
    return (
      <div className="py-2">
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
    return (
      <div className="py-2">
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={(e: any) => `${e.label} (${e.value})`}
              labelLine={false}
              onClick={onDrillDown ? ((data: unknown) => {
                const d = data as { payload?: { label?: string } } | { label?: string };
                const label = (d as { payload?: { label?: string } }).payload?.label ?? (d as { label?: string }).label;
                if (typeof label === "string") onDrillDown(label);
              }) : undefined}
              style={onDrillDown ? { cursor: "pointer" } : undefined}
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
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
    // Dual-source : N sources (gauche, un par `source` distinct) → M
    // cibles (droite, un par `label` distinct). Fallback 1-source
    // ("Total") pour les widgets sans champ source.
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
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <ResponsiveContainer width="100%" height={240}>
          <Sankey
            data={{ nodes, links }}
            nodePadding={20}
            nodeWidth={12}
            link={{ stroke: color, strokeOpacity: 0.4 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
    const maxVal2 = sorted[0]?.value ?? 1;
    return (
      <div className="py-2">
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <div className="space-y-1">
          {sorted.map((r, i) => {
            const widthPct = Math.max(10, (r.value / maxVal2) * 100);
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
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
            <ReTooltip />
          </Treemap>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === "heatmap") {
    const cols = Math.ceil(Math.sqrt(results.length));
    return (
      <div className="py-2">
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
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
        {name && <p className="text-[11px] text-slate-500 mb-2">{name}</p>}
        <svg viewBox="0 0 200 120" className="w-48 h-28">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" strokeWidth={16} strokeLinecap="round" />
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth={16} strokeLinecap="round"
            strokeDasharray={`${pct * 251.3} 251.3`} />
          <line x1="100" y1="100"
            x2={100 + 60 * Math.cos((angle * Math.PI) / 180)}
            y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
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
                <td className="py-1 text-right font-medium tabular-nums" style={{ color }}>
                  {r.value.toLocaleString("fr-CA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // list (et fallback)
  return (
    <div className="py-2 space-y-1">
      {results.map((r, i) => (
        <div key={i} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
          <span className="text-[11px] text-slate-700">{r.label}</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
            {r.value.toLocaleString("fr-CA")}
          </span>
        </div>
      ))}
    </div>
  );
}
