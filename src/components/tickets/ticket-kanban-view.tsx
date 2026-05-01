"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { Plus, ChevronDown, GripVertical } from "lucide-react";
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

// ----------------------------------------------------------------------------
// Column drag handle (sortable header)
// ----------------------------------------------------------------------------
// Réordonnancement des colonnes : on rend juste l'icône GripVertical
// draggable, pas la colonne entière — sinon ça entre en conflit avec
// le drop zone des tickets dans la même colonne. L'ID est préfixé par
// "col:" pour ne pas collisionner avec les ticket IDs.
function ColumnDragHandle({
  colValue,
  disabled,
}: {
  colValue: string;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `col:${colValue}`,
    disabled,
    data: { type: "column", colValue },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      className={cn(
        "h-5 w-5 inline-flex items-center justify-center rounded-md text-slate-400 transition-all",
        disabled
          ? "opacity-30 cursor-not-allowed"
          : "cursor-grab active:cursor-grabbing hover:bg-white hover:text-slate-700 hover:shadow-sm"
      )}
      title={disabled ? "Réorganisation indisponible pour ce regroupement" : "Glisser pour réorganiser la colonne"}
    >
      <GripVertical className="h-3.5 w-3.5" strokeWidth={2.25} />
    </button>
  );
}

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

// Nombre de tickets visibles par colonne avant de requérir un "Voir plus".
// Inspiré de Freshservice — garde les colonnes lisibles même avec 100+ tickets.
const DEFAULT_COLUMN_PAGE_SIZE = 20;
const COLUMN_PAGE_INCREMENT = 20;

