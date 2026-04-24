"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  DndContext, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Plus, Move, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Grid config
// ---------------------------------------------------------------------------
const GRID_COLS = 20;
const ROW_PX = 60; // Height of 1 row unit in pixels
const MAX_ROWS = 12;

export interface DashboardItem {
  id: string;
  widgetId: string;
  w: number; // 1-20 columns
  h: number; // 1-12 row units
  /**
   * Échelle visuelle globale du contenu (1 = normal, 1.5 = 150%). Appliquée
   * via CSS zoom au wrapper externe — agrandit proportionnellement TOUT le
   * widget (titre + graphique).
   */
  fontScale?: number;
  /**
   * Échelle du TITRE uniquement — appliquée à un sous-wrapper autour du
   * nom du widget. Permet d'agrandir le titre sans toucher au graphique.
   * Widgets personnalisés uniquement.
   */
  titleScale?: number;
  /**
   * Échelle du GRAPHIQUE uniquement — appliquée au wrapper qui entoure
   * le chart (incluant ses axes, légende et data labels). Permet
   * d'agrandir le graphique sans toucher au titre. Widgets custom.
   */
  chartScale?: number;
  /**
   * Override de couleur pour ce widget dans ce dashboard uniquement.
   * S'applique aux widgets personnalisés (QueryWidget).
   */
  overrideColor?: string;
  /**
   * Override du type de graphique (bar / line / pie / …) pour ce widget
   * dans ce dashboard uniquement. S'applique aux widgets personnalisés.
   */
  overrideChartType?: string;
}

interface DashboardGridProps {
  items: DashboardItem[];
  editMode: boolean;
  onReorder: (items: DashboardItem[]) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, w: number, h: number) => void;
  onAddClick: () => void;
  /**
   * Rendu d'un widget. Le 4e paramètre — `item` — expose le DashboardItem
   * complet (fontScale, overrides) au moment du rendu. Les anciens
   * callers (widgetId/w/h) fonctionnent toujours : les paramètres
   * supplémentaires sont simplement ignorés.
   */
  renderWidget: (widgetId: string, w: number, h: number, item?: DashboardItem) => React.ReactNode;
  /**
   * Optionnel — appelé quand l'user clique sur l'icône "Apparence" d'une
   * cellule sélectionnée en mode édition. Le caller affiche alors sa
   * propre UI (popover, drawer) pour configurer fontScale/overrides.
   */
  onConfigure?: (id: string) => void;
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
// Préréglages rapides W / H — clic = resize instantané sans drag. Les
// valeurs couvrent les besoins dashboard (¼, ⅓, ½, ⅔, ¾, 1 sur 20 col ;
// S/M/L/XL sur l'axe vertical). Style compact chip-style.
const WIDTH_PRESETS: Array<{ label: string; w: number }> = [
  { label: "¼", w: 5 },
  { label: "⅓", w: 7 },
  { label: "½", w: 10 },
  { label: "⅔", w: 13 },
  { label: "¾", w: 15 },
  { label: "1", w: 20 },
];
const HEIGHT_PRESETS: Array<{ label: string; h: number }> = [
  { label: "S", h: 2 },
  { label: "M", h: 3 },
  { label: "L", h: 5 },
  { label: "XL", h: 8 },
];

