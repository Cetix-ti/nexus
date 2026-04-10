"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface VolumeDataPoint {
  date: string;
  tickets: number;
}

interface TicketVolumeChartProps {
  data: VolumeDataPoint[];
}

export function TicketVolumeChart({ data }: TicketVolumeChartProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-base font-semibold text-neutral-900">
          Ticket Volume
        </h3>
        <p className="text-sm text-neutral-500">Last 7 days</p>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="ticketGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontSize: "13px",
              }}
              labelStyle={{ color: "#374151", fontWeight: 600 }}
              itemStyle={{ color: "#3B82F6" }}
            />
            <Area
              type="monotone"
              dataKey="tickets"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#ticketGradient)"
              dot={{ r: 3, fill: "#3B82F6", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
