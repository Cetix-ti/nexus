"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKbStore, type KbCategory } from "@/stores/kb-store";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

interface NodeProps {
  cat: KbCategory;
  depth: number;
  childrenMap: Map<string | null, KbCategory[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
}

function TreeNode({
  cat,
  depth,
  childrenMap,
  selectedId,
  onSelect,
  expanded,
  toggle,
}: NodeProps) {
  const children = childrenMap.get(cat.id) || [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(cat.id);
  const isSelected = selectedId === cat.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(cat.id)}
        className={cn(
          "w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] text-left hover:bg-slate-100/80 transition-colors",
          isSelected && "bg-blue-50 text-blue-700 hover:bg-blue-50"
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              toggle(cat.id);
            }}
            className="h-4 w-4 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            {isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}
        {hasChildren && isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: cat.color }} />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: cat.color }} />
        )}
        <span className="truncate">{cat.name}</span>
      </button>
      {isOpen &&
        children.map((c) => (
          <TreeNode
            key={c.id}
            cat={c}
            depth={depth + 1}
            childrenMap={childrenMap}
            selectedId={selectedId}
            onSelect={onSelect}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
    </div>
  );
}

export function CategoryTreePicker({ value, onChange }: Props) {
  const categories = useKbStore((s) => s.categories);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand ancestors of the selected category
    const set = new Set<string>();
    if (value) {
      const cats = categories;
      let current = cats.find((c) => c.id === value);
      while (current?.parentId) {
        set.add(current.parentId);
        current = cats.find((c) => c.id === current!.parentId);
      }
    } else {
      // Default expand all root nodes
      categories.filter((c) => c.parentId === null).forEach((c) => set.add(c.id));
    }
    return set;
  });

  const childrenMap = new Map<string | null, KbCategory[]>();
  categories.forEach((c) => {
    const list = childrenMap.get(c.parentId) || [];
    list.push(c);
    childrenMap.set(c.parentId, list);
  });
  // Sort each level alphabetically
  childrenMap.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const roots = childrenMap.get(null) || [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white max-h-64 overflow-y-auto p-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] text-left text-slate-500 hover:bg-slate-100/80",
          value === null && "bg-blue-50 text-blue-700 hover:bg-blue-50"
        )}
      >
        <span className="w-4" />
        <Folder className="h-3.5 w-3.5 text-slate-400" />
        Aucune catégorie
      </button>
      {roots.map((c) => (
        <TreeNode
          key={c.id}
          cat={c}
          depth={0}
          childrenMap={childrenMap}
          selectedId={value}
          onSelect={onChange}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </div>
  );
}
