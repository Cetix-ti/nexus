"use client";

import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

export function useSortable<T>(
  items: T[],
  defaultKey: string,
  defaultDirection: SortDirection = "asc",
) {
  const [sort, setSort] = useState<SortState>({
    key: defaultKey,
    direction: defaultDirection,
  });

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const aVal = (a as any)[sort.key];
      const bVal = (b as any)[sort.key];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp: number;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal, "fr", { sensitivity: "base" });
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else if (typeof aVal === "boolean") {
        cmp = aVal === bVal ? 0 : aVal ? -1 : 1;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), "fr");
      }

      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [items, sort]);

  return { sorted, sort, toggleSort };
}
