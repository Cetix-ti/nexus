"use client";

import { useEffect } from "react";
import { initUserPrefsSync } from "@/lib/user-prefs/sync";

/**
 * Composant invisible qui démarre la synchronisation automatique des clés
 * localStorage (`nexus:*`, `analytics:*`) vers user.preferences au chargement
 * de l'app. À monter une seule fois dans le layout principal (app+portal).
 */
export function UserPrefsSyncBoot() {
  useEffect(() => {
    initUserPrefsSync();
  }, []);
  return null;
}
