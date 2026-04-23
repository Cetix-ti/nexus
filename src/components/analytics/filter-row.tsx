"use client";

// FilterRow — ligne de filtre réactive au type du champ.
//
// - Date      : preset (Aujourd'hui, Ce mois-ci, Trimestre dernier, …) + custom range
// - Number    : input numérique (ou deux pour between)
// - Boolean   : toggle Vrai/Faux
// - Enum      : liste déroulante avec valeurs connues (si fournies)
// - String    : input texte libre
// - Relation  : input ID (texte pour l'instant, à enrichir avec typeahead)
//
// Stockage uniforme : `{ field, operator, value: string }`. Pour les dates,
// on sérialise la plage en "YYYY-MM-DD,YYYY-MM-DD" avec operator "between".
// Pour `in`, on sépare par virgules.

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  operatorsForType,
  DATE_PRESETS,
  rangeForPreset,
  detectPreset,
} from "@/lib/analytics/filter-helpers";

export interface FieldMeta {
  name: string;
  label: string;
  type: string;
  /** Valeurs possibles pour les enums. Si absent, fallback input texte. */
  values?: readonly string[];
}

export interface FilterValue {
  field: string;
  operator: string;
  value: string;
}

interface Props {
  filter: FilterValue;
  fields: FieldMeta[];
  onChange: (patch: Partial<FilterValue>) => void;
  onRemove: () => void;
}

