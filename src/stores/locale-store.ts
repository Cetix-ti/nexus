"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Locale, t as translate } from "@/lib/i18n/translations";

// Fabrique une fonction `t` câblée sur une locale donnée. Le trick
// essentiel : en recréant cette fonction à chaque changement de locale,
// sa RÉFÉRENCE change, ce qui force tous les composants abonnés à
// `useLocaleStore((s) => s.t)` à se re-render. Sans ça, la référence
// restait la même et React ne re-render pas les pages → les titres
// restaient figés dans la locale initiale même après un switch.
function makeT(locale: Locale) {
  return (key: string, params?: Record<string, string | number>) =>
    translate(key, locale, params);
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Sync locale to server (user/contact preferences) */
  saveToServer: () => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: "fr",
      // `t` initial câblé sur "fr" — réhydraté à la locale persistée
      // via onRehydrateStorage dès que Zustand a chargé le localStorage.
      t: makeT("fr"),
      setLocale: (locale) => {
        // Nouvelle identité de `t` + mise à jour de `locale`. Les deux
        // slices changent → tous les abonnés se re-render correctement.
        set({ locale, t: makeT(locale) });
        get().saveToServer();
      },
      saveToServer: () => {
        const locale = get().locale;
        // Endpoint agent (/api/v1/me) — pour les contacts portail il
        // accepte le PATCH via le même handler (cf. auth portal).
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
      onRehydrateStorage: () => (state) => {
        // Après hydratation depuis localStorage, on resynchronise la
        // référence de `t` sur la locale restaurée. Sans ça, un user
        // qui recharge avec `locale: "en"` persisté se retrouve avec
        // `t` câblé sur "fr" (la valeur de la closure initiale) et
        // voit sa page en français.
        if (state) state.t = makeT(state.locale);
      },
    },
  ),
);
