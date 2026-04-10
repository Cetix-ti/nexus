"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Paperclip,
  Send,
  User,
  Clock,
  Calendar,
  Tag,
  UserCircle,
  AlertCircle,
} from "lucide-react";

const ticketData: Record<
  string,
  {
    id: string;
    subject: string;
    status: string;
    statusVariant: "default" | "primary" | "success" | "warning" | "danger";
    priority: string;
    priorityVariant: "default" | "primary" | "success" | "warning" | "danger";
    category: string;
    created: string;
    updated: string;
    assignedTo: string;
    description: string;
    conversation: {
      author: string;
      role: "client" | "agent";
      date: string;
      message: string;
    }[];
  }
> = {
  "TK-1042": {
    id: "TK-1042",
    subject: "Cannot access shared drive after password reset",
    status: "In Progress",
    statusVariant: "primary",
    priority: "High",
    priorityVariant: "danger",
    category: "Network & VPN",
    created: "Apr 4, 2026 at 9:15 AM",
    updated: "Apr 6, 2026 at 2:30 PM",
    assignedTo: "Thomas Martin",
    description:
      "After I reset my password yesterday, I can no longer access the shared network drive (\\\\server\\shared). I get an \"Access Denied\" error. I've tried restarting my computer and reconnecting the drive but the issue persists. This is blocking my work as I need access to project files.",
    conversation: [
      {
        author: "Thomas Martin",
        role: "agent",
        date: "Apr 4, 2026 at 10:30 AM",
        message:
          "Hi Marie, thank you for reporting this. After a password reset, network drive credentials sometimes need to be updated in Windows Credential Manager. Could you try the following:\n\n1. Open Control Panel > Credential Manager\n2. Look for any entries related to the shared drive\n3. Remove them and try accessing the drive again\n\nLet me know if that helps!",
      },
      {
        author: "Marie Dupont",
        role: "client",
        date: "Apr 4, 2026 at 11:45 AM",
        message:
          "Hi Thomas, I tried removing the credentials as you suggested, but I'm still getting the same error. The drive shows up in File Explorer but when I click on it, it says Access Denied.",
      },
      {
        author: "Thomas Martin",
        role: "agent",
        date: "Apr 6, 2026 at 2:30 PM",
        message:
          "Thanks for trying that, Marie. I've checked our Active Directory and it looks like your account permissions need to be re-synced after the password change. I've initiated a sync and it should propagate within the next hour. Please try again after 3:30 PM and let me know if the issue is resolved.",
      },
    ],
  },
  "TK-1038": {
    id: "TK-1038",
    subject: "Request for additional monitor",
    status: "Waiting on Me",
    statusVariant: "warning",
    priority: "Low",
    priorityVariant: "default",
    category: "Hardware",
    created: "Apr 3, 2026 at 2:00 PM",
    updated: "Apr 5, 2026 at 9:00 AM",
    assignedTo: "Sophie Leclerc",
    description:
      "I'd like to request an additional monitor for my workstation. Having a dual-monitor setup would significantly improve my productivity when working with spreadsheets and reports.",
    conversation: [
      {
        author: "Sophie Leclerc",
        role: "agent",
        date: "Apr 4, 2026 at 10:00 AM",
        message:
          "Hi Marie, we can certainly look into getting you an additional monitor. I'll need your manager's approval before we can proceed. Could you please have your manager send a quick email to it@acme.com confirming this request? Once we have that, we'll get it ordered right away.",
      },
    ],
  },
};

const fallbackTicket = {
  id: "TK-1035",
  subject: "VPN connection drops intermittently from home office",
  status: "Open",
  statusVariant: "danger" as const,
  priority: "Medium",
  priorityVariant: "warning" as const,
  category: "Network & VPN",
  created: "Apr 2, 2026 at 3:30 PM",
  updated: "Apr 4, 2026 at 8:00 AM",
  assignedTo: "Thomas Martin",
  description:
    "My VPN connection keeps dropping every 20-30 minutes when working from home. I'm using the company-provided VPN client. The issue started about a week ago. My internet connection is stable (tested with speed tests). I've tried restarting the VPN client and my router but the problem persists.",
  conversation: [
    {
      author: "Thomas Martin",
      role: "agent" as const,
      date: "Apr 3, 2026 at 9:15 AM",
      message:
        "Hi Marie, I'm sorry to hear about the VPN issues. This could be related to a few things. Could you tell me:\n\n1. Which VPN client version are you using? (Check Help > About)\n2. Are you connected via Wi-Fi or Ethernet?\n3. Has anything changed recently with your home network setup?",
    },
  ],
};

export default function PortalTicketDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const ticket = ticketData[id] || { ...fallbackTicket, id };
  const [reply, setReply] = useState("");

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/portal/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Tickets
      </Link>

      {/* Ticket Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-mono text-neutral-400">{ticket.id}</span>
            <Badge variant={ticket.statusVariant}>{ticket.status}</Badge>
            <Badge variant={ticket.priorityVariant}>{ticket.priority}</Badge>
          </div>
          <h1 className="mt-2 text-xl font-bold text-neutral-900">
            {ticket.subject}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main Content */}
        <div className="space-y-6">
          {/* Description */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-6">
            <h2 className="text-sm font-semibold text-neutral-900 mb-3">
              Description
            </h2>
            <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
              {ticket.description}
            </p>
          </div>

          {/* Conversation */}
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="p-5 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">
                Conversation
              </h2>
            </div>
            <div className="divide-y divide-neutral-100">
              {ticket.conversation.map((msg, i) => (
                <div key={i} className="p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        msg.role === "agent"
                          ? "bg-blue-100 text-[#2563EB]"
                          : "bg-neutral-100 text-neutral-500"
                      )}
                    >
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-900">
                          {msg.author}
                        </span>
                        {msg.role === "agent" && (
                          <span className="text-[10px] font-medium bg-blue-50 text-[#2563EB] rounded-full px-2 py-0.5">
                            Support
                          </span>
                        )}
                        <span className="text-xs text-neutral-400">
                          {msg.date}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Form */}
            <div className="p-5 border-t border-neutral-100 bg-[#F9FAFB] rounded-b-xl">
              <label className="text-sm font-medium text-neutral-700 block mb-2">
                Write a reply
              </label>
              <textarea
                rows={4}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your message here..."
                className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 resize-none"
              />
              <div className="flex items-center justify-between mt-3">
                <button className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
                  <Paperclip className="h-4 w-4" />
                  Attach file
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
                  <Send className="h-4 w-4" />
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Details</h3>

            <div className="space-y-3.5">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    Status
                  </p>
                  <Badge variant={ticket.statusVariant} className="mt-0.5">
                    {ticket.status}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    Priority
                  </p>
                  <Badge variant={ticket.priorityVariant} className="mt-0.5">
                    {ticket.priority}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    Category
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {ticket.category}
                  </p>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-3.5 flex items-center gap-3">
                <UserCircle className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    Assigned To
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {ticket.assignedTo}
                  </p>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-3.5 flex items-center gap-3">
                <Calendar className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    Created
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {ticket.created}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">
                    Last Updated
                  </p>
                  <p className="text-sm text-neutral-700 mt-0.5">
                    {ticket.updated}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
