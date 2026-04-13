"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bell,
  Ticket,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  UserPlus,
  Clock,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "ticket_assigned" | "ticket_updated" | "sla_warning" | "new_comment" | "mention" | "ticket_resolved";
  title: string;
  message: string;
  href: string;
  createdAt: string; // relative
  isRead: boolean;
}

const ICON_MAP = {
  ticket_assigned: { Icon: Ticket, color: "text-blue-600", bg: "bg-blue-50" },
  ticket_updated: { Icon: Ticket, color: "text-violet-600", bg: "bg-violet-50" },
  sla_warning: { Icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  new_comment: { Icon: MessageSquare, color: "text-emerald-600", bg: "bg-emerald-50" },
  mention: { Icon: UserPlus, color: "text-amber-600", bg: "bg-amber-50" },
  ticket_resolved: { Icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days}j`;
}

const TYPE_MAP: Record<string, Notification["type"]> = {
  activity: "ticket_updated",
  comment: "new_comment",
  sla_breach: "sla_warning",
  approval: "ticket_assigned",
};

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Fetch from real API
  useEffect(() => {
    if (loaded) return;
    fetch("/api/v1/notifications?limit=15")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res) => {
        const items: Notification[] = (res.data || []).map((n: any) => ({
          id: n.id,
          type: TYPE_MAP[n.type] || "ticket_updated",
          title: n.title,
          message: n.description,
          href: n.ticketId ? `/tickets/${n.ticketId}` : "/tickets",
          createdAt: timeAgo(n.createdAt),
          isRead: n.read ?? false,
        }));
        setNotifications(items);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [loaded]);

  // Refresh when dropdown opens
  useEffect(() => {
    if (open) setLoaded(false);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  function dismissNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function markAsRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="relative h-9 w-9 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        title="Notifications"
      >
        <Bell className="w-[17px] h-[17px]" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center bg-red-500 text-white text-[9px] font-semibold rounded-full ring-2 ring-white tabular-nums">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[calc(100vw-2rem)] sm:w-[400px] rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-10px_rgba(15,23,42,0.2)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-slate-900">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10.5px] font-semibold text-blue-700 tabular-nums">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11.5px] font-medium text-blue-600 hover:text-blue-700"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[480px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Bell className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-[13px] font-medium text-slate-700">
                  Aucune notification
                </p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Vous êtes à jour
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const cfg = ICON_MAP[notif.type];
                const Icon = cfg.Icon;
                return (
                  <Link
                    key={notif.id}
                    href={notif.href}
                    onClick={() => {
                      markAsRead(notif.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "group relative flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors",
                      !notif.isRead && "bg-blue-50/30"
                    )}
                  >
                    {/* Unread indicator */}
                    {!notif.isRead && (
                      <span className="absolute top-1/2 left-1 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-blue-500" />
                    )}

                    {/* Icon */}
                    <div
                      className={cn(
                        "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-inset ring-current/10",
                        cfg.bg,
                        cfg.color
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.25} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-[12.5px] leading-snug",
                          !notif.isRead
                            ? "font-semibold text-slate-900"
                            : "text-slate-700"
                        )}
                      >
                        {notif.title}
                      </p>
                      <p className="text-[11.5px] text-slate-500 mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-1 mt-1.5 text-[10.5px] text-slate-400">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{notif.createdAt}</span>
                      </div>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        dismissNotification(notif.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-md inline-flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/40">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-[12px] font-medium text-blue-600 hover:text-blue-700"
            >
              Voir toutes les notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
