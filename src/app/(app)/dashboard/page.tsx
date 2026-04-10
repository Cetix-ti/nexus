"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Ticket,
  Users,
  AlertTriangle,
  ShieldCheck,
  Clock,
  CalendarDays,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TicketVolumeChart } from "@/components/dashboard/ticket-volume-chart";
import { PriorityChart } from "@/components/dashboard/priority-chart";
import { RecentTickets } from "@/components/dashboard/recent-tickets";
import { OrgChart } from "@/components/dashboard/org-chart";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

interface DashboardData {
  stats: {
    openTickets: number;
    unassigned: number;
    overdue: number;
    slaCompliance: number;
    avgResolutionTime: number;
    ticketsToday: number;
  };
  ticketVolume: { date: string; tickets: number }[];
  ticketsByPriority: { name: string; value: number; color: string }[];
  ticketsByOrg: { name: string; tickets: number }[];
  recentTickets: any[];
  myTickets: any[];
}

const EMPTY: DashboardData = {
  stats: {
    openTickets: 0,
    unassigned: 0,
    overdue: 0,
    slaCompliance: 100,
    avgResolutionTime: 0,
    ticketsToday: 0,
  },
  ticketVolume: [],
  ticketsByPriority: [],
  ticketsByOrg: [],
  recentTickets: [],
  myTickets: [],
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const greeting = getGreeting();
  const firstName = (session?.user as any)?.firstName || "";

  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/dashboard/stats")
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data) setData(res.data);
      })
      .catch((e) => console.error("dashboard load failed", e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Tableau de bord
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {greeting}{firstName ? `, ${firstName}` : ""}. Voici l&apos;état du service desk aujourd&apos;hui.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Tickets ouverts"
          value={data.stats.openTickets}
          icon={Ticket}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KpiCard
          label="Non assignés"
          value={data.stats.unassigned}
          icon={Users}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          warning={data.stats.unassigned > 0}
        />
        <KpiCard
          label="En retard"
          value={data.stats.overdue}
          icon={AlertTriangle}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          warning={data.stats.overdue > 0}
        />
        <KpiCard
          label="Conformité SLA"
          value={`${data.stats.slaCompliance}%`}
          icon={ShieldCheck}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <KpiCard
          label="Résolution moyenne"
          value={`${data.stats.avgResolutionTime}h`}
          icon={Clock}
          iconColor="text-neutral-600"
          iconBg="bg-neutral-100"
        />
        <KpiCard
          label="Tickets aujourd'hui"
          value={data.stats.ticketsToday}
          icon={CalendarDays}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TicketVolumeChart data={data.ticketVolume} />
        <PriorityChart data={data.ticketsByPriority} />
      </div>

      {/* Tickets Lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentTickets tickets={data.recentTickets} title="Tickets récents" />
        <RecentTickets
          tickets={data.myTickets}
          title="Mes tickets"
          showAssignee={false}
        />
      </div>

      {/* Organization Chart */}
      <OrgChart data={data.ticketsByOrg} />

      {loading && (
        <p className="text-center text-xs text-slate-400">Chargement...</p>
      )}
    </div>
  );
}
