"use client";

import { useState } from "react";
import {
  Download,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Star,
  TicketPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";


// ---------------------------------------------------------------------------
// Period options
// ---------------------------------------------------------------------------

const periods = [
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "90d", label: "90 jours" },
  { key: "12m", label: "12 mois" },
] as const;

type PeriodKey = (typeof periods)[number]["key"];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const kpis: Record<
  PeriodKey,
  {
    created: number;
    resolved: number;
    avgResolution: string;
    sla: number;
    satisfaction: number;
    createdTrend: number;
    resolvedTrend: number;
    slaTrend: number;
  }
> = {
  "7d": {
    created: 48,
    resolved: 42,
    avgResolution: "4.2h",
    sla: 94.5,
    satisfaction: 4.6,
    createdTrend: 8,
    resolvedTrend: 12,
    slaTrend: 2.1,
  },
  "30d": {
    created: 187,
    resolved: 174,
    avgResolution: "5.8h",
    sla: 91.2,
    satisfaction: 4.5,
    createdTrend: -3,
    resolvedTrend: 5,
    slaTrend: 1.8,
  },
  "90d": {
    created: 542,
    resolved: 521,
    avgResolution: "6.1h",
    sla: 89.7,
    satisfaction: 4.4,
    createdTrend: 11,
    resolvedTrend: 14,
    slaTrend: -0.5,
  },
  "12m": {
    created: 2184,
    resolved: 2096,
    avgResolution: "6.5h",
    sla: 88.3,
    satisfaction: 4.3,
    createdTrend: 15,
    resolvedTrend: 18,
    slaTrend: 3.2,
  },
};

const volumeData: Record<PeriodKey, { name: string; created: number; resolved: number }[]> = {
  "7d": [
    { name: "Lun", created: 8, resolved: 6 },
    { name: "Mar", created: 10, resolved: 9 },
    { name: "Mer", created: 6, resolved: 7 },
    { name: "Jeu", created: 9, resolved: 8 },
    { name: "Ven", created: 7, resolved: 5 },
    { name: "Sam", created: 4, resolved: 4 },
    { name: "Dim", created: 4, resolved: 3 },
  ],
  "30d": [
    { name: "Sem 1", created: 42, resolved: 38 },
    { name: "Sem 2", created: 48, resolved: 45 },
    { name: "Sem 3", created: 51, resolved: 47 },
    { name: "Sem 4", created: 46, resolved: 44 },
  ],
  "90d": [
    { name: "Jan", created: 58, resolved: 52 },
    { name: "Fév", created: 62, resolved: 59 },
    { name: "Mar", created: 71, resolved: 65 },
    { name: "Avr", created: 55, resolved: 54 },
    { name: "Mai", created: 48, resolved: 47 },
    { name: "Jun", created: 65, resolved: 61 },
    { name: "Jul", created: 59, resolved: 57 },
    { name: "Aoû", created: 42, resolved: 44 },
    { name: "Sep", created: 52, resolved: 50 },
    { name: "Oct", created: 68, resolved: 63 },
    { name: "Nov", created: 61, resolved: 58 },
    { name: "Déc", created: 45, resolved: 42 },
  ],
  "12m": [
    { name: "Avr", created: 165, resolved: 158 },
    { name: "Mai", created: 178, resolved: 170 },
    { name: "Jun", created: 192, resolved: 184 },
    { name: "Jul", created: 155, resolved: 150 },
    { name: "Aoû", created: 140, resolved: 138 },
    { name: "Sep", created: 188, resolved: 180 },
    { name: "Oct", created: 201, resolved: 193 },
    { name: "Nov", created: 195, resolved: 188 },
    { name: "Déc", created: 168, resolved: 162 },
    { name: "Jan", created: 182, resolved: 175 },
    { name: "Fév", created: 198, resolved: 190 },
    { name: "Mar", created: 222, resolved: 208 },
  ],
};

const priorityData = [
  { name: "Critique", value: 8, color: "#EF4444" },
  { name: "Haute", value: 22, color: "#F97316" },
  { name: "Moyenne", value: 38, color: "#EAB308" },
  { name: "Basse", value: 19, color: "#22C55E" },
];

const orgData = [
  { name: "Acme Corporation", tickets: 42 },
  { name: "Umbrella Corp", tickets: 35 },
  { name: "Globex Industries", tickets: 28 },
  { name: "Stark Industries", tickets: 23 },
  { name: "Initech Systems", tickets: 19 },
  { name: "Wayne Enterprises", tickets: 15 },
];

const resolutionByPriority = [
  { name: "Critique", time: 1.8 },
  { name: "Haute", time: 4.2 },
  { name: "Moyenne", time: 8.5 },
  { name: "Basse", time: 14.2 },
];

