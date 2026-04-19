"use client";

// ============================================================================
// IdleSecurityPrefetcher
//
// Monté dans le layout de l'app. Pour les techniciens+ (qui ont accès au
// centre de sécurité), warme le cache de l'onglet Wazuh en arrière-plan
// après une période d'inactivité. Objectif : quand l'utilisateur ouvre
// enfin le centre de sécurité, la première vue est instantanée.
//
// Garde-fous pour ne JAMAIS pénaliser l'UX active :
//   - N'attend pas que l'utilisateur quitte la page — il suffit que
//     l'onglet soit visible mais immobile (pas de mouvement/input) 30s
//   - Skip si onglet caché (document.hidden)
//   - Skip si connexion "save-data" (data-saver activé côté utilisateur)
//   - Skip si connexion effective ≤ 2g
//   - Skip si rôle CLIENT_* (l'API refuserait de toute façon)
//   - Un seul prefetch par fenêtre de 5 min — pas de polling
//   - Passe par requestIdleCallback → zéro concurrence avec le rendu
//
// Le prefetch ne s'exécute qu'une fois par cycle d'inactivité ; si
// l'utilisateur reste actif, rien ne se passe.
// ============================================================================

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  SECURITY_TAB_QUERIES,
  fetchIncidents,
  securityKeys,
} from "@/hooks/use-security-incidents";

const IDLE_DELAY_MS = 30_000; // 30s d'inactivité avant le prefetch
const MIN_INTERVAL_MS = 5 * 60_000; // max une tentative / 5 min

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

function shouldSkipForNetwork(): boolean {
  if (typeof navigator === "undefined") return true;
  const c = (navigator as Navigator & { connection?: NetworkInformation })
    .connection;
  if (!c) return false;
  if (c.saveData) return true;
  if (c.effectiveType === "slow-2g" || c.effectiveType === "2g") return true;
  return false;
}

export function IdleSecurityPrefetcher() {
  const { data: session, status } = useSession();
  const qc = useQueryClient();
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    const role = (session?.user as { role?: string } | undefined)?.role ?? "";
    // Seuls les utilisateurs internes ont accès au centre de sécurité.
    if (!role || role.startsWith("CLIENT_")) return;
    if (role === "READ_ONLY") return;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const cancelTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const scheduleIdleRun = () => {
      cancelTimer();
      idleTimer = setTimeout(runPrefetch, IDLE_DELAY_MS);
    };

    const runPrefetch = () => {
      idleTimer = null;
      if (document.hidden) return;
      if (shouldSkipForNetwork()) return;
      const now = Date.now();
      if (now - lastRunRef.current < MIN_INTERVAL_MS) return;

      // Prefetch uniquement si le cache est absent ou stale. React Query
      // skippera naturellement les fetchs où la donnée est fraîche (via
      // staleTime), mais on évite même l'appel inutile côté app.
      const ric: typeof window.requestIdleCallback | undefined = (
        window as Window & {
          requestIdleCallback?: typeof window.requestIdleCallback;
        }
      ).requestIdleCallback;

      const doPrefetch = () => {
        lastRunRef.current = Date.now();
        // Onglet Wazuh (défaut) — les deux buckets en parallèle.
        const priorityQueries = SECURITY_TAB_QUERIES.filter(
          (q) =>
            q.sources?.includes("wazuh_email") || q.sources?.includes("wazuh_api"),
        );
        for (const q of priorityQueries) {
          qc.prefetchQuery({
            queryKey: securityKeys.incidents(q),
            queryFn: () => fetchIncidents(q),
            staleTime: 60 * 1000,
          });
        }
      };

      if (ric) ric(doPrefetch, { timeout: 5000 });
      else setTimeout(doPrefetch, 0);
    };

    const onActivity = () => {
      scheduleIdleRun();
    };
    const onVisibility = () => {
      if (document.hidden) cancelTimer();
      else scheduleIdleRun();
    };

    const events: (keyof DocumentEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    for (const ev of events) {
      document.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    scheduleIdleRun();

    return () => {
      cancelTimer();
      for (const ev of events) {
        document.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session, status, qc]);

  return null;
}
