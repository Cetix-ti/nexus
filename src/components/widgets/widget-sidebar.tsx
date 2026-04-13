"use client";

import { useState, useMemo } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  X, Search, Plus, GripVertical, Trash2,
  Ticket, DollarSign, Clock, BarChart3, Building2, Users, FileText,
  AlertTriangle, Receipt, TrendingUp, Timer, PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useWidgetStore,
  BUILTIN_WIDGETS,
  type WidgetDefinition,
  type DashboardWidget,
  type WidgetSize,
} from "@/stores/widget-store";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Ticket, DollarSign, Clock, BarChart3, Building2, Users, FileText,
  AlertTriangle, Receipt, TrendingUp, Timer, PieChart,
};

const SIZE_LABELS: Record<WidgetSize, string> = { sm: "S", md: "M", lg: "L", full: "XL" };

interface WidgetSidebarProps { page: string; open: boolean; onClose: () => void; onAdd?: (widgetDefId: string) => void; activeWidgetIds?: string[] }

// ---------------------------------------------------------------------------
// Sortable widget item (drag handle)
// ---------------------------------------------------------------------------
function SortableWidget({ widget, def, onRemove, onResize }: {
  widget: DashboardWidget;
  def: WidgetDefinition | undefined;
  onRemove: () => void;
  onResize: (size: WidgetSize) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const IconComp = def ? ICON_MAP[def.icon] : BarChart3;

  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200/60 group", isDragging && "shadow-lg ring-blue-300")}>
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0 touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      {IconComp && <IconComp className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
      <span className="text-[12px] font-medium text-slate-700 flex-1 truncate">{def?.name ?? widget.definitionId}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        {(["sm", "md", "lg", "full"] as WidgetSize[]).map((s) => (
          <button key={s} onClick={() => onResize(s)}
            className={cn("h-6 w-6 rounded text-[9px] font-bold transition-all",
              widget.size === s ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200" : "text-slate-400 hover:bg-slate-100"
            )}>
            {SIZE_LABELS[s]}
          </button>
        ))}
      </div>
      <button onClick={onRemove} className="text-slate-300 hover:text-red-500 transition-colors p-0.5 shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------
export function WidgetSidebar({ page, open, onClose, onAdd, activeWidgetIds }: WidgetSidebarProps) {
  const {
    getAllWidgets, getDashboard, addWidgetToDashboard,
    removeWidgetFromDashboard, reorderDashboard, resizeWidget,
    addCustomWidget, customWidgets,
  } = useWidgetStore();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWidget, setNewWidget] = useState({ name: "", description: "", category: "Personnalisé", icon: "BarChart3" });

  const dashboard = getDashboard(page);
  const availableWidgets = getAllWidgets(page);
  const usedDefIds = activeWidgetIds ? new Set(activeWidgetIds) : new Set(dashboard.widgets.map((w) => w.definitionId));
  const allDefs = [...BUILTIN_WIDGETS, ...customWidgets];

  const categories = useMemo(() => {
    const cats = new Set(availableWidgets.map((w) => w.category));
    return ["all", ...Array.from(cats)];
  }, [availableWidgets]);

  const filteredWidgets = useMemo(() => {
    return availableWidgets.filter((w) => {
      if (catFilter !== "all" && w.category !== catFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!w.name.toLowerCase().includes(q) && !w.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [availableWidgets, search, catFilter]);

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = dashboard.widgets.findIndex((w) => w.id === active.id);
    const newIdx = dashboard.widgets.findIndex((w) => w.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(dashboard.widgets, oldIdx, newIdx).map((w, i) => ({ ...w, order: i }));
    reorderDashboard(page, reordered);
  }

  function handleCreateCustom() {
    if (!newWidget.name.trim()) return;
    addCustomWidget({
      id: `w_custom_${Date.now()}`,
      name: newWidget.name,
      description: newWidget.description || "Widget personnalisé",
      category: newWidget.category || "Personnalisé",
      icon: newWidget.icon || "BarChart3",
      defaultSize: "md",
      availableIn: ["reports", "finances", "org_reports", "my_space"],
    });
    setNewWidget({ name: "", description: "", category: "Personnalisé", icon: "BarChart3" });
    setShowCreateForm(false);
  }

  if (!open) return null;

  const sortedWidgets = [...dashboard.widgets].sort((a, b) => a.order - b.order);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative ml-auto w-[440px] max-w-[90vw] h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900">Modifier le rapport</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Glissez pour réordonner — {sortedWidgets.length} widgets</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Active widgets — drag-and-drop */}
        <div className="px-5 py-3 border-b border-slate-200 shrink-0 bg-slate-50/50">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Widgets actifs — glissez pour réordonner</h3>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortedWidgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                {sortedWidgets.map((wi) => (
                  <SortableWidget
                    key={wi.id}
                    widget={wi}
                    def={allDefs.find((d) => d.id === wi.definitionId)}
                    onRemove={() => removeWidgetFromDashboard(page, wi.id)}
                    onResize={(size) => resizeWidget(page, wi.id, size)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {sortedWidgets.length === 0 && (
              <p className="text-[12px] text-slate-400 text-center py-6">Aucun widget — ajoutez-en depuis la banque ci-dessous</p>
            )}
          </div>
        </div>

        {/* Available widgets bank */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ajouter des widgets</h3>
            <button onClick={() => setShowCreateForm(!showCreateForm)} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              <Plus className="h-3 w-3" /> Créer
            </button>
          </div>

          {showCreateForm && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-slate-700">Nouveau widget</p>
              <input className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px]" placeholder="Nom" value={newWidget.name} onChange={(e) => setNewWidget((p) => ({ ...p, name: e.target.value }))} />
              <input className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[12px]" placeholder="Description" value={newWidget.description} onChange={(e) => setNewWidget((p) => ({ ...p, description: e.target.value }))} />
              <div className="flex gap-2">
                <select className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-[12px]" value={newWidget.category} onChange={(e) => setNewWidget((p) => ({ ...p, category: e.target.value }))}>
                  <option>Personnalisé</option><option>Tickets</option><option>Finances</option><option>Performance</option><option>QuickBooks</option>
                </select>
                <select className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-[12px]" value={newWidget.icon} onChange={(e) => setNewWidget((p) => ({ ...p, icon: e.target.value }))}>
                  {Object.keys(ICON_MAP).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-[11px]" onClick={() => setShowCreateForm(false)}>Annuler</Button>
                <Button variant="primary" size="sm" className="text-[11px]" onClick={handleCreateCustom} disabled={!newWidget.name.trim()}>Créer</Button>
              </div>
            </div>
          )}

          {/* Search + filters */}
          <div className="space-y-2 mb-3">
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} iconLeft={<Search className="h-3 w-3" />} />
            <div className="flex gap-1 flex-wrap">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={cn("rounded-md px-2 py-1 text-[10px] font-medium transition-all",
                    catFilter === cat ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200" : "bg-slate-100 text-slate-500 hover:text-slate-700"
                  )}>
                  {cat === "all" ? "Tous" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Widget cards */}
          <div className="space-y-1.5">
            {filteredWidgets.map((def) => {
              const IconComp = ICON_MAP[def.icon] || BarChart3;
              const isUsed = usedDefIds.has(def.id);
              return (
                <div key={def.id} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ring-1 ring-inset",
                  isUsed ? "bg-emerald-50/30 ring-emerald-200/60" : "bg-white ring-slate-200/60 hover:ring-blue-200 hover:bg-blue-50/20"
                )}>
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    isUsed ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                  )}>
                    <IconComp className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] font-medium text-slate-800 truncate">{def.name}</p>
                      {!def.builtIn && <Badge variant="default" className="text-[8px] py-0">Custom</Badge>}
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{def.description}</p>
                  </div>
                  {isUsed ? (
                    <span className="text-[10px] text-emerald-600 font-medium shrink-0">Actif</span>
                  ) : (
                    <button onClick={() => { if (onAdd) onAdd(def.id); else addWidgetToDashboard(page, def.id); }}
                      className="shrink-0 h-7 w-7 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
