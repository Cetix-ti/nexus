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
const ROW_PX = 60; // Height of 1 row unit in pixels
const MAX_ROWS = 12;

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

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ---------------------------------------------------------------------------
// Hook: live resize with grid snapping
// Updates dimensions in real time during drag for a fluid experience.
// ---------------------------------------------------------------------------
function useLiveResize(
  axis: "both" | "x" | "y",
  item: { w: number; h: number },
  onCommit: (w: number, h: number) => void,
) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0, colW: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const container = el.closest("[data-grid-container]") as HTMLElement | null;
      const colW = (container?.clientWidth || 1000) / GRID_COLS;
      startRef.current = { x: e.clientX, y: e.clientY, w: item.w, h: item.h, colW };
      setDragging(true);
      setPreview({ w: item.w, h: item.h });
      el.setPointerCapture(e.pointerId);
    },
    [item.w, item.h],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const { x, y, w, h, colW } = startRef.current;
      const dCols = Math.round((e.clientX - x) / colW);
      const dRows = Math.round((e.clientY - y) / ROW_PX);
      const nextW = axis === "y" ? w : clamp(w + dCols, 1, GRID_COLS);
      const nextH = axis === "x" ? h : clamp(h + dRows, 1, MAX_ROWS);
      setPreview((prev) => {
        if (prev && prev.w === nextW && prev.h === nextH) return prev;
        return { w: nextW, h: nextH };
      });
    },
    [dragging, axis],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const el = e.currentTarget as HTMLElement;
      el.releasePointerCapture(e.pointerId);
      setDragging(false);
      if (preview && (preview.w !== item.w || preview.h !== item.h)) {
        onCommit(preview.w, preview.h);
      }
      setPreview(null);
    },
    [dragging, preview, item.w, item.h, onCommit],
  );

  return {
    dragging,
    preview,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}

// ---------------------------------------------------------------------------
// Sortable widget wrapper
// ---------------------------------------------------------------------------
function SortableWidget({
  item, editMode, onRemove, onResize, isMobile, isLaptop, children,
}: {
  item: DashboardItem;
  editMode: boolean;
  onRemove: () => void;
  onResize: (w: number, h: number) => void;
  isMobile?: boolean;
  isLaptop?: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id, disabled: !editMode });

  // Live resize handlers for corner, right edge, bottom edge
  const corner = useLiveResize("both", item, onResize);
  const rightEdge = useLiveResize("x", item, onResize);
  const bottomEdge = useLiveResize("y", item, onResize);

  // Display dimensions: use preview if any handle is dragging
  const activePreview =
    corner.preview ?? rightEdge.preview ?? bottomEdge.preview ?? null;
  const displayW = activePreview?.w ?? item.w;
  const displayH = activePreview?.h ?? item.h;
  const isResizing = corner.dragging || rightEdge.dragging || bottomEdge.dragging;

  const shouldExpandOnLaptop = isLaptop && LAPTOP_FULL_WIDTH_WIDGETS.has(item.widgetId);
  const colSpan = isMobile
    ? "1 / -1"
    : shouldExpandOnLaptop
    ? `span ${GRID_COLS}`
    : `span ${displayW}`;
  // `gridAutoRows: 60px` is a FIXED-size implicit row, so `minHeight` alone
  // doesn't grow it. We must spell out the row span so the grid layout
  // reserves H rows of 60px each = H * 60px of vertical space per widget.
  const rowSpan = isMobile ? undefined : `span ${displayH}`;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? "none" : transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging || isResizing ? 50 : undefined,
    gridColumn: colSpan,
    gridRow: rowSpan,
    minHeight: isMobile ? "auto" : `${displayH * ROW_PX}px`,
  };

  if (!editMode) {
    // View mode: explicitly span H rows so widgets aren't flattened to a
    // single 60-px track. Keep minHeight as a belt-and-suspenders for
    // browsers that ignore the row span when content is shorter.
    return (
      <div
        style={{
          gridColumn: colSpan,
          gridRow: rowSpan,
          minHeight: isMobile ? "auto" : `${displayH * ROW_PX}px`,
        }}
        className="w-full"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-xl bg-white transition-shadow",
        isDragging
          ? "ring-2 ring-blue-500 shadow-2xl"
          : isResizing
          ? "ring-2 ring-blue-500 shadow-lg"
          : "ring-1 ring-blue-300/60 hover:ring-blue-400 hover:shadow-md",
      )}
    >
      {/* Drag bar — top */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-blue-50 to-blue-50/60 rounded-t-xl border-b border-blue-200/60 cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <div className="flex items-center gap-1.5">
          <Move className="h-3 w-3 text-blue-500" />
          <span
            className={cn(
              "text-[10px] font-medium tabular-nums tracking-wide",
              isResizing ? "text-blue-700" : "text-blue-500",
            )}
          >
            {displayW} × {displayH}
          </span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Content — dimmed during resize for clearer size feedback */}
      <div
        className={cn(
          "overflow-auto transition-opacity",
          isResizing && "opacity-40",
        )}
        style={{ maxHeight: `${displayH * ROW_PX - 32}px` }}
      >
        {children}
      </div>

      {/* Resize handles */}
      <div
        {...rightEdge.handlers}
        className={cn(
          "absolute top-8 bottom-3 right-0 w-2 cursor-ew-resize z-20 touch-none rounded-r transition-colors",
          rightEdge.dragging ? "bg-blue-500/40" : "hover:bg-blue-400/30",
        )}
      />
      <div
        {...bottomEdge.handlers}
        className={cn(
          "absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize z-20 touch-none rounded-b transition-colors",
          bottomEdge.dragging ? "bg-blue-500/40" : "hover:bg-blue-400/30",
        )}
      />
      <div
        {...corner.handlers}
        className={cn(
          "absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-30 touch-none rounded-br-lg",
          "after:absolute after:bottom-1 after:right-1 after:w-2.5 after:h-2.5",
          "after:border-b-2 after:border-r-2 after:rounded-br-sm after:transition-colors",
          corner.dragging ? "after:border-blue-700" : "after:border-blue-400 hover:after:border-blue-600",
        )}
        title="Glisser pour redimensionner"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main grid
