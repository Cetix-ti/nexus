"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  PlusCircle,
  Ticket,
  BookOpen,
  Clock,
  ArrowRight,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderKanban,
} from "lucide-react";
import { mockProjects } from "@/lib/projects/mock-data";
import { getCurrentPortalOrg } from "@/lib/portal/current-user";
import { ProjectCard } from "@/components/portal/project-card";

const recentTickets = [
  {
    id: "TK-1042",
    subject: "Cannot access shared drive after password reset",
    status: "In Progress",
    statusVariant: "primary" as const,
    priority: "High",
    updated: "2 hours ago",
  },
  {
    id: "TK-1038",
    subject: "Request for additional monitor",
    status: "Waiting on Me",
    statusVariant: "warning" as const,
    priority: "Low",
    updated: "1 day ago",
  },
  {
    id: "TK-1035",
    subject: "VPN connection drops intermittently",
    status: "Open",
    statusVariant: "danger" as const,
    priority: "Medium",
    updated: "2 days ago",
  },
  {
    id: "TK-1029",
    subject: "New software license request - Figma",
    status: "Resolved",
    statusVariant: "success" as const,
    priority: "Low",
    updated: "5 days ago",
  },
  {
    id: "TK-1021",
    subject: "Email signature not updating correctly",
    status: "Closed",
    statusVariant: "default" as const,
    priority: "Low",
    updated: "1 week ago",
  },
];

const announcements = [
  {
    title: "Scheduled Maintenance - Email Servers",
    date: "Apr 8, 2026",
    excerpt:
      "Email services will be briefly unavailable on April 8th from 2:00 AM to 4:00 AM for routine maintenance.",
  },
  {
    title: "New: Self-Service Password Reset",
    date: "Apr 1, 2026",
    excerpt:
      "You can now reset your password directly from the login page without contacting IT support.",
  },
];

const statusIcon = {
  Open: AlertCircle,
  "In Progress": Loader2,
  "Waiting on Me": Clock,
  Resolved: CheckCircle2,
  Closed: CheckCircle2,
};

export default function PortalHomePage() {
  const orgId = getCurrentPortalOrg();
  const portalProjects = mockProjects
    .filter(
      (p) =>
        p.organizationId === orgId &&
        p.isVisibleToClient &&
        p.visibilitySettings.showProject &&
        (p.status === "active" || p.status === "at_risk" || p.status === "planning")
    )
    .slice(0, 3);

  return (
    <div className="space-y-8">

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/portal/tickets/new"
          className="group flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] group-hover:bg-blue-100 transition-colors">
            <PlusCircle className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-neutral-900">
              Submit a Ticket
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Report an issue or make a request
            </p>
          </div>
        </Link>

        <Link
          href="/portal/tickets"
          className="group flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
            <Ticket className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-neutral-900">
              Track My Tickets
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              View status and updates on your requests
            </p>
          </div>
        </Link>

        <Link
          href="/portal/kb"
          className="group flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-neutral-900">
              Knowledge Base
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Find answers and how-to guides
            </p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tickets */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center justify-between p-5 border-b border-neutral-100">
              <h2 className="text-base font-semibold text-neutral-900">
                My Recent Tickets
              </h2>
              <Link
                href="/portal/tickets"
                className="flex items-center gap-1 text-sm font-medium text-[#2563EB] hover:text-blue-700 transition-colors"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-neutral-100">
              {recentTickets.map((ticket) => {
                const Icon =
                  statusIcon[ticket.status as keyof typeof statusIcon] ||
                  AlertCircle;
                return (
                  <Link
                    key={ticket.id}
                    href={`/portal/tickets/${ticket.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-neutral-50 transition-colors"
                  >
                    <Icon
                      className={cn(
                        "h-4.5 w-4.5 shrink-0",
                        ticket.status === "In Progress" &&
                          "text-[#2563EB]",
                        ticket.status === "Open" && "text-red-500",
                        ticket.status === "Waiting on Me" &&
                          "text-amber-500",
                        ticket.status === "Resolved" &&
                          "text-emerald-500",
                        ticket.status === "Closed" && "text-neutral-400"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-neutral-400">
                          {ticket.id}
                        </span>
                        <Badge variant={ticket.statusVariant} className="text-[10px]">
                          {ticket.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-neutral-800 truncate">
                        {ticket.subject}
                      </p>
                    </div>
                    <span className="text-xs text-neutral-400 shrink-0 hidden sm:block">
                      {ticket.updated}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Announcements */}
        <div>
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 p-5 border-b border-neutral-100">
              <Megaphone className="h-4 w-4 text-[#2563EB]" />
              <h2 className="text-base font-semibold text-neutral-900">
                Announcements
              </h2>
            </div>
            <div className="divide-y divide-neutral-100">
              {announcements.map((item, i) => (
                <div key={i} className="p-5">
                  <p className="text-xs text-neutral-400">{item.date}</p>
                  <h3 className="mt-1 text-sm font-semibold text-neutral-900">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
                    {item.excerpt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Projets en cours */}
      {portalProjects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-[#2563EB]" />
              <h2 className="text-base font-semibold text-neutral-900">
                Projets en cours
              </h2>
            </div>
            <Link
              href="/portal/projects"
              className="flex items-center gap-1 text-sm font-medium text-[#2563EB] hover:text-blue-700 transition-colors"
            >
              Voir tous
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {portalProjects.map((p) => (
              <ProjectCard key={p.id} project={p} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
