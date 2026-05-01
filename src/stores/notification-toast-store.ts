import { create } from "zustand";

export interface NotificationToast {
  id: string;
  title: string;
  body?: string;
  link?: string;
  type?: string;
  /** Nom d'organisation — si présent, le toast affiche l'OrgLogo à la
   *  place de l'icône typée. Vient de notification.metadata.organizationName
   *  côté backend. */
  organizationName?: string | null;
  createdAt: number;
}

interface NotificationToastState {
  toasts: NotificationToast[];
  /** Durée d'auto-dismiss en ms. 0 = permanent (l'agent ferme manuellement).
   *  Lue depuis User.preferences.notifications.inAppDuration au mount du
   *  composant NotificationToasts via setAutoDismissMs. */
  autoDismissMs: number;
  push: (toast: Omit<NotificationToast, "id" | "createdAt">) => void;
  setAutoDismissMs: (ms: number) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

let counter = 0;

export const useNotificationToasts = create<NotificationToastState>(
  (set, get) => ({
    toasts: [],
    autoDismissMs: 8000,
    push: (toast) => {
      const id = `toast-${++counter}-${Date.now()}`;
      set((s) => ({
        toasts: [...s.toasts, { ...toast, id, createdAt: Date.now() }].slice(-5),
      }));
      // Auto-dismiss configurable. Si autoDismissMs = 0 → toast permanent
      // (l'agent doit cliquer × pour fermer).
      const ms = get().autoDismissMs;
      if (ms > 0) {
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, ms);
      }
    },
    setAutoDismissMs: (ms) => set({ autoDismissMs: Math.max(0, Math.round(ms)) }),
    dismiss: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    dismissAll: () => set({ toasts: [] }),
  }),
);
