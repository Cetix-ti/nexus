"use client";

import { CheckCircle2, AlertTriangle, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";

export type SyncState = "IN_SYNC" | "DRIFTED" | "DETACHED";

interface Props {
  state: SyncState;
  onClick?: () => void;
  className?: string;
}

const META: Record<SyncState, { label: string; icon: typeof CheckCircle2; color: string; hint: string }> = {
  IN_SYNC: {
    label: "À jour",
    icon: CheckCircle2,
    color: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    hint: "Cette instance est alignée avec la version courante du modèle global.",
  },
  DRIFTED: {
    label: "À réviser",
    icon: AlertTriangle,
    color: "bg-amber-50 text-amber-800 ring-amber-200",
    hint: "Le modèle global a évolué depuis l'instanciation. Cliquez pour voir les différences.",
  },
  DETACHED: {
    label: "Détachée",
    icon: Unlink,
    color: "bg-slate-50 text-slate-600 ring-slate-200",
    hint: "Lien avec le modèle global rompu. Éditions libres côté client.",
  },
};

export function SyncBadge({ state, onClick, className }: Props) {
  const m = META[state];
  const Icon = m.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={m.hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        m.color,
        onClick && "cursor-pointer hover:opacity-80",
        !onClick && "cursor-default",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {m.label}
    </button>
  );
}
