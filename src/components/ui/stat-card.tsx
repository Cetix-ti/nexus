import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    direction: "up" | "down" | "flat";
    label?: string;
  };
}

function StatCard({ icon, label, value, trend, className, ...props }: StatCardProps) {
  const trendColor = {
    up: "text-emerald-600",
    down: "text-red-600",
    flat: "text-neutral-500",
  };

  const TrendIcon = {
    up: TrendingUp,
    down: TrendingDown,
    flat: Minus,
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-500">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-neutral-900">{value}</p>
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className={cn("mt-3 flex items-center gap-1 text-sm", trendColor[trend.direction])}>
          {React.createElement(TrendIcon[trend.direction], { className: "h-4 w-4" })}
          <span className="font-medium">{Math.abs(trend.value)}%</span>
          {trend.label && <span className="text-neutral-500">{trend.label}</span>}
        </div>
      )}
    </div>
  );
}

export { StatCard };
export type { StatCardProps };
