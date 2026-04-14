"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Ticket, Users, AlertTriangle, ShieldCheck, Clock, CalendarDays,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TicketVolumeChart } from "@/components/dashboard/ticket-volume-chart";
import { PriorityChart } from "@/components/dashboard/priority-chart";
import { RecentTickets } from "@/components/dashboard/recent-tickets";
import { OrgChart } from "@/components/dashboard/org-chart";
import { DashboardGrid, type DashboardItem } from "@/components/widgets/dashboard-grid";
import { WidgetSidebar } from "@/components/widgets/widget-sidebar";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

interface DashboardData {
  stats: {
    openTickets: number; unassigned: number; overdue: number;
    slaCompliance: number; avgResolutionTime: number; ticketsToday: number;
  };
  ticketVolume: { date: string; tickets: number }[];
  ticketsByPriority: { name: string; value: number; color: string }[];
  ticketsByOrg: { name: string; tickets: number }[];
  recentTickets: any[];
  myTickets: any[];
}

const EMPTY: DashboardData = {
  stats: { openTickets: 0, unassigned: 0, overdue: 0, slaCompliance: 100, avgResolutionTime: 0, ticketsToday: 0 },
  ticketVolume: [], ticketsByPriority: [], ticketsByOrg: [], recentTickets: [], myTickets: [],
};

// Layout persistence
const LAYOUT_KEY = "nexus:dashboard:layout";
const DEFAULT_ITEMS: DashboardItem[] = [
  { id: "d_kpis", widgetId: "w_dash_kpis", w: 10, h: 2 },
  { id: "d_volume", widgetId: "w_dash_volume", w: 5, h: 4 },
  { id: "d_priority", widgetId: "w_dash_priority", w: 5, h: 4 },
  { id: "d_recent", widgetId: "w_dash_recent", w: 5, h: 5 },
  { id: "d_my", widgetId: "w_dash_my", w: 5, h: 5 },
  { id: "d_orgs", widgetId: "w_dash_orgs", w: 10, h: 4 },
];

function loadLayout(): DashboardItem[] {
  try {
    const r = localStorage.getItem(LAYOUT_KEY);
    if (r) {
      const parsed = JSON.parse(r) as DashboardItem[];
      // Migrate old widget IDs
      return parsed.map((item) => {
        if (item.widgetId === "kpis") return { ...item, widgetId: "w_dash_kpis" };
        if (item.widgetId === "ticket_volume") return { ...item, widgetId: "w_dash_volume" };
        if (item.widgetId === "priority_chart") return { ...item, widgetId: "w_dash_priority" };
        if (item.widgetId === "recent_tickets") return { ...item, widgetId: "w_dash_recent" };
        if (item.widgetId === "my_tickets") return { ...item, widgetId: "w_dash_my" };
        if (item.widgetId === "org_chart") return { ...item, widgetId: "w_dash_orgs" };
        return item;
      });
    }
  } catch {}
  return DEFAULT_ITEMS;
}
function saveLayout(items: DashboardItem[]) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(items)); } catch {} }

export default function DashboardPage() {
  const { data: session } = useSession();
  const greeting = getGreeting();
  const firstName = (session?.user as any)?.firstName || "";

  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState<DashboardItem[]>(() => loadLayout());
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    fetch("/api/v1/dashboard/stats")
      .then((r) => r.json())
      .then((res) => { if (res?.success && res.data) setData(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleReorder(newItems: DashboardItem[]) { setItems(newItems); saveLayout(newItems); }
  function handleRemove(id: string) { const u = items.filter((i) => i.id !== id); setItems(u); saveLayout(u); }
  function handleResize(id: string, w: number, h: number) { const u = items.map((i) => i.id === id ? { ...i, w, h } : i); setItems(u); saveLayout(u); }
  function resetLayout() { setItems(DEFAULT_ITEMS); saveLayout(DEFAULT_ITEMS); }

  // Widget renderer — maps widget IDs to actual components
  function renderWidget(widgetId: string) {
    switch (widgetId) {
      case "w_dash_kpis":
        return (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6 p-1 sm:p-2">
            <KpiCard label="Tickets ouverts" value={data.stats.openTickets} icon={Ticket} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <KpiCard label="Non assignés" value={data.stats.unassigned} icon={Users} iconColor="text-orange-600" iconBg="bg-orange-50" warning={data.stats.unassigned > 0} />
            <KpiCard label="En retard" value={data.stats.overdue} icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" warning={data.stats.overdue > 0} />
            <KpiCard label="Conformité SLA" value={`${data.stats.slaCompliance}%`} icon={ShieldCheck} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
            <KpiCard label="Résolution moy." value={`${data.stats.avgResolutionTime}h`} icon={Clock} iconColor="text-neutral-600" iconBg="bg-neutral-100" />
            <KpiCard label="Tickets aujourd'hui" value={data.stats.ticketsToday} icon={CalendarDays} iconColor="text-blue-600" iconBg="bg-blue-50" />
          </div>
        );
      case "w_dash_volume":
        return <TicketVolumeChart data={data.ticketVolume} />;
      case "w_dash_priority":
        return <PriorityChart data={data.ticketsByPriority} />;
      case "w_dash_recent":
        return <RecentTickets tickets={data.recentTickets} title="Tickets récents" />;
      case "w_dash_my":
        return <RecentTickets tickets={data.myTickets} title="Mes tickets" showAssignee={false} />;
      case "w_dash_orgs":
        return <OrgChart data={data.ticketsByOrg} />;
      default:
        return <div className="p-4 text-center text-slate-400 text-[13px]">Widget « {widgetId} »</div>;
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">Tableau de bord</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {greeting}{firstName ? `, ${firstName}` : ""}. Voici l&apos;état du service desk.
          </p>
        </div>
        {/* Edit mode is hidden on mobile — not practical with touch */}
        <div className="hidden sm:flex items-center gap-2">
          <Button variant={editMode ? "primary" : "outline"} size="sm" onClick={() => setEditMode(!editMode)}>
            <LayoutDashboard className="h-3.5 w-3.5" />
            {editMode ? "Terminer" : "Éditer"}
          </Button>
          {editMode && (
            <Button variant="ghost" size="sm" onClick={resetLayout} className="text-[12px] text-slate-500">
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard Grid */}
      <DashboardGrid
        items={items}
        editMode={editMode}
        onReorder={handleReorder}
        onRemove={handleRemove}
        onResize={handleResize}
        onAddClick={() => setShowSidebar(true)}
        renderWidget={renderWidget}
      />

      {/* Widget sidebar for adding */}
      <WidgetSidebar
        page="dashboard"
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        activeWidgetIds={items.map((i) => i.widgetId)}
        onAdd={(defId) => {
          const newItem: DashboardItem = { id: `d_${defId}_${Date.now()}`, widgetId: defId, w: 10, h: 3 };
          const u = [...items, newItem];
          setItems(u);
          saveLayout(u);
        }}
      />

      {loading && <p className="text-center text-xs text-slate-400">Chargement...</p>}
    </div>
  );
}
