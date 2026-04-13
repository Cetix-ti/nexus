import { create } from "zustand";

// ===========================================================================
// Widget system — shared across Reports, Finances, Org Reports
// ===========================================================================

export type WidgetSize = "sm" | "md" | "lg" | "full";

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string; // lucide icon name
  defaultSize: WidgetSize;
  /** Which pages can use this widget */
  availableIn: ("reports" | "finances" | "org_reports" | "my_space" | "dashboard")[];
  /** Is this a built-in widget or user-created? */
  builtIn: boolean;
  /** For custom widgets: what data source */
  dataSource?: string;
  /** Custom config */
  config?: Record<string, unknown>;
}

export interface DashboardWidget {
  id: string; // unique instance id
  definitionId: string;
  size: WidgetSize;
  order: number;
}

export interface Dashboard {
  id: string;
  name: string;
  page: string; // "reports" | "finances" | "org_reports" | "my_space"
  widgets: DashboardWidget[];
  isDefault: boolean;
}

// ===========================================================================
// Built-in widget definitions
// ===========================================================================
export const BUILTIN_WIDGETS: WidgetDefinition[] = [
  // Tickets
  { id: "w_ticket_kpis", name: "KPIs Tickets", description: "Créés, résolus, ouverts, SLA", category: "Tickets", icon: "Ticket", defaultSize: "full", availableIn: ["reports"], builtIn: true },
  { id: "w_tickets_status", name: "Tickets par statut", description: "Distribution par statut", category: "Tickets", icon: "Ticket", defaultSize: "md", availableIn: ["reports", "org_reports"], builtIn: true },
  { id: "w_tickets_priority", name: "Tickets par priorité", description: "Distribution par priorité", category: "Tickets", icon: "AlertTriangle", defaultSize: "md", availableIn: ["reports", "org_reports"], builtIn: true },
  { id: "w_tickets_type", name: "Tickets par type", description: "Incidents, demandes, etc.", category: "Tickets", icon: "FileText", defaultSize: "md", availableIn: ["reports", "org_reports"], builtIn: true },
  { id: "w_tickets_org", name: "Tickets par client", description: "Top clients par volume", category: "Tickets", icon: "Building2", defaultSize: "full", availableIn: ["reports"], builtIn: true },
  { id: "w_top_tickets", name: "Top tickets par temps", description: "Tickets avec le plus de temps", category: "Tickets", icon: "Clock", defaultSize: "full", availableIn: ["reports", "org_reports"], builtIn: true },

  // Finance
  { id: "w_finance_kpis", name: "KPIs Financiers", description: "Revenus, heures, taux", category: "Finances", icon: "DollarSign", defaultSize: "full", availableIn: ["reports", "finances"], builtIn: true },
  { id: "w_projection", name: "Projection mensuelle", description: "Revenus projetés", category: "Finances", icon: "TrendingUp", defaultSize: "full", availableIn: ["reports", "finances"], builtIn: true },
  { id: "w_monthly_trend", name: "Tendance mensuelle", description: "Graphique 12 mois", category: "Finances", icon: "BarChart3", defaultSize: "full", availableIn: ["reports", "finances", "org_reports"], builtIn: true },
  { id: "w_revenue_by_org", name: "Revenus par client", description: "Top clients par revenus", category: "Finances", icon: "Building2", defaultSize: "full", availableIn: ["reports", "finances"], builtIn: true },
  { id: "w_coverage", name: "Répartition couverture", description: "Facturable, inclus, etc.", category: "Finances", icon: "Receipt", defaultSize: "md", availableIn: ["reports", "finances", "org_reports"], builtIn: true },
  { id: "w_contract_usage", name: "Utilisation contrats", description: "Heures utilisées vs allouées", category: "Contrats", icon: "FileText", defaultSize: "full", availableIn: ["reports", "finances", "org_reports"], builtIn: true },

  // Performance
  { id: "w_agent_perf", name: "Performance techniciens", description: "Heures et revenus par agent", category: "Performance", icon: "Users", defaultSize: "md", availableIn: ["reports", "org_reports"], builtIn: true },
  { id: "w_resolution_time", name: "Temps de résolution", description: "Moyenne et médiane", category: "Performance", icon: "Timer", defaultSize: "sm", availableIn: ["reports", "org_reports"], builtIn: true },

  // QuickBooks
  { id: "w_qbo_kpis", name: "KPIs QuickBooks", description: "Comptes à recevoir, souffrance", category: "QuickBooks", icon: "DollarSign", defaultSize: "full", availableIn: ["finances", "reports"], builtIn: true },
  { id: "w_qbo_aging", name: "Vieillissement comptes", description: "Aging des factures", category: "QuickBooks", icon: "Clock", defaultSize: "full", availableIn: ["finances"], builtIn: true },
  { id: "w_qbo_revenue_history", name: "Historique revenus QBO", description: "Facturé vs payé par mois", category: "QuickBooks", icon: "BarChart3", defaultSize: "full", availableIn: ["finances"], builtIn: true },
  { id: "w_qbo_pnl", name: "Résultat net (P&L)", description: "Revenus, dépenses, profit", category: "QuickBooks", icon: "TrendingUp", defaultSize: "md", availableIn: ["finances", "reports"], builtIn: true },
  { id: "w_qbo_overdue", name: "Factures en souffrance", description: "Top factures impayées", category: "QuickBooks", icon: "AlertTriangle", defaultSize: "full", availableIn: ["finances"], builtIn: true },

  // Mon espace
  { id: "w_my_hours", name: "Mes heures", description: "Heures facturées personnelles", category: "Personnel", icon: "Clock", defaultSize: "md", availableIn: ["my_space"], builtIn: true },
  { id: "w_my_tickets", name: "Mes tickets", description: "Tickets assignés", category: "Personnel", icon: "Ticket", defaultSize: "md", availableIn: ["my_space"], builtIn: true },
  { id: "w_my_clients", name: "Mes clients", description: "Top clients par temps", category: "Personnel", icon: "Building2", defaultSize: "md", availableIn: ["my_space"], builtIn: true },

  // Tableau de bord
  { id: "w_dash_kpis", name: "KPIs Service Desk", description: "Tickets ouverts, non assignés, en retard, SLA, résolution, aujourd'hui", category: "Tableau de bord", icon: "Ticket", defaultSize: "full", availableIn: ["dashboard"], builtIn: true },
  { id: "w_dash_volume", name: "Volume des tickets (7j)", description: "Graphique du volume de tickets par jour", category: "Tableau de bord", icon: "BarChart3", defaultSize: "md", availableIn: ["dashboard"], builtIn: true },
  { id: "w_dash_priority", name: "Tickets par priorité", description: "Distribution des tickets ouverts par priorité", category: "Tableau de bord", icon: "AlertTriangle", defaultSize: "md", availableIn: ["dashboard"], builtIn: true },
  { id: "w_dash_recent", name: "Tickets récents", description: "Derniers tickets ouverts", category: "Tableau de bord", icon: "Clock", defaultSize: "md", availableIn: ["dashboard"], builtIn: true },
  { id: "w_dash_my", name: "Mes tickets assignés", description: "Tickets assignés à moi", category: "Tableau de bord", icon: "Ticket", defaultSize: "md", availableIn: ["dashboard"], builtIn: true },
  { id: "w_dash_orgs", name: "Tickets par organisation", description: "Top organisations par nombre de tickets", category: "Tableau de bord", icon: "Building2", defaultSize: "full", availableIn: ["dashboard"], builtIn: true },
];

