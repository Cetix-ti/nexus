"use client";

import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: number;
    direction: "up" | "down";
    label?: string;
  };
  warning?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconColor = "text-blue-600",
  iconBg = "bg-blue-50",
  trend,
  warning = false,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-xl border border-slate-200/80 bg-white p-3.5 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]",
        warning && "border-amber-200/80",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
            {label}
          </p>
          <p
            className={cn(
              "mt-1.5 sm:mt-2.5 text-[22px] sm:text-[28px] font-semibold leading-none tracking-[-0.025em] tabular-nums text-slate-900",
              warning && "text-amber-600"
            )}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            "shrink-0 flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg ring-1 ring-inset transition-transform duration-200 group-hover:scale-105",
            iconBg,
            "ring-current/10"
          )}
        >
          <Icon className={cn("h-[14px] w-[14px] sm:h-[18px] sm:w-[18px]", iconColor)} strokeWidth={2.25} />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center gap-1.5 pt-3 border-t border-slate-100">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
              trend.direction === "up"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            )}
          >
            {trend.direction === "up" ? (
              <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
            ) : (
              <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
            )}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-[11px] text-slate-400">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}
