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
  Users as UsersIcon,
  CalendarDays,
  ShieldAlert,
  Database,
  Zap,
  FolderKanban,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { OrgLogo } from "@/components/organizations/org-logo";

/**
 * Shape retournée par /api/v1/notifications — aligné avec le schéma
 * Prisma Notification (pas un mock). `metadata` peut contenir n'importe
 * quoi ; on y cherche des clés bien connues comme `organizationName`
 * pour afficher le logo client à la place de l'icône générique.
 */
interface ApiNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Map d'icônes par type d'événement (fallback si pas de logo d'org). */
const ICON_MAP: Record<string, { Icon: typeof Bell; color: string; bg: string }> = {
  ticket_assigned: { Icon: Ticket, color: "text-blue-600", bg: "bg-blue-50" },
  ticket_unassigned_pool: { Icon: Ticket, color: "text-emerald-600", bg: "bg-emerald-50" },
  ticket_collaborator_added: { Icon: UsersIcon, color: "text-violet-600", bg: "bg-violet-50" },
  ticket_status_change: { Icon: Ticket, color: "text-amber-600", bg: "bg-amber-50" },
  ticket_comment: { Icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
  ticket_mention: { Icon: UserPlus, color: "text-pink-600", bg: "bg-pink-50" },
  ticket_resolved: { Icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  ticket_reminder: { Icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  ticket_approval_decided: { Icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-50" },
  sla_warning: { Icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  sla_breach: { Icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  project_assigned: { Icon: FolderKanban, color: "text-blue-600", bg: "bg-blue-50" },
  meeting_invite: { Icon: CalendarDays, color: "text-cyan-600", bg: "bg-cyan-50" },
  meeting_reminder: { Icon: CalendarDays, color: "text-cyan-600", bg: "bg-cyan-50" },
  renewal_reminder: { Icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  backup_failed: { Icon: Database, color: "text-red-600", bg: "bg-red-50" },
  monitoring_alert: { Icon: Zap, color: "text-red-600", bg: "bg-red-50" },
  weekly_digest: { Icon: Sparkles, color: "text-cyan-600", bg: "bg-cyan-50" },
  test: { Icon: Bell, color: "text-slate-600", bg: "bg-slate-100" },
};
const DEFAULT_ICON = { Icon: Bell, color: "text-slate-600", bg: "bg-slate-100" };

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

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } finally {
      setLoading(false);
    }
  }

  // Premier chargement + poll toutes les 60s pour garder la cloche à jour.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  // Refresh à l'ouverture pour toujours voir l'état courant.
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  // Ferme le dropdown au clic extérieur.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function markAllRead() {
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  async function markAsRead(id: string) {
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
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
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[calc(100vw-2rem)] sm:w-[420px] rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-10px_rgba(15,23,42,0.2)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-slate-900">Notifications</h3>
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

          <div className="max-h-[480px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="py-12 text-center text-[12.5px] text-slate-400">Chargement…</div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Bell className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-[13px] font-medium text-slate-700">Aucune notification</p>
                <p className="text-[12px] text-slate-500 mt-0.5">Vous êtes à jour</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const meta = notif.metadata ?? {};
                const orgName =
                  typeof (meta as Record<string, unknown>).organizationName === "string"
                    ? ((meta as Record<string, unknown>).organizationName as string)
                    : null;
                const cfg = ICON_MAP[notif.type] ?? DEFAULT_ICON;
                const Icon = cfg.Icon;
                const href = notif.link ?? "/dashboard";
                return (
                  <Link
                    key={notif.id}
                    href={href}
                    onClick={() => {
                      markAsRead(notif.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "group relative flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors",
                      !notif.isRead && "bg-blue-50/30",
                    )}
                  >
                    {!notif.isRead && (
                      <span className="absolute top-1/2 left-1 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-blue-500" />
                    )}

                    {/* Avatar/icône : logo d'organisation si dispo, sinon
                        icône typée selon la nature de l'événement. */}
                    {orgName ? (
                      <OrgLogo
                        name={orgName}
                        size={36}
                        rounded="md"
                        className="shrink-0 ring-1 ring-slate-200/60"
                      />
                    ) : (
                      <div
                        className={cn(
                          "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-inset ring-current/10",
                          cfg.bg,
                          cfg.color,
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2.25} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-[12.5px] leading-snug",
                          !notif.isRead ? "font-semibold text-slate-900" : "text-slate-700",
                        )}
                      >
                        {notif.title}
                      </p>
                      {notif.body && (
                        <p className="text-[11.5px] text-slate-500 mt-0.5 line-clamp-2">
                          {notif.body}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1.5 text-[10.5px] text-slate-400">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{timeAgo(notif.createdAt)}</span>
                        {orgName && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{orgName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        markAsRead(notif.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-md inline-flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 shrink-0"
                      title="Marquer comme lu"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Link>
                );
              })
            )}
          </div>

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

/**
 * ShieldAlert is kept in the import list for future badges even if it's
 * not currently used — suppress the linter hint.
 */
void ShieldAlert;
