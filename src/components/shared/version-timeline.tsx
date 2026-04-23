"use client";

import { History, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatRelativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 30) return `il y a ${j} j`;
  return d.toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

export interface VersionEntry {
  id: string;
  version: number;
  createdAt: string | Date;
  authorName?: string | null;
  changeNote?: string | null;
}

interface Props {
  versions: VersionEntry[];
  onRestore?: (versionId: string) => void;
  className?: string;
}

export function VersionTimeline({ versions, onRestore, className }: Props) {
  if (versions.length === 0) {
    return (
      <div className={cn("text-[12.5px] text-slate-500", className)}>
        <History className="inline h-3.5 w-3.5 mr-1" /> Aucune version antérieure.
      </div>
    );
  }
  return (
    <ol className={cn("space-y-3", className)}>
      {versions.map((v, idx) => (
        <li key={v.id} className="flex gap-3">
          <div className="relative shrink-0">
            <div className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold",
              idx === 0 ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-700",
            )}>
              {v.version}
            </div>
            {idx !== versions.length - 1 && (
              <div className="absolute left-1/2 top-6 -translate-x-1/2 w-px h-full bg-slate-200" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] text-slate-700">
                <span className="font-medium">v{v.version}</span>
                {v.authorName && <span className="text-slate-500"> — {v.authorName}</span>}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">
                  {formatRelativeTime(new Date(v.createdAt))}
                </span>
                {onRestore && idx !== 0 && (
                  <button
                    type="button"
                    onClick={() => onRestore(v.id)}
                    className="text-[11px] text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                    title="Restaurer cette version"
                  >
                    <Undo2 className="h-3 w-3" /> Restaurer
                  </button>
                )}
              </div>
            </div>
            {v.changeNote && (
              <p className="mt-1 text-[12px] text-slate-600">{v.changeNote}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
