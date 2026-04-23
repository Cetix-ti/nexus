// Helpers pour le builder de filtres de widgets analytics.
//
// Sert deux objectifs :
//   1. Adapter les opérateurs autorisés au TYPE du champ (date/number/enum/…)
//   2. Convertir un preset de date ("ce mois-ci", "trimestre dernier") en
//      plage ISO concrète à envoyer au backend via l'opérateur `between`.

export type FieldType = "string" | "number" | "boolean" | "date" | "enum" | "relation";

export interface FilterOperatorOption {
  id: string;
  label: string;
}

const OP_ALL: FilterOperatorOption[] = [
  { id: "eq", label: "= Égal" },
  { id: "neq", label: "≠ Différent" },
  { id: "gt", label: "> Plus grand" },
  { id: "lt", label: "< Plus petit" },
  { id: "gte", label: "≥ Plus grand ou égal" },
  { id: "lte", label: "≤ Plus petit ou égal" },
  { id: "in", label: "∈ Dans la liste" },
  { id: "contains", label: "Contient" },
  { id: "isnull", label: "Est vide" },
  { id: "between", label: "Entre" },
];

export function operatorsForType(type: FieldType | string | undefined): FilterOperatorOption[] {
  switch (type) {
    case "date":
      return [
        { id: "between", label: "Entre (période)" },
        { id: "gte", label: "≥ Depuis" },
        { id: "lte", label: "≤ Jusqu'à" },
        { id: "eq", label: "= Date précise" },
        { id: "isnull", label: "Est vide" },
      ];
    case "number":
      return OP_ALL.filter((o) => ["eq", "neq", "gt", "lt", "gte", "lte", "between", "isnull"].includes(o.id));
    case "boolean":
      return [
        { id: "eq", label: "= Est" },
        { id: "isnull", label: "Est vide" },
      ];
    case "enum":
      return [
        { id: "eq", label: "= Égal" },
        { id: "neq", label: "≠ Différent" },
        { id: "in", label: "∈ Parmi" },
        { id: "isnull", label: "Est vide" },
      ];
    case "relation":
      return [
        { id: "eq", label: "= Est" },
        { id: "neq", label: "≠ N'est pas" },
        { id: "in", label: "∈ Parmi" },
        { id: "isnull", label: "Est vide" },
      ];
    case "string":
      return [
        { id: "contains", label: "Contient" },
        { id: "eq", label: "= Égal" },
        { id: "neq", label: "≠ Différent" },
        { id: "isnull", label: "Est vide" },
      ];
    default:
      return OP_ALL;
  }
}

// ----------------------------------------------------------------------------
// Presets de dates
// ----------------------------------------------------------------------------
export interface DatePreset {
  id: string;
  label: string;
}

export const DATE_PRESETS: DatePreset[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "yesterday", label: "Hier" },
  { id: "last_7_days", label: "7 derniers jours" },
  { id: "last_30_days", label: "30 derniers jours" },
  { id: "last_90_days", label: "90 derniers jours" },
  { id: "this_week", label: "Cette semaine" },
  { id: "last_week", label: "Semaine dernière" },
  { id: "this_month", label: "Ce mois-ci" },
  { id: "last_month", label: "Mois dernier" },
  { id: "this_quarter", label: "Ce trimestre" },
  { id: "last_quarter", label: "Trimestre dernier" },
  { id: "this_year", label: "Cette année" },
  { id: "last_year", label: "Année dernière" },
  { id: "custom", label: "Personnalisé…" },
];

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d: Date): Date {
  // Semaine ISO : lundi = 1er jour.
  const x = startOfDay(d);
  const diff = (x.getDay() + 6) % 7; // 0=lundi, 6=dimanche
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return endOfDay(new Date(d.getFullYear(), q * 3 + 3, 0));
}
function startOfYear(d: Date): Date { return new Date(d.getFullYear(), 0, 1); }
function endOfYear(d: Date): Date { return endOfDay(new Date(d.getFullYear(), 11, 31)); }

/**
 * Convertit un preset en plage concrète. `now` injectable pour les tests.
 * Retourne null pour "custom" — le caller doit proposer un input manuel.
 */
export function rangeForPreset(presetId: string, now: Date = new Date()): DateRange | null {
  const today = startOfDay(now);
  switch (presetId) {
    case "today": return { from: ymd(today), to: ymd(today) };
    case "yesterday": {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: ymd(y), to: ymd(y) };
    }
    case "last_7_days": {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { from: ymd(s), to: ymd(today) };
    }
    case "last_30_days": {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { from: ymd(s), to: ymd(today) };
    }
    case "last_90_days": {
      const s = new Date(today); s.setDate(s.getDate() - 89);
      return { from: ymd(s), to: ymd(today) };
    }
    case "this_week": {
      const s = startOfWeek(today);
      const e = new Date(s); e.setDate(e.getDate() + 6);
      return { from: ymd(s), to: ymd(e) };
    }
    case "last_week": {
      const s = startOfWeek(today); s.setDate(s.getDate() - 7);
      const e = new Date(s); e.setDate(e.getDate() + 6);
      return { from: ymd(s), to: ymd(e) };
    }
    case "this_month": return { from: ymd(startOfMonth(today)), to: ymd(endOfMonth(today)) };
    case "last_month": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = endOfMonth(s);
      return { from: ymd(s), to: ymd(e) };
    }
    case "this_quarter": return { from: ymd(startOfQuarter(today)), to: ymd(endOfQuarter(today)) };
    case "last_quarter": {
      const s = startOfQuarter(today);
      s.setMonth(s.getMonth() - 3);
      const e = endOfQuarter(s);
      return { from: ymd(s), to: ymd(e) };
    }
    case "this_year": return { from: ymd(startOfYear(today)), to: ymd(endOfYear(today)) };
    case "last_year": {
      const s = new Date(today.getFullYear() - 1, 0, 1);
      const e = new Date(today.getFullYear() - 1, 11, 31);
      return { from: ymd(s), to: ymd(e) };
    }
    case "custom":
    default:
      return null;
  }
}

/**
 * Détecte si une valeur de filtre `between` stockée sous forme de string
 * "from,to" correspond à un preset connu. Permet de re-sélectionner le
 * preset dans l'UI à la réouverture du widget.
 */
export function detectPreset(value: string, now: Date = new Date()): string | null {
  const [from, to] = value.split(",");
  if (!from || !to) return null;
  for (const p of DATE_PRESETS) {
    if (p.id === "custom") continue;
    const r = rangeForPreset(p.id, now);
    if (r && r.from === from && r.to === to) return p.id;
  }
  return "custom";
}
