"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Building2 } from "lucide-react";

interface OrgDataPoint {
  name: string;
  tickets: number;
}

interface OrgChartProps {
  data: OrgDataPoint[];
}

// Palette douce, dégradée du plus actif (foncé) au moins actif (clair).
const COLORS = [
  "#1D4ED8",
  "#2563EB",
  "#3B82F6",
  "#60A5FA",
  "#93C5FD",
  "#BFDBFE",
  "#DBEAFE",
];

function colorFor(index: number) {
  return COLORS[Math.min(index, COLORS.length - 1)];
}

export function OrgChart({ data }: OrgChartProps) {
  // Tri décroissant et limitation aux 10 premières organisations pour
  // éviter un graphique illisible quand il y en a beaucoup.
  const sorted = [...data]
    .filter((d) => d.tickets > 0)
    .sort((a, b) => b.tickets - a.tickets)
    .slice(0, 10);

  const total = sorted.reduce((s, d) => s + d.tickets, 0);
  const max = sorted[0]?.tickets ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200/60">
            <Building2 className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">
              Tickets par organisation
            </h3>
            <p className="text-[12.5px] text-slate-500">
              Répartition des tickets actifs ({sorted.length} organisations)
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Total
          </p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {total}
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-[13px] text-slate-500">
          Aucun ticket actif à afficher
        </div>
      ) : (
        <div style={{ height: Math.max(220, sorted.length * 36 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 4, right: 32, left: 0, bottom: 4 }}
              barCategoryGap={8}
            >
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="#E2E8F0"
                horizontal={false}
              />
              <XAxis
                type="number"
                domain={[0, Math.ceil(max * 1.1)]}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: "#475569", fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={160}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "#F1F5F9" }}
                contentStyle={{
                  backgroundColor: "#0F172A",
                  border: "none",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px -5px rgb(15 23 42 / 0.25)",
                  fontSize: "12.5px",
                  padding: "8px 12px",
                  color: "#fff",
                }}
                itemStyle={{ color: "#fff" }}
                labelStyle={{
                  color: "#94A3B8",
                  fontSize: "11px",
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
                formatter={(value) => {
                  const n = typeof value === "number" ? value : Number(value);
                  return [`${n} ticket${n > 1 ? "s" : ""}`, "Actifs"];
                }}
              />
              <Bar
                dataKey="tickets"
                radius={[0, 8, 8, 0]}
                barSize={22}
                label={{
                  position: "right",
                  fill: "#475569",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {sorted.map((_, i) => (
                  <Cell key={i} fill={colorFor(i)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