export function FilterRow({ filter, fields, onChange, onRemove }: Props) {
  const fieldMeta = fields.find((f) => f.name === filter.field);
  const type = fieldMeta?.type;
  const operators = useMemo(() => operatorsForType(type), [type]);

  // Si le type ne supporte plus l'opérateur courant, repli sur le premier valide.
  useEffect(() => {
    if (!operators.some((o) => o.id === filter.operator)) {
      onChange({ operator: operators[0]?.id ?? "eq", value: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      <Select value={filter.field} onValueChange={(v) => {
        const newField = fields.find((f) => f.name === v);
        const newOps = operatorsForType(newField?.type);
        onChange({ field: v, operator: newOps[0]?.id ?? "eq", value: "" });
      }}>
        <SelectTrigger className="w-40 text-[11px]"><SelectValue placeholder="Champ" /></SelectTrigger>
        <SelectContent>
          {fields.map((fd) => <SelectItem key={fd.name} value={fd.name}>{fd.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filter.operator} onValueChange={(v) => onChange({ operator: v, value: "" })}>
        <SelectTrigger className="w-36 text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {operators.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex-1 min-w-[160px]">
        <ValueInput filter={filter} fieldMeta={fieldMeta} onChange={onChange} />
      </div>

      <button
        onClick={onRemove}
        className="text-slate-400 hover:text-red-500 p-1 shrink-0"
        aria-label="Retirer le filtre"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ValueInput({
  filter, fieldMeta, onChange,
}: {
  filter: FilterValue;
  fieldMeta: FieldMeta | undefined;
  onChange: (patch: Partial<FilterValue>) => void;
}) {
  if (filter.operator === "isnull") {
    return (
      <Select
        value={filter.value === "false" ? "false" : "true"}
        onValueChange={(v) => onChange({ value: v })}
      >
        <SelectTrigger className="text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Est vide</SelectItem>
          <SelectItem value="false">N&apos;est pas vide</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // -------- DATE --------
  if (fieldMeta?.type === "date") {
    return <DateValueInput filter={filter} onChange={onChange} />;
  }

  // -------- BOOLEAN --------
  if (fieldMeta?.type === "boolean") {
    return (
      <Select value={filter.value || "true"} onValueChange={(v) => onChange({ value: v })}>
        <SelectTrigger className="text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Vrai</SelectItem>
          <SelectItem value="false">Faux</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // -------- NUMBER (incl. between) --------
  if (fieldMeta?.type === "number") {
    if (filter.operator === "between") {
      const [lo, hi] = (filter.value || ",").split(",");
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
            placeholder="Min"
            value={lo ?? ""}
            onChange={(e) => onChange({ value: `${e.target.value},${hi ?? ""}` })}
          />
          <span className="text-[11px] text-slate-400">–</span>
          <input
            type="number"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
            placeholder="Max"
            value={hi ?? ""}
            onChange={(e) => onChange({ value: `${lo ?? ""},${e.target.value}` })}
          />
        </div>
      );
    }
    return (
      <input
        type="number"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
        placeholder="Valeur"
        value={filter.value}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    );
  }

  // -------- ENUM (avec valeurs connues) --------
  if (fieldMeta?.type === "enum" && fieldMeta.values && fieldMeta.values.length > 0) {
    if (filter.operator === "in") {
      return (
        <EnumMultiSelect
          values={fieldMeta.values}
          selected={(filter.value || "").split(",").filter(Boolean)}
          onChange={(next) => onChange({ value: next.join(",") })}
        />
      );
    }
    return (
      <Select value={filter.value} onValueChange={(v) => onChange({ value: v })}>
        <SelectTrigger className="text-[11px]"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {fieldMeta.values.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  // -------- Fallback (string, enum sans values, relation) --------
  return (
    <input
      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
      placeholder={filter.operator === "in" ? "v1, v2, v3" : "Valeur"}
      value={filter.value}
      onChange={(e) => onChange({ value: e.target.value })}
    />
  );
}

// ----------------------------------------------------------------------------
// Date — preset + custom range
// ----------------------------------------------------------------------------
function DateValueInput({ filter, onChange }: { filter: FilterValue; onChange: (p: Partial<FilterValue>) => void }) {
  // Pour "between" : selector de preset + 2 inputs date (custom).
  if (filter.operator === "between") {
    const currentPreset = filter.value ? detectPreset(filter.value) ?? "custom" : "";
    const [from, to] = (filter.value || ",").split(",");
    const [selectedPreset, setSelectedPreset] = useState(currentPreset);

    // Synchronise si value changée ailleurs.
    useEffect(() => {
      setSelectedPreset(filter.value ? detectPreset(filter.value) ?? "custom" : "");
    }, [filter.value]);

    function pickPreset(preset: string) {
      setSelectedPreset(preset);
      if (preset === "custom") {
        // Laisse les dates actuelles OU init sur aujourd'hui.
        if (!filter.value) {
          const today = new Date().toISOString().slice(0, 10);
          onChange({ value: `${today},${today}` });
        }
        return;
      }
      const r = rangeForPreset(preset);
      if (r) onChange({ value: `${r.from},${r.to}` });
    }

    return (
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full">
        <Select value={selectedPreset} onValueChange={pickPreset}>
          <SelectTrigger className="text-[11px] sm:w-44"><SelectValue placeholder="Choisir une période" /></SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedPreset === "custom" && (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
              value={from ?? ""}
              onChange={(e) => onChange({ value: `${e.target.value},${to ?? ""}` })}
            />
            <span className="text-[11px] text-slate-400">→</span>
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
              value={to ?? ""}
              onChange={(e) => onChange({ value: `${from ?? ""},${e.target.value}` })}
            />
          </div>
        )}
      </div>
    );
  }

  // Opérateurs date simples (eq, gte, lte) → date picker unique.
  return (
    <input
      type="date"
      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] focus:border-blue-500 focus:outline-none"
      value={filter.value}
      onChange={(e) => onChange({ value: e.target.value })}
    />
  );
}

// ----------------------------------------------------------------------------
// Enum multi-select — chips toggleables
// ----------------------------------------------------------------------------
function EnumMultiSelect({
  values, selected, onChange,
}: { values: readonly string[]; selected: string[]; onChange: (next: string[]) => void }) {
  function toggle(v: string) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5">
      {values.map((v) => {
        const active = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            className={`text-[10.5px] rounded px-1.5 py-0.5 border ${
              active
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
            }`}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}
