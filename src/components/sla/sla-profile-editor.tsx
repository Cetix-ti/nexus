"use client";

import { Clock, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  type SlaPolicy,
  type SlaPriority,
  type SlaProfile,
} from "@/stores/sla-store";

const VARIANTS: Record<SlaPriority, "success" | "primary" | "warning" | "danger"> = {
  low: "success",
  medium: "primary",
  high: "warning",
  critical: "danger",
};

interface Props {
  profile: SlaProfile;
  onChange: (priority: SlaPriority, policy: SlaPolicy) => void;
  disabled?: boolean;
}

function HoursInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      step="0.25"
      min="0"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] tabular-nums text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:bg-slate-50"
    />
  );
}

export function SlaProfileEditor({ profile, onChange, disabled }: Props) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-200/80 bg-slate-50/60">
            <th className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Priorité
            </th>
            <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" />
                1ère réponse (h)
              </span>
            </th>
            <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Résolution (h)
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {PRIORITY_ORDER.map((p) => {
            const pol = profile?.[p] ?? { firstResponseHours: 0, resolutionHours: 0 };
            return (
              <tr
                key={p}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-3">
                  <Badge variant={VARIANTS[p]}>{PRIORITY_LABELS[p]}</Badge>
                </td>
                <td className="px-3 py-3">
                  <HoursInput
                    value={pol.firstResponseHours}
                    onChange={(v) =>
                      onChange(p, { ...pol, firstResponseHours: v })
                    }
                    disabled={disabled}
                  />
                </td>
                <td className="px-3 py-3">
                  <HoursInput
                    value={pol.resolutionHours}
                    onChange={(v) =>
                      onChange(p, { ...pol, resolutionHours: v })
                    }
                    disabled={disabled}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
}
