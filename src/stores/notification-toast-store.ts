import { create } from "zustand";

export interface NotificationToast {
  id: string;
  title: string;
  body?: string;
  link?: string;
  type?: string;
  createdAt: number;
}

interface NotificationToastState {
  toasts: NotificationToast[];
  push: (toast: Omit<NotificationToast, "id" | "createdAt">) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

let counter = 0;

export const useNotificationToasts = create<NotificationToastState>(
  (set) => ({
    toasts: [],
    push: (toast) => {
      const id = `toast-${++counter}-${Date.now()}`;
      set((s) => ({
        toasts: [...s.toasts, { ...toast, id, createdAt: Date.now() }].slice(-5),
      }));
      // Auto-dismiss after 8 seconds
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 8000);
    },
    dismiss: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    dismissAll: () => set({ toasts: [] }),
  }),
);