// ---------------------------------------------------------------------------
function useViewport() {
  const [vp, setVp] = useState<{ mobile: boolean; laptop: boolean }>({ mobile: false, laptop: false });
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      // "laptop" étendu jusqu'à 1536 px (Tailwind 2xl) pour couvrir les
      // laptops 14-15" à 150% scaling Windows : 1920×1200 natif → 1280
      // CSS px. Avant : 1280 pile tombait en "desktop" → widgets côte-à-
      // côte trop serrés. On bascule maintenant en layout full-width
      // jusqu'à atteindre un vrai grand écran (1536+ CSS px).
      setVp({ mobile: w < 640, laptop: w >= 640 && w < 1536 });
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return vp;
}

const LAPTOP_FULL_WIDTH_WIDGETS = new Set([
  // Historique : les tickets récents + « Mes tickets » prenaient déjà
  // toute la largeur en mode laptop. On ajoute :
  //   - `w_dash_unassigned` (tableau des tickets non assignés) — le
  //     tableau compressé sur 5 cols était illisible à 1280 CSS px
  //   - `w_dash_volume` (graphique "Volume de tickets") — le chart
  //     respire beaucoup mieux sur toute la largeur, chaque barre gagne
  //     du padding horizontal.
  "w_dash_recent",
  "w_dash_unassigned",
  "w_dash_my",
  "w_dash_volume",
]);

export function DashboardGrid({
  items, editMode, onReorder, onRemove, onResize, onAddClick, renderWidget,
}: DashboardGridProps) {
  const { mobile: isMobile, laptop: isLaptop } = useViewport();
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

  // Grid background — shows dotted cells in edit mode
  const gridBgStyle: React.CSSProperties | undefined = editMode && !isMobile
    ? {
        backgroundImage: `
          linear-gradient(to right, rgba(148, 163, 184, 0.25) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.18) 1px, transparent 1px)
        `,
        backgroundSize: `calc(100% / ${GRID_COLS}) 100%, 100% ${ROW_PX}px`,
        backgroundPosition: "0 0",
      }
    : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div
          data-grid-container
          className={cn(
            "grid gap-3 sm:gap-4 relative",
            editMode && "bg-slate-50/40 rounded-2xl p-4 ring-1 ring-dashed ring-slate-300/70"
          )}
          style={{
            // `minmax(0, 1fr)` au lieu de `1fr` : empêche les colonnes de
            // gonfler quand un enfant a un min-content plus large que le
            // viewport (Recharts, tableaux avec long texte, etc.). Sans ça,
            // une grille mobile à 1 colonne déborde dès qu'un widget contient
            // un graphique large.
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            // `minmax(60px, auto)` — rows ≥ 60 px mais grandissent si le
            // contenu est plus haut. Sans ce "auto", un widget dont le
            // contenu dépasse H × 60 px (ex: graphique recharts 280 px
            // dans un widget H=4=240 px) débordait par-dessus le widget
            // suivant. Avec `auto`, la row expand → les widgets du bas
            // descendent d'autant, plus de chevauchement.
            gridAutoRows: isMobile
              ? "auto"
              : `minmax(${ROW_PX}px, auto)`,
            ...gridBgStyle,
          }}
        >
          {items.map((item) => (
            <SortableWidget
              key={item.id}
              item={item}
              editMode={editMode}
              isMobile={isMobile}
              isLaptop={isLaptop}
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
