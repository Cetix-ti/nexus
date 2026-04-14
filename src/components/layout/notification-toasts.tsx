"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  X,
  Ticket,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useNotificationToasts,
  type NotificationToast,
} from "@/stores/notification-toast-store";

const ICON_MAP: Record<
  string,
  { Icon: typeof Bell; color: string; bg: string }
> = {
  reminder: { Icon: Clock, color: "text-violet-600", bg: "bg-violet-50" },
  ticket_assigned: { Icon: Ticket, color: "text-blue-600", bg: "bg-blue-50" },
  ticket_updated: { Icon: Ticket, color: "text-violet-600", bg: "bg-violet-50" },
  sla_warning: { Icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  new_comment: { Icon: MessageSquare, color: "text-emerald-600", bg: "bg-emerald-50" },
  ticket_resolved: { Icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  test: { Icon: Bell, color: "text-blue-600", bg: "bg-blue-50" },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: NotificationToast;
  onDismiss: () => void;
}) {
  const cfg = ICON_MAP[toast.type ?? ""] ?? ICON_MAP.test;
  const Icon = cfg.Icon;

  const content = (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "shrink-0 h-10 w-10 rounded-xl flex items-center justify-center",
          cfg.bg,
          cfg.color,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-slate-900 leading-snug">
          {toast.title}
        </p>
        {toast.body && (
          <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-2">
            {toast.body}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        className="shrink-0 h-7 w-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  if (toast.link) {
    return (
      <Link href={toast.link} onClick={onDismiss}>
        {content}
      </Link>
    );
  }
  return content;
}

/**
 * Renders toast notifications in the bottom-right corner.
 * Also polls for new in-app notifications and pushes them as toasts.
 */
export function NotificationToasts() {
  const { toasts, push, dismiss } = useNotificationToasts();
  const lastCheckRef = useRef<string | null>(null);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/v1/notifications?unread=true");
        if (!res.ok) return;
        const data = await res.json();
        const items = data.notifications ?? [];
        if (items.length === 0) return;

        // Only show toasts for notifications newer than our last check
        const newest = items[0];
        if (!newest) return;

        if (lastCheckRef.current && newest.id === lastCheckRef.current) return;

        // Show toasts for new notifications (up to 3)
        const toShow = lastCheckRef.current
          ? items.filter(
              (n: any) =>
                new Date(n.createdAt).getTime() >
                (lastCheckRef.current
                  ? new Date(
                      items.find((x: any) => x.id === lastCheckRef.current)
                        ?.createdAt ?? 0,
                    ).getTime()
                  : 0),
            )
          : [];

        // Only push toasts after the first poll (avoid showing old ones on page load)
        if (lastCheckRef.current) {
          for (const n of toShow.slice(0, 3)) {
            push({
              title: n.title,
              body: n.body ?? undefined,
              link: n.link ?? undefined,
              type: n.type ?? undefined,
            });
          }
        }

        lastCheckRef.current = newest.id;
      } catch {
        // Ignore poll errors
      }
    }

    poll();
    const interval = setInterval(() => {
      if (active) poll();
    }, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [push]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col-reverse gap-2.5 w-[380px] max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{ animation: "toast-slide-in 0.3s ease-out" }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-lg shadow-slate-200/50"
        >
          <ToastCard toast={toast} onDismiss={() => dismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}
