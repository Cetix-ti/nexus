"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortState } from "@/lib/hooks/use-sortable";

interface Props {
  label: string;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  className?: string;
}

export function SortableHeader({ label, sortKey, sort, onToggle, className }: Props) {
  const isActive = sort.key === sortKey;

  return (
    <th
      className={cn(
        "px-4 py-3 font-medium text-slate-500 cursor-pointer select-none hover:text-slate-700 transition-colors",
        className,
      )}
      onClick={() => onToggle(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          sort.direction === "asc" ? (
            <ArrowUp className="h-3 w-3 text-blue-500" />
          ) : (
            <ArrowDown className="h-3 w-3 text-blue-500" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </span>
    </th>
  );
}
