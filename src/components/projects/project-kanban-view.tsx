"use client";

import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Timer, TrendingUp, TrendingDown, Activity, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TicketCard } from "@/components/tickets/ticket-card";
import { ProjectKanbanQuickView } from "./project-kanban-quick-view";
import {
  mockTickets,
  type Ticket,
  type TicketStatus,
} from "@/lib/mock-data";
import { mockProjects, mockProjectTasks } from "@/lib/projects/mock-data";
import { mockTimeEntries } from "@/lib/billing/mock-data";
import { useKanbanStore, type KanbanColumn } from "@/stores/kanban-store";

interface ProjectKanbanViewProps {
  projectId: string;
}

function DraggableCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      <TicketCard ticket={ticket} onClick={onClick} />
    </div>
  );
}

function DroppableColumnBody({
  status,
  children,
  isEmpty,
}: {
  status: TicketStatus;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 overflow-y-auto px-2.5 py-2.5 transition-colors",
        isOver && "bg-blue-50/40"
      )}
    >
      <div className="space-y-2.5">
        {children}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/40 py-10 px-3 text-center">
            <p className="text-[11.5px] font-medium text-slate-400">Aucun ticket</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getAvatarGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-700",
    "from-violet-500 to-violet-700",
    "from-emerald-500 to-emerald-700",
    "from-amber-500 to-amber-700",
    "from-rose-500 to-rose-700",
    "from-cyan-500 to-cyan-700",
    "from-fuchsia-500 to-fuchsia-700",
    "from-indigo-500 to-indigo-700",
  ];
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ProjectKanbanView({ projectId }: ProjectKanbanViewProps) {
  const project = mockProjects.find((p) => p.id === projectId);
  const columnsConfig = useKanbanStore((s) => s.columns);

  const initialTickets = useMemo(
    () => mockTickets.filter((t) => t.projectId === projectId),
    [projectId]
  );
  const [localTickets, setLocalTickets] = useState<Ticket[]>(initialTickets);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [quickViewTicket, setQuickViewTicket] = useState<Ticket | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  useEffect(() => {
    setLocalTickets(initialTickets);
  }, [initialTickets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Stats
  const projectTasks = useMemo(
    () => mockProjectTasks.filter((t) => t.projectId === projectId),
    [projectId]
  );

  const ticketIds = useMemo(() => new Set(initialTickets.map((t) => t.id)), [initialTickets]);

  const projectTimeEntries = useMemo(
    () => mockTimeEntries.filter((e) => ticketIds.has(e.ticketId)),
    [ticketIds]
  );

  const plannedHours = useMemo(() => {
    const fromTasks = projectTasks.reduce(
      (s, t) => s + (t.estimatedHours ?? 0),
      0
    );
    return fromTasks > 0 ? fromTasks : project?.budgetHours ?? 0;
  }, [projectTasks, project]);

  const consumedHours = useMemo(
    () => projectTimeEntries.reduce((s, e) => s + e.durationMinutes, 0) / 60,
    [projectTimeEntries]
  );

  const remaining = plannedHours - consumedHours;
  const progressPct =
    plannedHours > 0 ? Math.min(100, (consumedHours / plannedHours) * 100) : 0;
  const isOver = remaining < 0;

  // By technician
  const byTechnician = useMemo(() => {
    const map = new Map<string, { name: string; minutes: number }>();
    projectTimeEntries.forEach((e) => {
      const cur = map.get(e.agentId) ?? { name: e.agentName, minutes: 0 };
      cur.minutes += e.durationMinutes;
      map.set(e.agentId, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
  }, [projectTimeEntries]);

  function handleDragStart(event: DragStartEvent) {
    const ticket = localTickets.find((t) => t.id === event.active.id);
    if (ticket) setActiveTicket(ticket);
  }
  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null);
    const { active, over } = event;
    if (!over) return;
    const ticketId = active.id as string;
    const newStatus = over.id as TicketStatus;
    setLocalTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );
  }

  function openQuickView(ticket: Ticket) {
    setQuickViewTicket(ticket);
    setQuickViewOpen(true);
  }

  function handleStatusChangeFromModal(ticketId: string, newStatus: TicketStatus) {
    setLocalTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );
  }

  const visibleColumns = useMemo(() => {
    return [...columnsConfig]
      .filter((c) => c.visible)
      .sort((a, b) => a.order - b.order)
      .map((col) => ({
        ...col,
        tickets: localTickets
          .filter((t) => t.status === col.status)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ),
      }));
  }, [columnsConfig, localTickets]);

  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Heures planifiées"
          value={`${plannedHours.toFixed(1)} h`}
          icon={Timer}
          tone="blue"
        />
        <StatCard
          label="Heures consommées"
          value={`${consumedHours.toFixed(1)} h`}
          icon={Activity}
          tone="violet"
        />
        <StatCard
          label="Restant"
          value={`${remaining.toFixed(1)} h`}
          icon={isOver ? TrendingDown : TrendingUp}
          tone={isOver ? "red" : "emerald"}
        />
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-amber-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-500">
              Avancement
            </p>
            <span className="text-[11px] font-semibold text-amber-700 tabular-nums">
              {progressPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isOver
                  ? "bg-gradient-to-r from-red-500 to-rose-600"
                  : "bg-gradient-to-r from-amber-400 to-orange-500"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* By technician */}
      {byTechnician.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
              Heures par technicien
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {byTechnician.map((t) => {
              const hours = t.minutes / 60;
              const pct = consumedHours > 0 ? (hours / consumedHours) * 100 : 0;
              return (
                <div
                  key={t.name}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2 min-w-[200px]"
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold shrink-0",
                      getAvatarGradient(t.name)
                    )}
                  >
                    {getInitials(t.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-slate-900 truncate">
                      {t.name}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {hours.toFixed(1)} h · {pct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kanban */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1"
          style={{ minHeight: "calc(100vh - 480px)" }}
        >
          {visibleColumns.map((col: KanbanColumn & { tickets: Ticket[] }) => (
            <div
              key={col.id}
              className="flex w-[300px] min-w-[300px] flex-shrink-0 flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              <div
                className={cn(
                  "flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/80 rounded-t-xl ring-1 ring-inset",
                  col.headerBg,
                  col.headerRing
                )}
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", col.dotClass)} />
                <h3 className="flex-1 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-700">
                  {col.label}
                </h3>
                <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-slate-700 tabular-nums shadow-sm ring-1 ring-inset ring-slate-200/60">
                  {col.tickets.length}
                </span>
              </div>
              <DroppableColumnBody
                status={col.status}
                isEmpty={col.tickets.length === 0}
              >
                {col.tickets.map((ticket) => (
                  <DraggableCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => openQuickView(ticket)}
                  />
                ))}
              </DroppableColumnBody>
            </div>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTicket && (
            <div className="rotate-2 cursor-grabbing scale-105 shadow-2xl rounded-xl">
              <TicketCard ticket={activeTicket} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ProjectKanbanQuickView
        ticket={quickViewTicket}
        open={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
        onStatusChange={handleStatusChangeFromModal}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "violet" | "emerald" | "red";
}) {
  const tones: Record<string, string> = {
    blue: "from-blue-50/60 to-white text-blue-700",
    violet: "from-violet-50/60 to-white text-violet-700",
    emerald: "from-emerald-50/60 to-white text-emerald-700",
    red: "from-red-50/60 to-white text-red-700",
  };
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-gradient-to-br p-4 shadow-sm",
        tones[tone].split(" ")[0],
        tones[tone].split(" ")[1]
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-500">
          {label}
        </p>
        <Icon className={cn("h-3.5 w-3.5", tones[tone].split(" ")[2])} />
      </div>
      <p className={cn("text-[20px] font-semibold tabular-nums", tones[tone].split(" ")[2])}>
        {value}
      </p>
    </div>
  );
}
