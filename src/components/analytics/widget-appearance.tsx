"use client";

// Section "Apparence" de l'éditeur de widgets — contrôles visuels
// (couleurs, forme, axes, format des valeurs, légende, grille).

import { Palette, Type, Grid3x3, Eye, EyeOff, AlignCenter } from "lucide-react";
import {
  type VisualStyle, type ColorMode, type CornerStyle, type ValueFormat,
  type ThousandSep, type LegendPosition, type AxisRotation,
} from "@/lib/analytics/widget-style";

interface Props {
  style: VisualStyle;
  onChange: (patch: Partial<VisualStyle>) => void;
  /** Labels des résultats — pour l'éditeur de couleurs personnalisées. */
  labels?: string[];
}

export function WidgetAppearance({ style, onChange, labels = [] }: Props) {
  return (
    <div className="space-y-4">
      <ColorsSection style={style} onChange={onChange} labels={labels} />
      <ShapeSection style={style} onChange={onChange} />
      <ValueFormatSection style={style} onChange={onChange} />
      <AxesSection style={style} onChange={onChange} />
      <LegendGridSection style={style} onChange={onChange} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Couleurs
// ----------------------------------------------------------------------------
const PRESET_COLORS = [
  "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#be185d", "#4f46e5", "#0d9488", "#ea580c",
  "#84cc16", "#db2777", "#0f172a", "#64748b",
];

const PRESET_PALETTES: Array<{ name: string; colors: string[] }> = [
  { name: "Nexus par défaut", colors: ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#4f46e5"] },
  { name: "Pastel", colors: ["#93c5fd", "#6ee7b7", "#fcd34d", "#fca5a5", "#c4b5fd", "#67e8f9", "#f9a8d4", "#a5b4fc"] },
  { name: "Neutre sobre", colors: ["#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0"] },
  { name: "Business (froid)", colors: ["#1e3a8a", "#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"] },
  { name: "Marketing (chaud)", colors: ["#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74"] },
];

function ColorsSection({ style, onChange, labels }: { style: VisualStyle; onChange: (p: Partial<VisualStyle>) => void; labels: string[] }) {
  return (
    <Section title="Couleurs" icon={<Palette className="h-4 w-4" />}>
      <div className="flex items-center gap-1 flex-wrap">
        {(["single", "palette", "custom"] as ColorMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ colorMode: m })}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11.5px] font-medium border transition-colors",
              style.colorMode === m
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
            )}
          >
            {m === "single" ? "Couleur unique" : m === "palette" ? "Palette" : "Personnalisée"}
          </button>
        ))}
      </div>

      {style.colorMode === "single" && (
        <div className="space-y-1.5 mt-2">
          <label className="block text-[11px] text-slate-600">Couleur</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ primaryColor: c })}
                className={cn(
                  "h-6 w-6 rounded-full ring-2 ring-offset-1 transition-all",
                  style.primaryColor === c ? "ring-slate-900" : "ring-transparent hover:ring-slate-300"
                )}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              value={style.primaryColor}
              onChange={(e) => onChange({ primaryColor: e.target.value })}
              className="h-6 w-10 rounded border border-slate-300 cursor-pointer"
            />
          </div>
        </div>
      )}

      {style.colorMode === "palette" && (
        <div className="space-y-2 mt-2">
          <label className="block text-[11px] text-slate-600">Palette prédéfinie</label>
          <div className="space-y-1">
            {PRESET_PALETTES.map((p) => {
              const active = JSON.stringify(style.palette) === JSON.stringify(p.colors);
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => onChange({ palette: p.colors })}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-1.5 text-left text-[11.5px] flex items-center gap-2 transition-colors",
                    active ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <div className="flex gap-0.5 flex-wrap">
                    {p.colors.slice(0, 8).map((c, i) => (
                      <span key={i} className="inline-block h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-slate-700">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {style.colorMode === "custom" && (
        <div className="space-y-2 mt-2">
          <p className="text-[11px] text-slate-600">
            Associe une couleur à chaque étiquette affichée dans le graphique.
          </p>
          {labels.length === 0 ? (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              L&apos;aperçu doit être généré avant de pouvoir personnaliser les couleurs par étiquette.
            </p>
          ) : (
            <div className="space-y-1">
              {labels.slice(0, 20).map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={style.customColors?.[label] ?? style.primaryColor}
                    onChange={(e) => {
                      const next = { ...(style.customColors ?? {}) };
                      next[label] = e.target.value;
                      onChange({ customColors: next });
                    }}
                    className="h-6 w-10 rounded border border-slate-300 cursor-pointer shrink-0"
                  />
                  <span className="text-[11.5px] text-slate-700 truncate flex-1">{label}</span>
                </div>
              ))}
              {labels.length > 20 && (
                <p className="text-[10.5px] text-slate-500">… et {labels.length - 20} autres (tronqués)</p>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------------------
// Forme / design
// ----------------------------------------------------------------------------
function ShapeSection({ style, onChange }: { style: VisualStyle; onChange: (p: Partial<VisualStyle>) => void }) {
  return (
    <Section title="Forme" icon={<Grid3x3 className="h-4 w-4" />}>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Coins des barres</label>
        <div className="grid grid-cols-4 gap-1">
          {(["sharp", "rounded", "very_rounded", "pill"] as CornerStyle[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ corners: c })}
              className={cn(
                "rounded-md px-2 py-1.5 text-[11px] border transition-colors",
                style.corners === c
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
              )}
            >
              {c === "sharp" ? "Droit" : c === "rounded" ? "Arrondi" : c === "very_rounded" ? "Très arrondi" : "Pastille"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Espace barres ({style.barGapPercent}%)</label>
          <input
            type="range" min={0} max={40} step={1}
            value={style.barGapPercent}
            onChange={(e) => onChange({ barGapPercent: Number(e.target.value) })}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Épaisseur des traits ({style.strokeWidth}px)</label>
          <input
            type="range" min={1} max={6} step={1}
            value={style.strokeWidth}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      </div>
    </Section>
  );
}

// ----------------------------------------------------------------------------
// Format valeurs
// ----------------------------------------------------------------------------
function ValueFormatSection({ style, onChange }: { style: VisualStyle; onChange: (p: Partial<VisualStyle>) => void }) {
  return (
    <Section title="Format des valeurs" icon={<Type className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Type</label>
          <select
            value={style.valueFormat}
            onChange={(e) => onChange({ valueFormat: e.target.value as ValueFormat })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            <option value="number">Nombre</option>
            <option value="currency">Monétaire ($)</option>
            <option value="percent">Pourcentage</option>
            <option value="duration_hours">Heures (Xh MM)</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Décimales</label>
          <select
            value={style.valueDecimals}
            onChange={(e) => onChange({ valueDecimals: Number(e.target.value) })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        {style.valueFormat === "currency" && (
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Devise</label>
            <select
              value={style.currency}
              onChange={(e) => onChange({ currency: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
            >
              <option value="CAD">CAD — Dollar canadien</option>
              <option value="USD">USD — Dollar US</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — Livre</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Séparateur milliers</label>
          <select
            value={style.thousandSeparator}
            onChange={(e) => onChange({ thousandSeparator: e.target.value as ThousandSep })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            <option value="space">Espace (1 234)</option>
            <option value="comma">Virgule (1,234)</option>
            <option value="none">Aucun (1234)</option>
          </select>
        </div>
        {style.valueFormat === "number" && (
          <>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Préfixe</label>
              <input
                type="text" maxLength={10}
                placeholder="ex: $"
                value={style.valuePrefix ?? ""}
                onChange={(e) => onChange({ valuePrefix: e.target.value || undefined })}
                className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Suffixe</label>
              <input
                type="text" maxLength={10}
                placeholder="ex: heures"
                value={style.valueSuffix ?? ""}
                onChange={(e) => onChange({ valueSuffix: e.target.value || undefined })}
                className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
              />
            </div>
          </>
        )}
      </div>
      <label className="flex items-center justify-between gap-3 mt-2 rounded border border-slate-200 px-2.5 py-1.5">
        <span className="text-[11.5px] text-slate-700">Afficher les valeurs sur les données</span>
        <Toggle checked={style.showDataLabels} onChange={(v) => onChange({ showDataLabels: v })} />
      </label>
      {style.showDataLabels && (
        <div className="mt-2 rounded border border-slate-200 px-2.5 py-2">
          <div className="flex items-center justify-between gap-3 mb-1">
            <label htmlFor="data-label-fontsize" className="text-[11.5px] text-slate-700">
              Taille du texte (valeurs)
            </label>
            <span className="text-[11px] tabular-nums text-slate-500">
              {style.dataLabelFontSize ?? 10}px
            </span>
          </div>
          <input
            id="data-label-fontsize"
            type="range"
            min={8}
            max={24}
            step={1}
            value={style.dataLabelFontSize ?? 10}
            onChange={(e) => onChange({ dataLabelFontSize: Number(e.target.value) })}
            className="w-full accent-blue-600"
          />
        </div>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------------------
// Axes
// ----------------------------------------------------------------------------
function AxesSection({ style, onChange }: { style: VisualStyle; onChange: (p: Partial<VisualStyle>) => void }) {
  return (
    <Section title="Axes" icon={<AlignCenter className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-1.5">
          <span className="text-[11.5px] text-slate-700">Axe X</span>
          <Toggle checked={style.showXAxis} onChange={(v) => onChange({ showXAxis: v })} />
        </label>
        <label className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-1.5">
          <span className="text-[11.5px] text-slate-700">Axe Y</span>
          <Toggle checked={style.showYAxis} onChange={(v) => onChange({ showYAxis: v })} />
        </label>
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Titre X</label>
          <input
            type="text" maxLength={40}
            placeholder="(vide)"
            value={style.xAxisTitle ?? ""}
            onChange={(e) => onChange({ xAxisTitle: e.target.value || undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Titre Y</label>
          <input
            type="text" maxLength={40}
            placeholder="(vide)"
            value={style.yAxisTitle ?? ""}
            onChange={(e) => onChange({ yAxisTitle: e.target.value || undefined })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
          />
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-slate-600 mb-1">Rotation étiquettes X</label>
        <div className="grid grid-cols-3 gap-1">
          {([0, -45, -90] as AxisRotation[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ xAxisRotation: r })}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] border transition-colors",
                style.xAxisRotation === r
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
              )}
            >
              {r}°
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ----------------------------------------------------------------------------
// Légende / Grille
// ----------------------------------------------------------------------------
function LegendGridSection({ style, onChange }: { style: VisualStyle; onChange: (p: Partial<VisualStyle>) => void }) {
  return (
    <Section title="Légende & grille" icon={style.showLegend ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}>
      <label className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-1.5">
        <span className="text-[11.5px] text-slate-700">Afficher la légende</span>
        <Toggle checked={style.showLegend} onChange={(v) => onChange({ showLegend: v })} />
      </label>
      {style.showLegend && (
        <div>
          <label className="block text-[11px] text-slate-600 mb-1">Position de la légende</label>
          <div className="grid grid-cols-4 gap-1">
            {(["top", "right", "bottom", "left"] as LegendPosition[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ legendPosition: p })}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] border transition-colors",
                  style.legendPosition === p
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
                )}
              >
                {p === "top" ? "Haut" : p === "right" ? "Droite" : p === "bottom" ? "Bas" : "Gauche"}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-1.5">
        <span className="text-[11.5px] text-slate-700">Afficher la grille</span>
        <Toggle checked={style.showGrid} onChange={(v) => onChange({ showGrid: v })} />
      </label>
      {style.showGrid && (
        <label className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-1.5">
          <span className="text-[11.5px] text-slate-700">Grille pointillée</span>
          <Toggle checked={style.gridDashed} onChange={(v) => onChange({ gridDashed: v })} />
        </label>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------------------
// Primitives
// ----------------------------------------------------------------------------
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
        <span className="text-slate-500">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-blue-600" : "bg-slate-300"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
