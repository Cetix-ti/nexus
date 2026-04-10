"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  MapPin,
  Monitor,
  Building2,
  Phone,
  GraduationCap,
  Users,
  Wrench,
  Rocket,
  ShieldCheck,
  Repeat,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INTERVENTION_TYPE_COLORS,
  INTERVENTION_TYPE_LABELS,
  INTERVENTION_STATUS_LABELS,
  type ScheduledIntervention,
  type InterventionType,
  type InterventionStatus,
} from "@/lib/scheduling/types";
import { mockSchedulerTechnicians } from "@/lib/scheduling/mock-data";

const TYPE_ICONS: Record<InterventionType, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  remote_intervention: Monitor,
  onsite_intervention: Wrench,
  phone_call: Phone,
  training: GraduationCap,
  meeting: Users,
  maintenance: Wrench,
  deployment: Rocket,
  audit: ShieldCheck,
  follow_up: Repeat,
  internal: ClipboardList,
};

const STATUS_STYLE: Record<InterventionStatus, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200/70",
  scheduled: "bg-blue-50 text-blue-700 ring-blue-200/70",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200/70",
  completed: "bg-slate-50 text-slate-600 ring-slate-200/70",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200/70",
  rescheduled: "bg-violet-50 text-violet-700 ring-violet-200/70",
  no_show: "bg-orange-50 text-orange-700 ring-orange-200/70",
};

function getTechColor(techId: string | undefined): string {
  const t = mockSchedulerTechnicians.find((x) => x.id === techId);
  return t?.color ?? "from-slate-400 to-slate-600";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface InterventionCardProps {
  intervention: ScheduledIntervention;
  compact?: boolean;
  onClick?: () => void;
}

export function InterventionCard({ intervention, compact = false, onClick }: InterventionCardProps) {
  const typeColor = INTERVENTION_TYPE_COLORS[intervention.type];
  const Icon = TYPE_ICONS[intervention.type];
  const start = new Date(intervention.startsAt);
  const end = new Date(intervention.endsAt);
  const timeLabel = `${format(start, "H:mm", { locale: fr })} — ${format(end, "H:mm", { locale: fr })}`;
  const isOnsite = intervention.type === "onsite_intervention";
  const primaryTechId = intervention.primaryTechnicianId ?? intervention.technicianIds[0];
  const primaryTechName =
    intervention.technicianNames[intervention.technicianIds.indexOf(primaryTechId ?? "")] ??
    intervention.technicianNames[0];

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full text-left rounded-md border-l-[3px] bg-white pl-2 pr-2 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow transition-all",
          typeColor.border
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={cn("h-3 w-3 shrink-0", typeColor.text)} strokeWidth={2.25} />
          <span className="text-[11.5px] font-semibold text-slate-900 truncate">
            {intervention.title}
          </span>
        </div>
        <div className="text-[10.5px] text-slate-500 tabular-nums mt-0.5 truncate">
          {timeLabel}
          {primaryTechName && <span className="ml-1.5">· {primaryTechName.split(" ")[0]}</span>}
        </div>
      </button>
    );
  }

  const extraTechs = intervention.technicianIds.filter((id) => id !== primaryTechId);
  const visibleTechs = [primaryTechId, ...extraTechs].filter(Boolean).slice(0, 3) as string[];
  const extraCount = Math.max(0, intervention.technicianIds.length - visibleTechs.length);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border-l-[3px] bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow transition-all",
        typeColor.border
      )}
    >
      {/* Top row */}
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "h-6 w-6 rounded-md flex items-center justify-center shrink-0 ring-1 ring-inset",
            typeColor.bg,
            typeColor.ring
          )}
          title={INTERVENTION_TYPE_LABELS[intervention.type]}
        >
          <Icon className={cn("h-3.5 w-3.5", typeColor.text)} strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-900 leading-tight line-clamp-2">
            {intervention.title}
          </p>
          <p className="text-[11.5px] text-slate-500 tabular-nums mt-0.5">{timeLabel}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset whitespace-nowrap",
            STATUS_STYLE[intervention.status]
          )}
        >
          {INTERVENTION_STATUS_LABELS[intervention.status]}
        </span>
      </div>

      {/* Org */}
      <div className="mt-2 flex items-center gap-1.5 min-w-0">
        <div className="h-4 w-4 rounded bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
          <Building2 className="h-2.5 w-2.5" strokeWidth={2.5} />
        </div>
        <span className="text-[11.5px] text-slate-600 truncate">{intervention.organizationName}</span>
      </div>

      {/* Site */}
      {isOnsite && intervention.siteName && (
        <div className="mt-1 flex items-center gap-1.5 min-w-0">
          <MapPin className="h-3 w-3 text-slate-400 shrink-0" strokeWidth={2.25} />
          <span className="text-[11px] text-slate-500 truncate">{intervention.siteName}</span>
        </div>
      )}

      {/* Technician avatars */}
      {visibleTechs.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <div className="flex -space-x-1.5">
            {visibleTechs.map((techId, idx) => {
              const name = intervention.technicianNames[intervention.technicianIds.indexOf(techId)] ?? "";
              return (
                <div
                  key={techId + idx}
                  title={name}
                  className={cn(
                    "h-5 w-5 rounded-full bg-gradient-to-br ring-2 ring-white flex items-center justify-center text-white text-[8.5px] font-semibold",
                    getTechColor(techId)
                  )}
                >
                  {getInitials(name)}
                </div>
              );
            })}
            {extraCount > 0 && (
              <div className="h-5 w-5 rounded-full bg-slate-100 ring-2 ring-white flex items-center justify-center text-slate-600 text-[9px] font-semibold">
                +{extraCount}
              </div>
            )}
          </div>
          {intervention.isRecurring && (
            <Repeat className="h-3 w-3 text-slate-400 ml-auto" strokeWidth={2.25} />
          )}
        </div>
      )}
    </button>
  );
}