const technicianData = [
  {
    name: "Marie Tremblay",
    assigned: 34,
    resolved: 31,
    avgTime: "3.2h",
    sla: 97.1,
    rating: 4.8,
  },
  {
    name: "Jean-Philippe Martin",
    assigned: 29,
    resolved: 27,
    avgTime: "4.1h",
    sla: 94.5,
    rating: 4.6,
  },
  {
    name: "Sophie Lavoie",
    assigned: 26,
    resolved: 24,
    avgTime: "5.0h",
    sla: 92.3,
    rating: 4.5,
  },
  {
    name: "Lucas Bergeron",
    assigned: 31,
    resolved: 28,
    avgTime: "4.8h",
    sla: 90.8,
    rating: 4.4,
  },
  {
    name: "Isabelle Côté",
    assigned: 22,
    resolved: 21,
    avgTime: "3.8h",
    sla: 95.2,
    rating: 4.7,
  },
  {
    name: "Marc-André Roy",
    assigned: 28,
    resolved: 25,
    avgTime: "6.2h",
    sla: 88.0,
    rating: 4.2,
  },
  {
    name: "Émilie Gagnon",
    assigned: 17,
    resolved: 18,
    avgTime: "3.5h",
    sla: 96.4,
    rating: 4.9,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TrendIndicator({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        positive ? "text-emerald-600" : "text-red-600"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

function SlaBar({ value }: { value: number }) {
  const color =
    value >= 95 ? "bg-emerald-500" : value >= 90 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-neutral-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-sm text-neutral-700">{value}%</span>
    </div>
  );
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="text-sm font-medium text-neutral-700">{value.toFixed(1)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-neutral-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const data = kpis[period];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Rapports</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Analysez les performances de votre service desk
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Exporter
        </Button>
      </div>

      {/* Period Selector */}
      <div className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              period === p.key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <TicketPlus className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">Tickets créés</p>
                <p className="text-xl font-bold text-neutral-900">{data.created}</p>
                <TrendIndicator value={data.createdTrend} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">Tickets résolus</p>
                <p className="text-xl font-bold text-neutral-900">{data.resolved}</p>
                <TrendIndicator value={data.resolvedTrend} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">Temps moyen résolution</p>
                <p className="text-xl font-bold text-neutral-900">{data.avgResolution}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                <ShieldCheck className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">Taux SLA</p>
                <p className="text-xl font-bold text-neutral-900">{data.sla}%</p>
                <TrendIndicator value={data.slaTrend} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                <Star className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-neutral-500">Satisfaction client</p>
                <p className="text-xl font-bold text-neutral-900">{data.satisfaction}/5</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Volume Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Volume de tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={volumeData[period]}>
                <defs>
                  <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(value: string) =>
                    value === "created" ? "Créés" : "Résolus"
                  }
                />
                <Area
                  type="monotone"
                  dataKey="created"
                  name="created"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#gradCreated)"
                />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  name="resolved"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#gradResolved)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution par priorité</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }: any) =>
                    `${name ?? ""} ${((Number(percent) || 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-4">
              {priorityData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs text-neutral-600">
                    {entry.name} ({entry.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tickets by Organization */}
        <Card>
          <CardHeader>
            <CardTitle>Tickets par organisation</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={orgData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  stroke="#9CA3AF"
                  width={130}
                />
                <Tooltip />
                <Bar dataKey="tickets" name="Tickets" fill="#6366F1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Resolution Time by Priority */}
        <Card>
          <CardHeader>
            <CardTitle>Temps de résolution par priorité</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={resolutionByPriority}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9CA3AF"
                  label={{
                    value: "Heures",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#9CA3AF" },
                  }}
                />
                <Tooltip
                  formatter={(value) => [`${value}h`, "Temps moyen"]}
                />
                <Bar dataKey="time" name="Temps moyen (h)" radius={[4, 4, 0, 0]}>
                  {resolutionByPriority.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={
                        ["#EF4444", "#F97316", "#EAB308", "#22C55E"][index]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Technician Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Performance par technicien</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Technicien
                  </th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Assignés
                  </th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Résolus
                  </th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Temps moyen
                  </th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Conformité SLA
                  </th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {technicianData.map((tech) => (
                  <tr key={tech.name} className="hover:bg-neutral-50">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {tech.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <span className="text-sm font-medium text-neutral-900">
                          {tech.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-sm text-neutral-700">{tech.assigned}</td>
                    <td className="py-3 text-sm text-neutral-700">{tech.resolved}</td>
                    <td className="py-3 text-sm text-neutral-700">{tech.avgTime}</td>
                    <td className="py-3">
                      <SlaBar value={tech.sla} />
                    </td>
                    <td className="py-3">
                      <StarRating value={tech.rating} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
