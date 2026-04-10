"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

interface Ticket {
  id: string;
  number: number;
  subject: string;
  organization: string;
  status: "new" | "open" | "pending" | "resolved" | "closed";
  priority: "critical" | "high" | "medium" | "low";
  createdAt: string;
  assignee?: string;
}

interface RecentTicketsProps {
  tickets: Ticket[];
  title?: string;
  showAssignee?: boolean;
}

const priorityDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
};

const statusVariant: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  new: "primary",
  open: "primary",
  pending: "warning",
  resolved: "success",
  closed: "default",
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

export function RecentTickets({
  tickets,
  title = "Recent Tickets",
  showAssignee = false,
}: RecentTicketsProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between p-5 pb-3">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        <Link
          href="/tickets"
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-neutral-100">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                priorityDot[ticket.priority]
              )}
            />
            <span className="text-sm font-mono text-neutral-400 shrink-0">
              #{ticket.number}
            </span>
            <span className="text-sm font-medium text-neutral-900 truncate min-w-0 flex-1">
              {ticket.subject}
            </span>
            {showAssignee && ticket.assignee && (
              <span className="text-xs text-neutral-500 shrink-0 hidden lg:block">
                {ticket.assignee}
              </span>
            )}
            <Badge variant="outline" className="shrink-0 hidden sm:inline-flex text-[11px]">
              {ticket.organization}
            </Badge>
            <Badge variant={statusVariant[ticket.status]} className="shrink-0 capitalize text-[11px]">
              {ticket.status}
            </Badge>
            <span className="text-xs text-neutral-400 shrink-0 w-16 text-right">
              {timeAgo(ticket.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
