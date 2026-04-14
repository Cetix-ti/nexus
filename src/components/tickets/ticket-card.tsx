"use client";

import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Clock,
  AlertTriangle,
  MessageSquare,
  ArrowUp,
  Minus,
  ArrowDown,
  Zap,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, type Ticket, type TicketPriority } from "@/lib/mock-data";
import { useOrgLogosStore } from "@/stores/org-logos-store";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";

interface TicketCardProps {
  ticket: Ticket;
  onClick?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const PRIORITY_ICONS: Record<TicketPriority, { Icon: typeof ArrowUp; tint: string }> = {
  critical: { Icon: Zap, tint: "text-red-500" },
  high: { Icon: ArrowUp, tint: "text-orange-500" },
  medium: { Icon: Minus, tint: "text-amber-500" },
  low: { Icon: ArrowDown, tint: "text-emerald-500" },
};

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const priority = PRIORITY_CONFIG[ticket.priority];
  const PriorityCfg = PRIORITY_ICONS[ticket.priority];
  const PriorityIcon = PriorityCfg.Icon;
  const orgLogo = useOrgLogosStore((s) => s.logos[ticket.organizationName]);
  // Always subscribe; nullify in the selector if no assignee (avoid conditional hook)
  const assigneeAvatar = useAgentAvatarsStore((s) =>
    ticket.assigneeName ? s.avatars[ticket.assigneeName] : null
  );
  const isNew =
    Date.now() - new Date(ticket.createdAt).getTime() < 60 * 60 * 1000;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-[14px] bg-white",
        "border border-slate-200/70",
        "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        "hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.1)] hover:border-slate-300/80 hover:-translate-y-[2px]",
        "transition-all duration-200 ease-out",
      )}
    >
      {/* Priority accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ backgroundColor: priority.color }}
      />

      <div className="pl-4 pr-3.5 py-3">
        {/* Row 1: ticket number + badges */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-[10px] font-medium text-slate-400 tracking-wide">
              {ticket.number}
            </span>
            {isNew && (
              <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-px">
                <span className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[8.5px] font-semibold text-blue-600 uppercase tracking-wider">
                  Nouveau
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {ticket.slaBreached && (
              <span className="flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 ring-1 ring-inset ring-red-200/80">
                <AlertTriangle className="h-2.5 w-2.5 text-red-500" strokeWidth={2.5} />
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-red-600">
                  SLA
                </span>
              </span>
            )}
            <PriorityIcon
              className={cn("h-3 w-3", PriorityCfg.tint)}
              strokeWidth={2.5}
            />
          </div>
        </div>

        {/* Row 2: Subject */}
        <h4 className="text-[13px] font-semibold leading-[1.35] text-slate-900 line-clamp-2 group-hover:text-blue-700 transition-colors mb-2.5">
          {ticket.subject}
        </h4>

        {/* Row 3: Requester with org logo */}
        <div className="flex items-center gap-2 mb-2.5">
          {orgLogo ? (
            <img
              src={orgLogo}
              alt={ticket.organizationName}
              title={ticket.organizationName}
              className="h-[18px] w-[18px] rounded object-contain bg-white ring-1 ring-slate-200/80 shrink-0"
            />
          ) : (
            <div
              className="h-[18px] w-[18px] rounded bg-slate-100 ring-1 ring-slate-200/80 flex items-center justify-center shrink-0"
              title={ticket.organizationName}
            >
              <span className="text-[7px] font-bold text-slate-500">
                {getInitials(ticket.organizationName)}
              </span>
            </div>
          )}
          <span className="text-[11.5px] text-slate-600 truncate leading-none">
            {ticket.requesterName}
          </span>
        </div>

        {/* Row 4: Footer meta + assignee */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="inline-flex items-center gap-0.5 text-[10px] tabular-nums">
              <Clock className="h-2.5 w-2.5" strokeWidth={2} />
              {formatDistanceToNow(new Date(ticket.createdAt), {
                addSuffix: false,
                locale: fr,
              })}
            </span>
            {ticket.comments?.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] tabular-nums">
                <MessageSquare className="h-2.5 w-2.5" strokeWidth={2} />
                {ticket.comments.length}
              </span>
            )}
          </div>

          {/* Assignee — photo or neutral initials */}
          {ticket.assigneeName ? (
            assigneeAvatar ? (
              <img
                src={assigneeAvatar}
                alt={ticket.assigneeName}
                title={ticket.assigneeName}
                className="h-[22px] w-[22px] rounded-full object-cover ring-2 ring-white shadow-sm"
              />
            ) : (
              <div
                className="h-[22px] w-[22px] rounded-full bg-slate-200 flex items-center justify-center ring-2 ring-white"
                title={ticket.assigneeName}
              >
                <span className="text-[8px] font-semibold text-slate-600">
                  {getInitials(ticket.assigneeName)}
                </span>
              </div>
            )
          ) : (
            <div
              className="h-[22px] w-[22px] rounded-full border border-dashed border-slate-300 flex items-center justify-center"
              title="Non assigné"
            >
              <User className="h-2.5 w-2.5 text-slate-300" strokeWidth={2} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
