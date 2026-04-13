"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Plus, Move } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Grid config
// ---------------------------------------------------------------------------
const GRID_COLS = 10;
const COL_PX = 1; // We use fr units, but need a reference for snapping
const ROW_PX = 60; // Height of 1 row unit in pixels

export interface DashboardItem {
  id: string;
  widgetId: string;
  w: number; // 1-10 columns
  h: number; // 1-10 row units
}

interface DashboardGridProps {
  items: DashboardItem[];
  editMode: boolean;
  onReorder: (items: DashboardItem[]) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, w: number, h: number) => void;
  onAddClick: () => void;
  renderWidget: (widgetId: string, w: number, h: number) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// Resize handle — drag to resize like a window
// ---------------------------------------------------------------------------
function ResizeHandle({ onResizeEnd }: { onResizeEnd: (dw: number, dh: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const deltaRef = useRef({ dx: 0, dy: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY };
    deltaRef.current = { dx: 0, dy: 0 };

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    deltaRef.current = {
      dx: e.clientX - startRef.current.x,
      dy: e.clientY - startRef.current.y,
    };
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    const el = e.currentTarget as HTMLElement;
    el.releasePointerCapture(e.pointerId);

    // Convert pixel delta to grid units
    // Estimate column width from parent
    const parent = el.closest("[data-grid-container]");
    const containerW = parent?.clientWidth || 1000;
    const colW = containerW / GRID_COLS;

    const dCols = Math.round(deltaRef.current.dx / colW);
    const dRows = Math.round(deltaRef.current.dy / ROW_PX);

    if (dCols !== 0 || dRows !== 0) {
      onResizeEnd(dCols, dRows);
    }
  }, [dragging, onResizeEnd]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        "absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-20 touch-none",
        "after:absolute after:bottom-1 after:right-1 after:w-3 after:h-3",
        "after:border-b-2 after:border-r-2 after:border-blue-400 after:rounded-br-sm",
        dragging && "after:border-blue-600",
      )}
      title="Glisser pour redimensionner"
    />
  );
}

// ---------------------------------------------------------------------------
// Right-edge resize handle (width only)
// ---------------------------------------------------------------------------
function ResizeHandleRight({ onResizeEnd }: { onResizeEnd: (dw: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const parent = (e.currentTarget as HTMLElement).closest("[data-grid-container]");
    const colW = (parent?.clientWidth || 1000) / GRID_COLS;
    const dCols = Math.round((e.clientX - startRef.current) / colW);
    if (dCols !== 0) onResizeEnd(dCols);
  }, [dragging, onResizeEnd]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={() => {}}
      onPointerUp={handlePointerUp}
      className={cn(
        "absolute top-8 bottom-4 right-0 w-2 cursor-ew-resize z-20 touch-none",
        "hover:bg-blue-400/30 transition-colors rounded-r",
        dragging && "bg-blue-400/40",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Bottom-edge resize handle (height only)
// ---------------------------------------------------------------------------
function ResizeHandleBottom({ onResizeEnd }: { onResizeEnd: (dh: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startRef.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const dRows = Math.round((e.clientY - startRef.current) / ROW_PX);
    if (dRows !== 0) onResizeEnd(dRows);
  }, [dragging, onResizeEnd]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={() => {}}
      onPointerUp={handlePointerUp}
      className={cn(
        "absolute bottom-0 left-4 right-4 h-2 cursor-ns-resize z-20 touch-none",
        "hover:bg-blue-400/30 transition-colors rounded-b",
        dragging && "bg-blue-400/40",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Sortable widget wrapper
// ---------------------------------------------------------------------------
function SortableWidget({
  item, editMode, onRemove, onResize, isMobile, children,
}: {
  item: DashboardItem;
  editMode: boolean;
  onRemove: () => void;
  onResize: (w: number, h: number) => void;
  isMobile?: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id, disabled: !editMode });

  const colSpan = isMobile ? "1 / -1" : `span ${item.w}`;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
    gridColumn: colSpan,
    minHeight: isMobile ? "auto" : `${item.h * ROW_PX}px`,
  };

  if (!editMode) {
    return (
      <div style={{ gridColumn: colSpan, minHeight: isMobile ? "auto" : `${item.h * ROW_PX}px` }} className="overflow-hidden w-full">
        {children}
      </div>
    );
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-xl transition-shadow",
        isDragging
          ? "ring-2 ring-blue-500 shadow-2xl"
          : "ring-2 ring-blue-300/60 hover:ring-blue-400",
      )}
    >
      {/* Drag bar — top */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between px-3 py-1 bg-blue-50/80 rounded-t-xl border-b border-blue-200/60 cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <div className="flex items-center gap-1.5">
          <Move className="h-3 w-3 text-blue-400" />
          <span className="text-[10px] text-blue-500">{item.w}×{item.h}</span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Content */}
      <div className="overflow-auto" style={{ maxHeight: `${item.h * ROW_PX - 28}px` }}>
        {children}
      </div>

      {/* Resize handles — window-style */}
      <ResizeHandleRight onResizeEnd={(dw) => onResize(clamp(item.w + dw, 1, GRID_COLS), item.h)} />
      <ResizeHandleBottom onResizeEnd={(dh) => onResize(item.w, clamp(item.h + dh, 1, 10))} />
      <ResizeHandle onResizeEnd={(dw, dh) => onResize(clamp(item.w + dw, 1, GRID_COLS), clamp(item.h + dh, 1, 10))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main grid
// ---------------------------------------------------------------------------
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

export function DashboardGrid({
  items, editMode, onReorder, onRemove, onResize, onAddClick, renderWidget,
}: DashboardGridProps) {
  const isMobile = useIsMobile();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(items, oldIdx, newIdx));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div
          data-grid-container
          className={cn(
            "grid gap-4",
            editMode && "bg-slate-50/50 rounded-2xl p-4 ring-1 ring-dashed ring-slate-200"
          )}
          style={{ gridTemplateColumns: isMobile ? "1fr" : `repeat(${GRID_COLS}, 1fr)` }}
        >
          {items.map((item) => (
            <SortableWidget
              key={item.id}
              item={item}
              editMode={editMode}
              isMobile={isMobile}
              onRemove={() => onRemove(item.id)}
              onResize={(w, h) => onResize(item.id, w, h)}
            >
              {renderWidget(item.widgetId, item.w, item.h)}
            </SortableWidget>
          ))}

          {editMode && (
            <div style={{ gridColumn: `span ${GRID_COLS}` }}>
              <button
                onClick={onAddClick}
                className="w-full rounded-xl border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/20 hover:bg-blue-50 py-6 flex flex-col items-center gap-2 transition-all group"
              >
                <div className="h-9 w-9 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
                  <Plus className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-[12px] font-medium text-blue-400 group-hover:text-blue-700 transition-colors">
                  Ajouter un widget
                </span>
              </button>
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
