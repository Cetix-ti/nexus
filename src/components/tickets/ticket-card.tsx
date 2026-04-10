"use client";

import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Clock,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  ArrowUp,
  Minus,
  ArrowDown,
  Zap,
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

const PRIORITY_ICONS: Record<TicketPriority, { Icon: typeof ArrowUp; tint: string; bg: string; ring: string }> = {
  critical: { Icon: Zap, tint: "text-red-600", bg: "bg-red-50", ring: "ring-red-200/70" },
  high: { Icon: ArrowUp, tint: "text-orange-600", bg: "bg-orange-50", ring: "ring-orange-200/70" },
  medium: { Icon: Minus, tint: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200/70" },
  low: { Icon: ArrowDown, tint: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200/70" },
};

// Generate consistent avatar gradient from name
function getAvatarGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-700",
    "from-violet-500 to-violet-700",
    "from-emerald-500 to-emerald-700",
    "from-amber-500 to-amber-700",
    "from-rose-500 to-rose-700",
    "from-cyan-500 to-cyan-700",
    "from-fuchsia-500 to-fuchsia-700",
    "from-indigo-500 to-indigo-700",
  ];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const priority = PRIORITY_CONFIG[ticket.priority];
  const PriorityCfg = PRIORITY_ICONS[ticket.priority];
  const PriorityIcon = PriorityCfg.Icon;
  const orgInitials = getInitials(ticket.organizationName);
  const orgGradient = getAvatarGradient(ticket.organizationName);
  const orgLogo = useOrgLogosStore((s) => s.logos[ticket.organizationName]);
  const assigneeAvatar = ticket.assigneeName ? useAgentAvatarsStore((s) => s.avatars[ticket.assigneeName!]) : null;
  const isNew = Date.now() - new Date(ticket.createdAt).getTime() < 60 * 60 * 1000;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-xl border border-slate-200/80 bg-white",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        "hover:shadow-[0_8px_20px_-8px_rgba(15,23,42,0.15)] hover:border-slate-300/80 hover:-translate-y-0.5",
        "transition-all duration-200"
      )}
    >
      <div className="p-3.5">
        {/* Header row: ticket number + new indicator + SLA badge */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-[10.5px] text-slate-400 tabular-nums truncate">
              {ticket.number}
            </span>
            {isNew && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 ring-1 ring-inset ring-blue-200/60">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[9px] font-medium text-blue-600">Nouveau</span>
              </span>
            )}
          </div>

          {ticket.slaBreached && (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 ring-1 ring-inset ring-red-200/80"
              title="SLA dépassé"
            >
              <AlertTriangle className="h-2.5 w-2.5 text-red-600" strokeWidth={2.5} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-red-600">SLA</span>
            </span>
          )}
        </div>

        {/* Subject — main title */}
        <h4 className="text-[13.5px] font-semibold leading-snug text-slate-900 line-clamp-2 group-hover:text-blue-700 transition-colors mb-2">
          {ticket.subject}
        </h4>

        {/* Org + requester */}
        <div className="flex items-center gap-2 mb-3">
          {orgLogo ? (
            <img
              src={orgLogo}
              alt=""
              className="h-5 w-5 rounded-md object-contain bg-white ring-1 ring-slate-200 shrink-0"
            />
          ) : (
            <div
              className={cn(
                "h-5 w-5 rounded-md bg-gradient-to-br flex items-center justify-center text-white text-[8.5px] font-bold shrink-0 shadow-sm",
                orgGradient
              )}
            >
              {orgInitials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-medium text-slate-700 truncate leading-tight">
              {ticket.organizationName}
            </p>
            <p className="text-[10.5px] text-slate-500 truncate leading-tight mt-0.5">
              {ticket.requesterName}
            </p>
          </div>
        </div>

        {/* Footer: meta + assignee */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
          {/* Left: priority icon + created time + comments/attachments */}
          <div className="flex items-center gap-2.5 text-slate-400">
            <span title={priority.label}>
              <PriorityIcon
                className={cn("h-3 w-3", PriorityCfg.tint)}
                strokeWidth={2.5}
              />
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10.5px] tabular-nums">
              <Clock className="h-2.5 w-2.5" strokeWidth={2.25} />
              {formatDistanceToNow(new Date(ticket.createdAt), {
                addSuffix: false,
                locale: fr,
              })}
            </span>
            {ticket.comments?.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10.5px] tabular-nums">
                <MessageSquare className="h-2.5 w-2.5" strokeWidth={2.25} />
                {ticket.comments.length}
              </span>
            )}
            <span className="inline-flex items-center gap-0.5 text-[10.5px] tabular-nums">
              <Paperclip className="h-2.5 w-2.5" strokeWidth={2.25} />
              0
            </span>
          </div>

          {/* Right: assignee */}
          {ticket.assigneeName ? (
            assigneeAvatar ? (
              <img
                src={assigneeAvatar}
                alt={ticket.assigneeName}
                className="h-5 w-5 rounded-full object-cover ring-2 ring-white shadow-sm"
                title={ticket.assigneeName}
              />
            ) : (
              <div
                className={cn(
                  "h-5 w-5 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[8.5px] font-bold ring-2 ring-white shadow-sm",
                  getAvatarGradient(ticket.assigneeName)
                )}
                title={ticket.assigneeName}
              >
                {getInitials(ticket.assigneeName)}
              </div>
            )
          ) : (
            <div
              className="h-5 w-5 rounded-full border border-dashed border-slate-300 flex items-center justify-center"
              title="Non assigné"
            >
              <span className="text-[9px] text-slate-400 font-bold">?</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
