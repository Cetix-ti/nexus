"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, type PieLabelRenderProps } from "recharts";

interface PriorityDataPoint {
  name: string;
  value: number;
  color: string;
}

interface PriorityChartProps {
  data: PriorityDataPoint[];
}

const RADIAN = Math.PI / 180;

function renderCustomLabel(props: PieLabelRenderProps) {
  const cx = props.cx as number;
  const cy = props.cy as number;
  const midAngle = props.midAngle as number;
  const innerRadius = props.innerRadius as number;
  const outerRadius = props.outerRadius as number;
  const percent = props.percent as number;

  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.08) return null;

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function PriorityChart({ data }: PriorityChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-4 sm:mb-6">
        <h3 className="text-[14px] sm:text-base font-semibold text-neutral-900">
          Tickets par priorité
        </h3>
        <p className="text-[12px] sm:text-sm text-neutral-500">Répartition actuelle</p>
      </div>
      <div className="h-[220px] sm:h-[280px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={3}
              dataKey="value"
              label={renderCustomLabel}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontSize: "13px",
              }}
              formatter={(value) => [`${value} tickets`, ""]}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-neutral-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: 36 }}>
          <div className="text-center">
            <p className="text-2xl font-bold text-neutral-900">{total}</p>
            <p className="text-xs text-neutral-500">Total</p>
          </div>
        </div>
      </div>
    </div>
  );
}
