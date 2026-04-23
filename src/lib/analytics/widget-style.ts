// ============================================================================
// Widget VisualStyle — configuration d'apparence d'un widget analytique.
// Appliqué à chaque graphique via des helpers format/couleurs/légende.
//
// Schéma stable (sérialisé en localStorage/DB), extensible sans migration :
// tous les champs sont optionnels avec fallback dans DEFAULT_STYLE.
// ============================================================================

export type ColorMode = "single" | "palette" | "custom";
export type CornerStyle = "sharp" | "rounded" | "very_rounded" | "pill";
export type ValueFormat = "number" | "currency" | "percent" | "duration_hours";
export type ThousandSep = "comma" | "space" | "none";
export type LegendPosition = "top" | "right" | "bottom" | "left";
export type AxisRotation = 0 | -45 | -90;

export interface VisualStyle {
  // --- Couleurs ---
  colorMode: ColorMode;
  primaryColor: string;           // couleur de base (single) / seed palette
  palette: string[];              // couleurs quand colorMode=palette
  customColors?: Record<string, string>; // label → couleur (colorMode=custom)

  // --- Forme ---
  corners: CornerStyle;           // rayon des coins sur barres/treemap
  barGapPercent: number;          // 0-40 (recharts: barCategoryGap)
  strokeWidth: number;            // trait des lignes/contours

  // --- Axes ---
  showXAxis: boolean;
  showYAxis: boolean;
  xAxisTitle?: string;
  yAxisTitle?: string;
  xAxisRotation: AxisRotation;

  // --- Format valeurs / étiquettes ---
  valueFormat: ValueFormat;
  valueDecimals: number;          // 0-3
  valuePrefix?: string;
  valueSuffix?: string;
  currency: string;               // "CAD" par défaut
  thousandSeparator: ThousandSep;
  showDataLabels: boolean;        // valeurs directement sur les barres/points

  // --- Légende ---
  showLegend: boolean;
  legendPosition: LegendPosition;

  // --- Grille ---
  showGrid: boolean;
  gridDashed: boolean;
}

const DEFAULT_PALETTE = [
  "#2563eb", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#be185d", "#4f46e5",
  "#0d9488", "#ea580c", "#84cc16", "#db2777",
];

export const DEFAULT_STYLE: VisualStyle = {
  colorMode: "single",
  primaryColor: "#2563eb",
  palette: DEFAULT_PALETTE,
  corners: "rounded",
  barGapPercent: 10,
  strokeWidth: 2,
  showXAxis: true,
  showYAxis: true,
  xAxisRotation: 0,
  valueFormat: "number",
  valueDecimals: 0,
  currency: "CAD",
  thousandSeparator: "space",
  showDataLabels: false,
  showLegend: false,
  legendPosition: "bottom",
  showGrid: true,
  gridDashed: true,
};

// ----------------------------------------------------------------------------
// Merge défauts + style stocké (tolère les anciens widgets sans style).
// ----------------------------------------------------------------------------
export function mergeStyle(partial: Partial<VisualStyle> | undefined | null, primaryFallback?: string): VisualStyle {
  return {
    ...DEFAULT_STYLE,
    ...(primaryFallback ? { primaryColor: primaryFallback } : {}),
    ...(partial ?? {}),
  };
}

// ----------------------------------------------------------------------------
// Couleurs
// ----------------------------------------------------------------------------
export function colorForIndex(style: VisualStyle, index: number, label?: string): string {
  if (style.colorMode === "custom" && label && style.customColors?.[label]) {
    return style.customColors[label];
  }
  if (style.colorMode === "palette") {
    return style.palette[index % style.palette.length];
  }
  return style.primaryColor;
}

export function colorsForResults(
  style: VisualStyle,
  results: Array<{ label: string }>,
): string[] {
  return results.map((r, i) => colorForIndex(style, i, r.label));
}

// ----------------------------------------------------------------------------
// Formats des valeurs
// ----------------------------------------------------------------------------
function applyThousandSep(n: number, sep: ThousandSep, decimals: number): string {
  const fixed = n.toFixed(Math.max(0, Math.min(3, decimals)));
  const [intPart, decPart] = fixed.split(".");
  if (sep === "none") return decPart ? `${intPart}.${decPart}` : intPart;
  const sepChar = sep === "space" ? " " : ",";
  const intGrouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sepChar);
  return decPart ? `${intGrouped}${sep === "space" ? "," : "."}${decPart}` : intGrouped;
}

export function formatValue(value: number | null | undefined, style: VisualStyle): string {
  if (value == null || Number.isNaN(value)) return "—";
  const decimals = style.valueDecimals;

  if (style.valueFormat === "percent") {
    return `${applyThousandSep(value, style.thousandSeparator, decimals)} %`;
  }
  if (style.valueFormat === "currency") {
    try {
      return new Intl.NumberFormat("fr-CA", {
        style: "currency",
        currency: style.currency || "CAD",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    } catch {
      return `${applyThousandSep(value, style.thousandSeparator, decimals)} ${style.currency}`;
    }
  }
  if (style.valueFormat === "duration_hours") {
    const hours = Math.floor(Math.abs(value));
    const minutes = Math.round((Math.abs(value) - hours) * 60);
    const sign = value < 0 ? "-" : "";
    return `${sign}${hours}h ${String(minutes).padStart(2, "0")}`;
  }
  // number
  const base = applyThousandSep(value, style.thousandSeparator, decimals);
  return `${style.valuePrefix ?? ""}${base}${style.valueSuffix ?? ""}`;
}

// ----------------------------------------------------------------------------
// Recharts integration helpers
// ----------------------------------------------------------------------------
export function cornerRadiusForBar(style: VisualStyle): [number, number, number, number] {
  switch (style.corners) {
    case "sharp": return [0, 0, 0, 0];
    case "very_rounded": return [10, 10, 0, 0];
    case "pill": return [999, 999, 0, 0];
    case "rounded":
    default: return [4, 4, 0, 0];
  }
}

export function cornerRadiusForHorizontalBar(style: VisualStyle): [number, number, number, number] {
  switch (style.corners) {
    case "sharp": return [0, 0, 0, 0];
    case "very_rounded": return [0, 10, 10, 0];
    case "pill": return [0, 999, 999, 0];
    case "rounded":
    default: return [0, 4, 4, 0];
  }
}

export function cornerRadiusForTreemap(style: VisualStyle): number {
  switch (style.corners) {
    case "sharp": return 0;
    case "very_rounded": return 8;
    case "pill": return 16;
    case "rounded":
    default: return 4;
  }
}

export interface LegendLayoutProps {
  verticalAlign?: "top" | "middle" | "bottom";
  align?: "left" | "center" | "right";
  layout?: "horizontal" | "vertical";
}

export function legendLayoutForPosition(pos: LegendPosition): LegendLayoutProps {
  switch (pos) {
    case "top": return { verticalAlign: "top", align: "center", layout: "horizontal" };
    case "right": return { verticalAlign: "middle", align: "right", layout: "vertical" };
    case "left": return { verticalAlign: "middle", align: "left", layout: "vertical" };
    case "bottom":
    default: return { verticalAlign: "bottom", align: "center", layout: "horizontal" };
  }
}

export function gridStrokeDasharray(style: VisualStyle): string | undefined {
  if (!style.showGrid) return undefined;
  return style.gridDashed ? "3 3" : "0";
}
