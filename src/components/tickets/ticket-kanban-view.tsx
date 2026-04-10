"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Plus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { TicketCard } from "./ticket-card";
import { TicketQuickViewModal } from "./ticket-quick-view-modal";
import { DoubleScroll } from "@/components/ui/double-scroll";
import { type Ticket, type TicketStatus } from "@/lib/mock-data";
import { useKanbanStore } from "@/stores/kanban-store";
import {
  useKanbanBoardsStore,
  type BoardColumn,
  type BoardGroupBy,
} from "@/stores/kanban-boards-store";
import { DEFAULT_COLUMNS_BY_GROUP } from "@/components/settings/kanban-columns-editor";

interface TicketKanbanViewProps {
  tickets: Ticket[];
  hiddenColumns?: string[];
}

// ----------------------------------------------------------------------------
// Draggable wrapper around TicketCard
// ----------------------------------------------------------------------------
function DraggableCard({
  ticket,
  onClick,
}: {
  ticket: Ticket;
  onClick: () => void;
}) {
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

// ----------------------------------------------------------------------------
// Droppable column body
// ----------------------------------------------------------------------------
function DroppableColumnBody({
  dropId,
  children,
  isEmpty,
}: {
  dropId: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
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
            <p className="text-[11.5px] font-medium text-slate-400">
              Aucun ticket
            </p>
            <p className="mt-0.5 text-[10.5px] text-slate-300">
              Glissez un ticket ici
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main Kanban view
// ----------------------------------------------------------------------------
export function TicketKanbanView({ tickets, hiddenColumns = [] }: TicketKanbanViewProps) {
  const columnsConfig = useKanbanStore((s) => s.columns);
  const activeBoardId = useKanbanBoardsStore((s) => s.activeBoardId);
  const boards = useKanbanBoardsStore((s) => s.boards);
  const activeBoard = boards.find((b) => b.id === activeBoardId) || boards[0];
  const groupBy: BoardGroupBy = activeBoard?.groupBy || "status";
  const [localTickets, setLocalTickets] = useState<Ticket[]>(tickets);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [quickViewTicket, setQuickViewTicket] = useState<Ticket | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  useEffect(() => {
    setLocalTickets(tickets);
  }, [tickets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    const ticket = localTickets.find((t) => t.id === event.active.id);
    if (ticket) setActiveTicket(ticket);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null);
    const { active, over } = event;
    if (!over) return;

    // Drag-to-update only makes sense when grouping by status
    if (groupBy !== "status") return;

    const ticketId = active.id as string;
    const newStatus = over.id as TicketStatus;

    // Update local state immediately (optimistic)
    setLocalTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );

    // Persist to DB
    fetch(`/api/v1/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus.toUpperCase() }),
    }).catch(() => {
      // Revert on failure
      setLocalTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: active.id as TicketStatus } : t))
      );
    });
  }

  // Extract the grouping key from a ticket for the active groupBy
  function ticketKey(t: Ticket): string {
    switch (groupBy) {
      case "status":
        return t.status;
      case "priority":
        return t.priority;
      case "organization":
        return t.organizationName;
      case "assignee":
        return t.assigneeName || "__unassigned__";
      case "category":
        return t.categoryName;
      case "ticket_type":
        return t.type;
      case "sla":
        if (t.slaBreached) return "breached";
        if (t.isOverdue) return "at_risk";
        return "on_track";
      default:
        return t.status;
    }
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

  // Build column model from active board's customColumns (or auto-generated for
  // dynamic groupings like organization/assignee/category) — fall back to legacy
  // status columns from kanban-store when board has no custom config.
  const visibleColumns = useMemo(() => {
    let cols: BoardColumn[] = activeBoard?.customColumns || [];

    // For dynamic groupBy (organization/assignee/category), auto-generate
    // columns from the actual tickets if none configured.
    if (cols.length === 0 && activeBoard) {
      if (
        groupBy === "organization" ||
        groupBy === "assignee" ||
        groupBy === "category"
      ) {
        const seen = new Map<string, string>();
        localTickets.forEach((t) => {
          const k = ticketKey(t);
          if (!seen.has(k)) seen.set(k, k);
        });
        cols = Array.from(seen.keys()).map((k, i) => ({
          id: `auto_${k}`,
          label: k === "__unassigned__" ? "Non assigné" : k,
          value: k,
          color: "#64748B",
          order: i,
          visible: true,
        }));
      } else {
        cols = DEFAULT_COLUMNS_BY_GROUP[groupBy] || [];
      }
    }

    // Last-resort fallback: legacy status columns
    if (cols.length === 0) {
      cols = [...columnsConfig]
        .filter((c) => c.visible)
        .sort((a, b) => a.order - b.order)
        .map((c, i) => ({
          id: c.id,
          label: c.label,
          value: c.status,
          color: "#3B82F6",
          order: i,
          visible: true,
        }));
    }

    return cols
      .filter((c) => c.visible)
      .filter((c) => !hiddenColumns.includes(c.value))
      .sort((a, b) => a.order - b.order)
      .map((col) => ({
        ...col,
        tickets: localTickets
          .filter((t) => ticketKey(t) === col.value)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime()
          ),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoard, columnsConfig, localTickets, groupBy, hiddenColumns]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <DoubleScroll className="-mx-1">
          <div
            className="flex gap-4 px-1 pb-1"
            style={{ minHeight: "calc(100vh - 320px)" }}
          >
            {visibleColumns.map((col) => (
            <div
              key={col.id}
              className="flex w-[260px] sm:w-[300px] min-w-[260px] sm:min-w-[300px] flex-shrink-0 flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              {/* Column header */}
              <div
                className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200/80 rounded-t-xl ring-1 ring-inset"
                style={{
                  backgroundColor: col.color + "12",
                  boxShadow: `inset 0 0 0 1px ${col.color}25`,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: col.color }}
                />

                <h3 className="flex-1 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-700">
                  {col.label}
                </h3>

                <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-slate-700 tabular-nums shadow-sm ring-1 ring-inset ring-slate-200/60">
                  {col.tickets.length}
                </span>

                <button
                  className="h-5 w-5 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all"
                  title="Ajouter un ticket"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                </button>

                <button
                  className="h-5 w-5 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all"
                  title="Options"
                >
                  <MoreHorizontal className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>

              <DroppableColumnBody
                dropId={col.value}
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
        </DoubleScroll>

        <DragOverlay dropAnimation={null}>
          {activeTicket && (
            <div className="rotate-2 cursor-grabbing scale-105 shadow-2xl rounded-xl">
              <TicketCard ticket={activeTicket} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Quick view modal */}
      <TicketQuickViewModal
        ticket={quickViewTicket}
        open={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
        onStatusChange={handleStatusChangeFromModal}
      />
    </>
  );
}