export function TicketKanbanView({ tickets, hiddenColumns = [] }: TicketKanbanViewProps) {
  const router = useRouter();
  const columnsConfig = useKanbanStore((s) => s.columns);
  const reorderKanbanColumns = useKanbanStore((s) => s.reorderColumns);
  const activeBoardId = useKanbanBoardsStore((s) => s.activeBoardId);
  const boards = useKanbanBoardsStore((s) => s.boards);
  const updateBoard = useKanbanBoardsStore((s) => s.updateBoard);
  const activeBoard = boards.find((b) => b.id === activeBoardId) || boards[0];
  const groupBy: BoardGroupBy = activeBoard?.groupBy || "status";
  const [localTickets, setLocalTickets] = useState<Ticket[]>(tickets);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [activeColumnLabel, setActiveColumnLabel] = useState<string | null>(null);
  const [quickViewTicket, setQuickViewTicket] = useState<Ticket | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  // Limite par colonne : key = col.value (status/priority/etc), value =
  // nombre de tickets à rendre. Incrémente par le bouton "Voir plus".
  const [pageSizes, setPageSizes] = useState<Record<string, number>>({});

  useEffect(() => {
    setLocalTickets(tickets);
  }, [tickets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // Track in-flight drag requests to prevent race conditions
  const inFlightRef = useRef(new Map<string, AbortController>());

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "column") {
      const colValue = data.colValue as string;
      // On lit le label depuis visibleColumns pour l'overlay — évite de
      // recalculer pendant le drag.
      const col = visibleColumns.find((c) => c.value === colValue);
      setActiveColumnLabel(col?.label ?? colValue);
      return;
    }
    const ticket = localTickets.find((t) => t.id === event.active.id);
    if (ticket) setActiveTicket(ticket);
  }

  // Réordonne les colonnes et persiste. Cas gérés :
  //  - board avec customColumns → updateBoard avec order recalculé
  //  - groupBy === "status" sans customColumns → kanban-store.reorderColumns
  //  - dynamique (organization/assignee/category) → no-op (pas de cible)
  function handleColumnReorder(fromValue: string, toValue: string) {
    if (fromValue === toValue) return;
    const cols = activeBoard?.customColumns?.length ? activeBoard.customColumns : null;

    if (cols && cols.length > 0) {
      const fromIdx = cols.findIndex((c) => c.value === fromValue);
      const toIdx = cols.findIndex((c) => c.value === toValue);
      if (fromIdx === -1 || toIdx === -1) return;
      const next = cols.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const reordered = next.map((c, i) => ({ ...c, order: i }));
      updateBoard(activeBoard.id, { customColumns: reordered });
      return;
    }

    if (groupBy === "status") {
      // Travaille sur le tableau columnsConfig de kanban-store (legacy).
      const sorted = [...columnsConfig].sort((a, b) => a.order - b.order);
      const fromIdx = sorted.findIndex((c) => c.status === fromValue);
      const toIdx = sorted.findIndex((c) => c.status === toValue);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = sorted.splice(fromIdx, 1);
      sorted.splice(toIdx, 0, moved);
      reorderKanbanColumns(sorted.map((c) => c.id));
    }
    // Dynamic groupings : pas de persistance fiable, on ignore.
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null);
    setActiveColumnLabel(null);
    const { active, over } = event;
    if (!over) return;

    // Reorder de colonnes : active porte data.type === "column" et over.id
    // pointe sur une autre colonne (DroppableColumnBody → col.value).
    if (active.data.current?.type === "column") {
      const fromValue = active.data.current.colValue as string;
      const toValue = over.id as string;
      // over.id pour un body est la col.value brute. Si on dropait par
      // erreur sur un autre droppable préfixé, on ignore.
      if (typeof toValue === "string" && !toValue.startsWith("col:")) {
        handleColumnReorder(fromValue, toValue);
      }
      return;
    }

    // Drag-to-update only makes sense when grouping by status
    if (groupBy !== "status") return;

    const ticketId = active.id as string;
    const newStatus = over.id as TicketStatus;
    const previousStatus = localTickets.find((t) => t.id === ticketId)?.status;
    if (previousStatus === newStatus) return;

    // Cancel any in-flight request for the same ticket
    const existing = inFlightRef.current.get(ticketId);
    if (existing) existing.abort();

    const controller = new AbortController();
    inFlightRef.current.set(ticketId, controller);

    // Update local state immediately (optimistic)
    setLocalTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );

    // Persist to DB
    fetch(`/api/v1/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
      signal: controller.signal,
    }).then(() => {
      inFlightRef.current.delete(ticketId);
    }).catch((err) => {
      if (err?.name === "AbortError") return; // Superseded by newer drag
      inFlightRef.current.delete(ticketId);
      // Revert on failure
      if (previousStatus) {
        setLocalTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: previousStatus } : t))
        );
      }
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
            {visibleColumns.map((col) => {
              // Réordonnancement non supporté pour les regroupements
              // dynamiques (auto-générés depuis les tickets) — pas
              // d'endroit fiable où persister l'ordre.
              const reorderDisabled =
                groupBy === "organization" ||
                groupBy === "assignee" ||
                groupBy === "category";
              return (
            <div
              key={col.id}
              className="flex w-[260px] sm:w-[300px] min-w-[260px] sm:min-w-[300px] flex-shrink-0 flex-col rounded-xl border border-slate-200/80 bg-slate-50/40 shadow-[0_1px_2px_rgba(15,23,42,0.03)] max-h-[calc(100vh-220px)]"
            >
              {/* Column header */}
              <div
                className="flex items-center gap-1.5 px-3 py-3 border-b border-slate-200/80 rounded-t-xl ring-1 ring-inset"
                style={{
                  backgroundColor: col.color + "12",
                  boxShadow: `inset 0 0 0 1px ${col.color}25`,
                }}
              >
                <ColumnDragHandle colValue={col.value} disabled={reorderDisabled} />

                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: col.color }}
                />

                <h3 className="flex-1 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-700 truncate">
                  {col.label}
                </h3>

                <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-slate-700 tabular-nums shadow-sm ring-1 ring-inset ring-slate-200/60">
                  {col.tickets.length}
                </span>

                <button
                  className="h-5 w-5 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all"
                  title="Ajouter un ticket"
                  onClick={() => router.push("/tickets/new")}
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>

              <DroppableColumnBody
                dropId={col.value}
                isEmpty={col.tickets.length === 0}
              >
                {(() => {
                  const limit = pageSizes[col.value] ?? DEFAULT_COLUMN_PAGE_SIZE;
                  const shown = col.tickets.slice(0, limit);
                  const remaining = col.tickets.length - shown.length;
                  return (
                    <>
                      {shown.map((ticket) => (
                        <DraggableCard
                          key={ticket.id}
                          ticket={ticket}
                          onClick={() => openQuickView(ticket)}
                        />
                      ))}
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPageSizes((prev) => ({
                              ...prev,
                              [col.value]: (prev[col.value] ?? DEFAULT_COLUMN_PAGE_SIZE) + COLUMN_PAGE_INCREMENT,
                            }))
                          }
                          className="w-full rounded-lg border border-dashed border-slate-200 bg-white/60 hover:bg-white hover:border-slate-300 text-[11.5px] font-medium text-slate-600 px-3 py-2 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ChevronDown className="h-3 w-3" />
                          Voir {Math.min(remaining, COLUMN_PAGE_INCREMENT)} de plus
                          <span className="text-slate-400 font-normal">
                            ({remaining} restants)
                          </span>
                        </button>
                      )}
                    </>
                  );
                })()}
              </DroppableColumnBody>
            </div>
              );
            })}
          </div>
        </DoubleScroll>

        <DragOverlay dropAnimation={null}>
          {activeTicket && (
            <div className="rotate-2 cursor-grabbing scale-105 shadow-2xl rounded-xl">
              <TicketCard ticket={activeTicket} />
            </div>
          )}
          {activeColumnLabel && (
            <div className="rotate-1 scale-105 shadow-2xl rounded-xl bg-white border border-slate-300 px-4 py-3 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-700">
              {activeColumnLabel}
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
