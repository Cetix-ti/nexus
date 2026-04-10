"use client";

import React, { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  PlusCircle,
  Search,
  ArrowUpDown,
  ChevronRight,
} from "lucide-react";

type TicketStatus = "Open" | "In Progress" | "Waiting on Me" | "Resolved" | "Closed";

interface MockTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  statusVariant: "default" | "primary" | "success" | "warning" | "danger";
  priority: string;
  priorityVariant: "default" | "primary" | "success" | "warning" | "danger";
  category: string;
  created: string;
  updated: string;
}

const mockTickets: MockTicket[] = [
  {
    id: "TK-1042",
    subject: "Cannot access shared drive after password reset",
    status: "In Progress",
    statusVariant: "primary",
    priority: "High",
    priorityVariant: "danger",
    category: "Network & VPN",
    created: "Apr 4, 2026",
    updated: "Apr 6, 2026",
  },
  {
    id: "TK-1038",
    subject: "Request for additional monitor",
    status: "Waiting on Me",
    statusVariant: "warning",
    priority: "Low",
    priorityVariant: "default",
    category: "Hardware",
    created: "Apr 3, 2026",
    updated: "Apr 5, 2026",
  },
  {
    id: "TK-1035",
    subject: "VPN connection drops intermittently from home office",
    status: "Open",
    statusVariant: "danger",
    priority: "Medium",
    priorityVariant: "warning",
    category: "Network & VPN",
    created: "Apr 2, 2026",
    updated: "Apr 4, 2026",
  },
  {
    id: "TK-1029",
    subject: "New software license request - Figma",
    status: "Resolved",
    statusVariant: "success",
    priority: "Low",
    priorityVariant: "default",
    category: "Software",
    created: "Mar 30, 2026",
    updated: "Apr 1, 2026",
  },
  {
    id: "TK-1024",
    subject: "Outlook keeps crashing on startup",
    status: "Closed",
    statusVariant: "default",
    priority: "High",
    priorityVariant: "danger",
    category: "Email & Communication",
    created: "Mar 28, 2026",
    updated: "Mar 30, 2026",
  },
  {
    id: "TK-1021",
    subject: "Email signature not updating correctly",
    status: "Closed",
    statusVariant: "default",
    priority: "Low",
    priorityVariant: "default",
    category: "Email & Communication",
    created: "Mar 25, 2026",
    updated: "Mar 28, 2026",
  },
  {
    id: "TK-1018",
    subject: "Request access to Marketing shared folder",
    status: "Resolved",
    statusVariant: "success",
    priority: "Medium",
    priorityVariant: "warning",
    category: "Account & Access",
    created: "Mar 22, 2026",
    updated: "Mar 24, 2026",
  },
  {
    id: "TK-1012",
    subject: "Laptop battery draining unusually fast",
    status: "In Progress",
    statusVariant: "primary",
    priority: "Medium",
    priorityVariant: "warning",
    category: "Hardware",
    created: "Mar 19, 2026",
    updated: "Apr 3, 2026",
  },
];

const tabs: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "Open" },
  { label: "In Progress", value: "In Progress" },
  { label: "Waiting on Me", value: "Waiting on Me" },
  { label: "Resolved", value: "Resolved" },
  { label: "Closed", value: "Closed" },
];

export default function PortalTicketsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = mockTickets.filter((t) => {
    const matchesTab = activeTab === "all" || t.status === activeTab;
    const matchesSearch =
      !search ||
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">My Tickets</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Track and manage all your support requests
          </p>
        </div>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          New Ticket
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        {/* Search */}
        <div className="p-4 border-b border-neutral-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] py-2 pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
            />
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 overflow-x-auto">
          {tabs.map((tab) => {
            const count =
              tab.value === "all"
                ? mockTickets.length
                : mockTickets.filter((t) => t.status === tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  activeTab === tab.value
                    ? "bg-blue-50 text-[#2563EB]"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "text-[10px] font-semibold rounded-full px-1.5 py-0.5",
                    activeTab === tab.value
                      ? "bg-blue-100 text-[#2563EB]"
                      : "bg-neutral-100 text-neutral-400"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="mt-2">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-[100px_1fr_120px_90px_100px_100px] gap-3 px-5 py-2.5 text-xs font-medium text-neutral-400 uppercase tracking-wider border-b border-neutral-100">
            <span>Ticket</span>
            <span>Subject</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Created</span>
            <span>Updated</span>
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-neutral-400">
                No tickets found matching your criteria.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filtered.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/portal/tickets/${ticket.id}`}
                  className="group grid grid-cols-1 sm:grid-cols-[100px_1fr_120px_90px_100px_100px] gap-1 sm:gap-3 items-center px-5 py-3.5 hover:bg-neutral-50 transition-colors"
                >
                  <span className="text-sm font-mono font-medium text-[#2563EB]">
                    {ticket.id}
                  </span>
                  <span className="text-sm text-neutral-800 font-medium truncate group-hover:text-[#2563EB] transition-colors">
                    {ticket.subject}
                  </span>
                  <div>
                    <Badge variant={ticket.statusVariant}>
                      {ticket.status}
                    </Badge>
                  </div>
                  <div>
                    <Badge variant={ticket.priorityVariant}>
                      {ticket.priority}
                    </Badge>
                  </div>
                  <span className="text-xs text-neutral-400 hidden sm:block">
                    {ticket.created}
                  </span>
                  <span className="text-xs text-neutral-400 hidden sm:block">
                    {ticket.updated}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
