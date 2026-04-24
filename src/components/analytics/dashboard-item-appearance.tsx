"use client";

// Popover d'apparence pour un widget dans un dashboard spécifique.
// Permet de régler, uniquement pour l'instance du widget sur ce
// dashboard (pas la définition globale) :
//   - la taille du contenu (zoom CSS)
//   - la couleur (widgets personnalisés uniquement)
//   - le type de graphique (widgets personnalisés uniquement)

import { X, Sliders, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardItem } from "@/components/widgets/dashboard-grid";
import type { ChartType } from "@/components/widgets/widget-chart";

const SCALE_PRESETS: Array<{ label: string; value: number; hint: string }> = [
  { label: "Compact",    value: 0.85, hint: "−15%" },
  { label: "Normal",     value: 1,    hint: "100%" },
  { label: "Grand",      value: 1.25, hint: "+25%" },
  { label: "Très grand", value: 1.5,  hint: "+50%" },
  { label: "Géant",      value: 1.75, hint: "+75%" },
];

function ScaleSection({
  label, hint, value, onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </h3>
      <p className="text-[10.5px] text-slate-500 mb-2 leading-relaxed">{hint}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {SCALE_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={cn(
              "rounded-md border px-1.5 py-2 text-center transition-colors",
              value === p.value
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            )}
            title={`${p.label} (${p.hint})`}
          >
            <div className="text-[11px] font-semibold">{p.label}</div>
            <div className="text-[9.5px] text-slate-400 mt-0.5">{p.hint}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

const CHART_TYPE_OPTIONS: Array<{ value: ChartType; label: string }> = [
  { value: "number",         label: "Nombre" },
  { value: "progress",       label: "Progression" },
  { value: "bar",            label: "Barres verticales" },
  { value: "horizontal_bar", label: "Barres horizontales" },
  { value: "stacked_bar",    label: "Barres empilées" },
  { value: "line",           label: "Ligne" },
  { value: "area",           label: "Aire" },
  { value: "combo",          label: "Combiné" },
  { value: "pie",            label: "Camembert" },
  { value: "donut",          label: "Donut" },
  { value: "table",          label: "Tableau" },
  { value: "list",           label: "Liste" },
  { value: "scatter",        label: "Nuage de points" },
  { value: "radar",          label: "Radar" },
  { value: "funnel",         label: "Entonnoir" },
  { value: "treemap",        label: "Carte des aires" },
  { value: "gauge",          label: "Jauge" },
];

const COLOR_PRESETS = [
  "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#be185d", "#4f46e5", "#0d9488", "#ea580c",
  "#84cc16", "#db2777", "#0f172a", "#64748b",
];

interface Props {
  item: DashboardItem;
  /** Le widget supporte-t-il les overrides de couleur/type (widgets custom). */
  supportsStyleOverride: boolean;
  onChange: (patch: Partial<DashboardItem>) => void;
  onClose: () => void;
}

export function DashboardItemAppearance({
  item, supportsStyleOverride, onChange, onClose,
}: Props) {
  const fontScale = item.fontScale ?? 1;
  const titleScale = item.titleScale ?? 1;
  const chartScale = item.chartScale ?? 1;
  const hasAnyOverride =
    fontScale !== 1 ||
    titleScale !== 1 ||
    chartScale !== 1 ||
    !!item.overrideColor ||
    !!item.overrideChartType;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-full bg-white shadow-2xl border-l border-slate-200 flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
        <h2 className="text-[14px] font-semibold text-slate-900 inline-flex items-center gap-2">
          <Sliders className="h-4 w-4 text-blue-600" /> Apparence du widget
        </h2>
        <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100" aria-label="Fermer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Ces réglages s&apos;appliquent uniquement à ce widget dans ce dashboard.
          La définition du widget reste inchangée ailleurs.
        </p>

        {/* ---- Taille globale ---- */}
        <ScaleSection
          label="Taille globale"
          hint="Agrandit tout le widget (titre + graphique) d'un coup."
          value={fontScale}
          onChange={(v) => onChange({ fontScale: v === 1 ? undefined : v })}
        />

        {/* ---- Taille du titre ---- */}
        {supportsStyleOverride && (
          <ScaleSection
            label="Taille du titre"
            hint="Ajuste uniquement le nom du widget au-dessus du graphique."
            value={titleScale}
            onChange={(v) => onChange({ titleScale: v === 1 ? undefined : v })}
          />
        )}

        {/* ---- Taille du graphique ---- */}
        {supportsStyleOverride && (
          <ScaleSection
            label="Taille du graphique"
            hint="Ajuste le graphique et ses libellés (axes, légende, valeurs) sans toucher au titre."
            value={chartScale}
            onChange={(v) => onChange({ chartScale: v === 1 ? undefined : v })}
          />
        )}

        {/* ---- Couleur & type (widgets personnalisés uniquement) ---- */}
        {supportsStyleOverride ? (
          <>
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Couleur
              </h3>
              <div className="grid grid-cols-7 gap-1.5">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onChange({ overrideColor: color })}
                    className={cn(
                      "h-8 rounded-md ring-2 transition-all",
                      item.overrideColor === color ? "ring-slate-900 scale-105" : "ring-transparent hover:ring-slate-300",
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={item.overrideColor ?? "#2563eb"}
                  onChange={(e) => onChange({ overrideColor: e.target.value })}
                  className="h-7 w-10 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={item.overrideColor ?? ""}
                  placeholder="par défaut"
                  onChange={(e) => onChange({ overrideColor: e.target.value || undefined })}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-[12px] font-mono focus:border-blue-500 focus:outline-none"
                />
                {item.overrideColor && (
                  <button
                    onClick={() => onChange({ overrideColor: undefined })}
                    className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                    title="Utiliser la couleur par défaut du widget"
                  >
                    Reset
                  </button>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Type de graphique
              </h3>
              <select
                value={item.overrideChartType ?? ""}
                onChange={(e) => onChange({ overrideChartType: e.target.value || undefined })}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-[12.5px] focus:border-blue-500 focus:outline-none"
              >
                <option value="">Par défaut (widget)</option>
                {CHART_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </section>
          </>
        ) : (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[11.5px] text-slate-600">
            La couleur et le type de graphique ne peuvent être modifiés que pour les widgets personnalisés.
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-3 shrink-0 flex items-center justify-between gap-2">
        <button
          onClick={() => onChange({
            fontScale: undefined,
            titleScale: undefined,
            chartScale: undefined,
            overrideColor: undefined,
            overrideChartType: undefined,
          })}
          disabled={!hasAnyOverride}
          className="text-[12px] text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Retirer tous les ajustements"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Tout réinitialiser
        </button>
        <button
          onClick={onClose}
          className="text-[13px] rounded bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
