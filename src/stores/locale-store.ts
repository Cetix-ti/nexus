"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Locale, t as translate } from "@/lib/i18n/translations";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  /** Sync locale to server (user/contact preferences) */
  saveToServer: () => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: "fr",
      setLocale: (locale) => {
        set({ locale });
        // Save to server
        get().saveToServer();
      },
      t: (key) => translate(key, get().locale),
      saveToServer: () => {
        const locale = get().locale;
        // Try agent endpoint first, fall back to portal
        fetch("/api/v1/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: { locale } }),
        }).catch(() => {});
      },
    }),
    {
      name: "nexus-locale",
      partialize: (state) => ({ locale: state.locale }),
    },
  ),
);