// ===========================================================================
// Store
// ===========================================================================
interface WidgetStore {
  customWidgets: WidgetDefinition[];
  dashboards: Dashboard[];
  editMode: boolean;

  // Actions
  setEditMode: (on: boolean) => void;
  addCustomWidget: (widget: Omit<WidgetDefinition, "builtIn">) => void;
  removeCustomWidget: (id: string) => void;
  updateCustomWidget: (id: string, patch: Partial<WidgetDefinition>) => void;

  getDashboard: (page: string) => Dashboard;
  addWidgetToDashboard: (page: string, definitionId: string, size?: WidgetSize) => void;
  removeWidgetFromDashboard: (page: string, widgetInstanceId: string) => void;
  reorderDashboard: (page: string, widgets: DashboardWidget[]) => void;
  resizeWidget: (page: string, widgetInstanceId: string, size: WidgetSize) => void;

  getAllWidgets: (page: string) => WidgetDefinition[];
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

function saveToStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const STORAGE_KEY_CUSTOM = "nexus:widgets:custom";
const STORAGE_KEY_DASHBOARDS = "nexus:widgets:dashboards";

// Default dashboards for each page
const DEFAULT_DASHBOARDS: Dashboard[] = [
  {
    id: "dash_reports", name: "Rapports", page: "reports", isDefault: true,
    widgets: [
      { id: "i1", definitionId: "w_ticket_kpis", size: "full", order: 0 },
      { id: "i2", definitionId: "w_finance_kpis", size: "full", order: 1 },
      { id: "i3", definitionId: "w_projection", size: "full", order: 2 },
      { id: "i4", definitionId: "w_monthly_trend", size: "full", order: 3 },
      { id: "i5", definitionId: "w_tickets_status", size: "md", order: 4 },
      { id: "i6", definitionId: "w_tickets_priority", size: "md", order: 5 },
      { id: "i7", definitionId: "w_agent_perf", size: "md", order: 6 },
      { id: "i8", definitionId: "w_revenue_by_org", size: "full", order: 7 },
    ],
  },
  {
    id: "dash_finances", name: "Finances", page: "finances", isDefault: true,
    widgets: [
      { id: "f1", definitionId: "w_finance_kpis", size: "full", order: 0 },
      { id: "f2", definitionId: "w_projection", size: "full", order: 1 },
      { id: "f3", definitionId: "w_revenue_by_org", size: "md", order: 2 },
      { id: "f4", definitionId: "w_coverage", size: "md", order: 3 },
      { id: "f5", definitionId: "w_qbo_kpis", size: "full", order: 4 },
    ],
  },
];

export const useWidgetStore = create<WidgetStore>((set, get) => ({
  customWidgets: loadFromStorage(STORAGE_KEY_CUSTOM, []),
  dashboards: loadFromStorage(STORAGE_KEY_DASHBOARDS, DEFAULT_DASHBOARDS),
  editMode: false,

  setEditMode: (on) => set({ editMode: on }),

  addCustomWidget: (widget) => {
    const w: WidgetDefinition = { ...widget, builtIn: false };
    set((s) => {
      const next = [...s.customWidgets, w];
      saveToStorage(STORAGE_KEY_CUSTOM, next);
      return { customWidgets: next };
    });
  },

  removeCustomWidget: (id) => {
    set((s) => {
      const next = s.customWidgets.filter((w) => w.id !== id);
      saveToStorage(STORAGE_KEY_CUSTOM, next);
      // Also remove from all dashboards
      const dashes = s.dashboards.map((d) => ({ ...d, widgets: d.widgets.filter((w) => w.definitionId !== id) }));
      saveToStorage(STORAGE_KEY_DASHBOARDS, dashes);
      return { customWidgets: next, dashboards: dashes };
    });
  },

  updateCustomWidget: (id, patch) => {
    set((s) => {
      const next = s.customWidgets.map((w) => w.id === id ? { ...w, ...patch } : w);
      saveToStorage(STORAGE_KEY_CUSTOM, next);
      return { customWidgets: next };
    });
  },

  getDashboard: (page) => {
    const s = get();
    const existing = s.dashboards.find((d) => d.page === page);
    if (existing) return existing;
    const def = DEFAULT_DASHBOARDS.find((d) => d.page === page);
    return def || { id: `dash_${page}`, name: page, page, widgets: [], isDefault: true };
  },

  addWidgetToDashboard: (page, definitionId, size) => {
    set((s) => {
      const allDefs = [...BUILTIN_WIDGETS, ...s.customWidgets];
      const def = allDefs.find((w) => w.id === definitionId);
      const dashboards = [...s.dashboards];
      let dash = dashboards.find((d) => d.page === page);
      if (!dash) {
        dash = { id: `dash_${page}`, name: page, page, widgets: [], isDefault: true };
        dashboards.push(dash);
      }
      const maxOrder = dash.widgets.length > 0 ? Math.max(...dash.widgets.map((w) => w.order)) + 1 : 0;
      dash.widgets = [...dash.widgets, {
        id: `wi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        definitionId,
        size: size || def?.defaultSize || "md",
        order: maxOrder,
      }];
      saveToStorage(STORAGE_KEY_DASHBOARDS, dashboards);
      return { dashboards };
    });
  },

  removeWidgetFromDashboard: (page, widgetInstanceId) => {
    set((s) => {
      const dashboards = s.dashboards.map((d) =>
        d.page === page ? { ...d, widgets: d.widgets.filter((w) => w.id !== widgetInstanceId) } : d
      );
      saveToStorage(STORAGE_KEY_DASHBOARDS, dashboards);
      return { dashboards };
    });
  },

  reorderDashboard: (page, widgets) => {
    set((s) => {
      const dashboards = s.dashboards.map((d) =>
        d.page === page ? { ...d, widgets } : d
      );
      saveToStorage(STORAGE_KEY_DASHBOARDS, dashboards);
      return { dashboards };
    });
  },

  resizeWidget: (page, widgetInstanceId, size) => {
    set((s) => {
      const dashboards = s.dashboards.map((d) =>
        d.page === page ? { ...d, widgets: d.widgets.map((w) => w.id === widgetInstanceId ? { ...w, size } : w) } : d
      );
      saveToStorage(STORAGE_KEY_DASHBOARDS, dashboards);
      return { dashboards };
    });
  },

  getAllWidgets: (page) => {
    const s = get();
    return [...BUILTIN_WIDGETS, ...s.customWidgets].filter((w) => w.availableIn.includes(page as any));
  },
}));