function SortableWidget({
  item, editMode, onRemove, onResize, onConfigure, isMobile, isLaptop, selected, onSelect, children,
}: {
  item: DashboardItem;
  editMode: boolean;
  onRemove: () => void;
  onResize: (w: number, h: number) => void;
  onConfigure?: () => void;
  isMobile?: boolean;
  isLaptop?: boolean;
  selected?: boolean;
  onSelect?: () => void;
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
    //
    // `h-full` + `[&>*]:h-full` : force the (single) child to fill the full
    // height of the grid cell. Sans ça, si une ligne du grid devient tall
    // à cause d'un widget voisin avec beaucoup de contenu, un widget plus
    // court laisse un trou visible en bas de sa cellule. `min-h-0` évite
    // que le flex enfant déborde.
    return (
      <div
        style={{
          gridColumn: colSpan,
          gridRow: rowSpan,
          minHeight: isMobile ? "auto" : `${displayH * ROW_PX}px`,
        }}
        className="w-full h-full flex flex-col [&>*]:flex-1 [&>*]:min-h-0"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-widget-id={item.id}
      onClick={(e) => {
        // Ignore les clics sur les boutons internes (trash, chips…).
        const t = e.target as HTMLElement;
        if (t.closest("button") || t.closest("[data-no-select]")) return;
        onSelect?.();
      }}
      className={cn(
        "relative rounded-xl bg-white transition-shadow flex flex-col",
        isDragging
          ? "ring-2 ring-blue-500 shadow-2xl"
          : isResizing
          ? "ring-2 ring-blue-500 shadow-lg"
          : selected
          ? "ring-2 ring-blue-500 shadow-md"
          : "ring-1 ring-blue-300/60 hover:ring-blue-400 hover:shadow-md",
      )}
    >
      {/* Drag bar — top */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-blue-50/60 rounded-t-xl border-b border-blue-200/60 cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Move className="h-3 w-3 text-blue-500 shrink-0" />
          <span
            className={cn(
              "text-[10px] font-medium tabular-nums tracking-wide shrink-0",
              isResizing ? "text-blue-700" : "text-blue-500",
            )}
          >
            {displayW} × {displayH}
          </span>
          {/* Préréglages de taille — visibles UNIQUEMENT sur le widget
              sélectionné pour ne pas surcharger le header de tous les
              widgets en édition. Clic = resize instantané. */}
          {selected && (
            <div
              data-no-select
              className="flex items-center gap-0.5 ml-1 flex-wrap"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {WIDTH_PRESETS.map((p) => (
                <button
                  key={`w-${p.w}`}
                  onClick={(e) => { e.stopPropagation(); onResize(p.w, item.h); }}
                  className={cn(
                    "h-5 min-w-[22px] rounded px-1 text-[10px] font-semibold transition-colors",
                    item.w === p.w
                      ? "bg-blue-600 text-white"
                      : "bg-white/80 text-blue-700 hover:bg-blue-200",
                  )}
                  title={`Largeur ${p.label} (${p.w}/${GRID_COLS})`}
                >
                  {p.label}
                </button>
              ))}
              <span className="mx-1 h-3 w-px bg-blue-300" />
              {HEIGHT_PRESETS.map((p) => (
                <button
                  key={`h-${p.h}`}
                  onClick={(e) => { e.stopPropagation(); onResize(item.w, p.h); }}
                  className={cn(
                    "h-5 min-w-[22px] rounded px-1 text-[10px] font-semibold transition-colors",
                    item.h === p.h
                      ? "bg-blue-600 text-white"
                      : "bg-white/80 text-blue-700 hover:bg-blue-200",
                  )}
                  title={`Hauteur ${p.label} (${p.h})`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {selected && onConfigure && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onConfigure(); }}
              className="h-5 w-5 rounded flex items-center justify-center text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition-colors"
              title="Apparence (taille, couleur, type)"
            >
              <Sliders className="h-3 w-3" />
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Retirer ce widget"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content — dimmed during resize for clearer size feedback.
          `flex-1` + `[&>*]:h-full` : le contenu occupe toute la hauteur
          disponible de la carte, même si les données sont peu nombreuses.
          Pas de trou entre la fin des données et le bas de la carte. */}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-auto transition-opacity [&>*]:h-full",
          isResizing && "opacity-40",
        )}
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
  items, editMode, onReorder, onRemove, onResize, onAddClick, renderWidget, onConfigure,
}: DashboardGridProps) {
  const { mobile: isMobile, laptop: isLaptop } = useViewport();
  // Id du widget "sélectionné" (cliqué sur son header). Affiche un ring plus
  // marqué + expose les chips de taille. Arrow keys nudgent son ordre.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Désélectionne à la sortie du mode édition.
  useEffect(() => {
    if (!editMode) setSelectedId(null);
  }, [editMode]);
  // Désélectionne au clic hors widget.
  useEffect(() => {
    if (!selectedId) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-widget-id]")) setSelectedId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [selectedId]);

  const sensors = useSensors(
    // Activation distance réduite 5 → 2 px : pick-up plus réactif, drag
    // démarre au moindre mouvement du pointeur.
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(items, oldIdx, newIdx));
  }

  // Nudging au clavier — flèches ← → pour bouger le widget sélectionné d'un
  // cran dans l'ordre, ↑ ↓ pour -/+ 1 row de hauteur. Shift+← → resize en
  // largeur. Actif uniquement en édition avec un widget sélectionné, et
  // ignore si focus dans un input.
  useEffect(() => {
    if (!editMode || !selectedId) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const idx = items.findIndex((i) => i.id === selectedId);
      if (idx < 0) return;
      const it = items[idx];

      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedId(null);
        return;
      }

      if (e.shiftKey) {
        // Shift+flèches = resize width/height
        if (e.key === "ArrowRight") { e.preventDefault(); onResize(it.id, clamp(it.w + 1, 1, GRID_COLS), it.h); return; }
        if (e.key === "ArrowLeft")  { e.preventDefault(); onResize(it.id, clamp(it.w - 1, 1, GRID_COLS), it.h); return; }
        if (e.key === "ArrowDown")  { e.preventDefault(); onResize(it.id, it.w, clamp(it.h + 1, 1, MAX_ROWS)); return; }
        if (e.key === "ArrowUp")    { e.preventDefault(); onResize(it.id, it.w, clamp(it.h - 1, 1, MAX_ROWS)); return; }
      } else {
        // Flèches seules = déplacer dans l'ordre (left/up = reculer,
        // right/down = avancer).
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          if (idx === 0) return;
          e.preventDefault();
          onReorder(arrayMove(items, idx, idx - 1));
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          if (idx === items.length - 1) return;
          e.preventDefault();
          onReorder(arrayMove(items, idx, idx + 1));
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, selectedId, items, onReorder, onResize]);

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
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
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
            // viewport (Recharts, tableaux avec long texte, etc.).
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            // `minmax(60px, auto)` — rows ≥ 60 px mais grandissent si le
            // contenu est plus haut.
            gridAutoRows: isMobile
              ? "auto"
              : `minmax(${ROW_PX}px, auto)`,
            // `grid-auto-flow: dense` en mode édition : les widgets plus
            // petits comblent automatiquement les trous laissés par des
            // widgets plus larges placés avant. Élimine les "vides" que
            // l'utilisateur voyait en cherchant à placer un widget dans
            // un slot manifestement libre. Hors édition, flow standard
            // (row) pour garder une lecture séquentielle prévisible.
            gridAutoFlow: editMode && !isMobile ? "row dense" : undefined,
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
              selected={editMode && selectedId === item.id}
              onSelect={() => setSelectedId(item.id)}
              onRemove={() => onRemove(item.id)}
              onResize={(w, h) => onResize(item.id, w, h)}
              onConfigure={onConfigure ? () => onConfigure(item.id) : undefined}
            >
              {renderWidget(item.widgetId, item.w, item.h, item)}
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
