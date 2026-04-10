"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: { label: string; value: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  width?: number;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Sélectionner...",
  className,
  width = 200,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  return (
    <div className={cn("relative", className)} ref={ref} style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] shadow-sm transition-colors",
          "hover:border-slate-300",
          "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        )}
      >
        <div className="flex-1 min-w-0 text-left">
          {selected.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : selected.length === 1 ? (
            <span className="text-slate-900 truncate">{selectedLabels[0]}</span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-900 font-medium truncate">
                {selectedLabels[0]}
              </span>
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-semibold text-blue-700 tabular-nums">
                +{selected.length - 1}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Tout effacer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-slate-400 transition-transform",
              open && "rotate-180"
            )}
            strokeWidth={2.25}
          />
        </div>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-[280px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-[0_10px_30px_-10px_rgba(15,23,42,0.2)] py-1"
          style={{ width: Math.max(width, 240) }}
        >
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <div
                  className={cn(
                    "h-4 w-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors",
                    isSelected
                      ? "bg-blue-600 border-blue-600"
                      : "border-slate-300 bg-white"
                  )}
                >
                  {isSelected && (
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                  )}
                </div>
                <span className="flex-1">{opt.label}</span>
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-3 py-4 text-[12px] text-slate-400 text-center">
              Aucune option disponible
            </p>
          )}
        </div>
      )}
    </div>
  );
}
