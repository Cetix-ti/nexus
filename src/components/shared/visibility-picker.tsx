"use client";

import { Lock, UserCheck, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export type Visibility = "INTERNAL" | "CLIENT_ADMIN" | "CLIENT_ALL";

const OPTIONS: Array<{
  value: Visibility;
  label: string;
  hint: string;
  icon: typeof Lock;
  color: string;
}> = [
  {
    value: "INTERNAL",
    label: "Privée — agents",
    hint: "Visible uniquement dans le portail agents",
    icon: Lock,
    color: "bg-slate-50 text-slate-700 ring-slate-200",
  },
  {
    value: "CLIENT_ADMIN",
    label: "Publique — admin client",
    hint: "Exposée au portail client, rôle administrateur uniquement",
    icon: UserCheck,
    color: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  {
    value: "CLIENT_ALL",
    label: "Publique — tout le portail",
    hint: "Exposée à tous les utilisateurs du portail client",
    icon: Eye,
    color: "bg-blue-50 text-blue-700 ring-blue-200",
  },
];

interface Props {
  value: Visibility;
  onChange: (v: Visibility) => void;
  /** Restreint les options proposées (ex: Particularités → INTERNAL + CLIENT_ADMIN). */
  allow?: Visibility[];
  disabled?: boolean;
  className?: string;
}

export function VisibilityPicker({ value, onChange, allow, disabled, className }: Props) {
  const options = OPTIONS.filter((o) => !allow || allow.includes(o.value));
  return (
    <div className={cn("inline-flex items-stretch rounded-lg ring-1 ring-slate-200 overflow-hidden bg-white", className)}>
      {options.map((o) => {
        const Icon = o.icon;
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            title={o.hint}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors border-r border-slate-200 last:border-r-0",
              selected ? o.color + " ring-1 ring-inset" : "bg-white text-slate-500 hover:bg-slate-50",
              disabled && "opacity-60 cursor-not-allowed",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
