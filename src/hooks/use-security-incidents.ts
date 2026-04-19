"use client";

// ============================================================================
// Hooks React Query pour le Centre de sécurité.
//
// Centralise les queryKeys + fetchers pour que :
//   - la liste (page principale) et la fiche détaillée partagent le même cache
//   - on puisse prefetcher les autres onglets en tâche de fond
//   - un fetch ciblé d'un seul incident retrouve les données déjà en cache
//     sans re-requêter (via initialData extrait de la liste)
// ============================================================================

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export interface SecurityAlert {
  id: string;
  receivedAt: string;
  severity: string | null;
  title: string;
  summary: string | null;
}

export interface SecurityIncident {
  id: string;
  source: string;
  kind: string;
  severity: string | null;
  organizationId: string | null;
  endpoint: string | null;
  userPrincipal: string | null;
  software: string | null;
  cveId: string | null;
  title: string;
  summary: string | null;
  status: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  ticketId: string | null;
  isLowPriority: boolean;
  metadata: Record<string, unknown> | null;
  organization: { id: string; name: string; clientCode: string | null } | null;
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  } | null;
  ticket: {
    id: string;
    number: number;
    subject: string;
    status: string;
  } | null;
  alerts: SecurityAlert[];
}

export interface IncidentsQueryParams {
  sources?: string[];
  kind?: string;
  priority?: "main" | "low" | "all";
}

export const securityKeys = {
  all: ["security-center"] as const,
  incidents: (p: IncidentsQueryParams) =>
    [
      "security-center",
      "incidents",
      (p.sources ?? []).slice().sort().join(","),
      p.kind ?? "",
      p.priority ?? "main",
    ] as const,
  incident: (id: string) => ["security-center", "incident", id] as const,
};

function buildIncidentsUrl(p: IncidentsQueryParams): string {
  const params = new URLSearchParams();
  if (p.sources && p.sources.length > 0) params.set("source", p.sources.join(","));
  if (p.kind) params.set("kind", p.kind);
  params.set("priority", p.priority ?? "main");
  return `/api/v1/security-center/incidents?${params.toString()}`;
}

export async function fetchIncidents(
  p: IncidentsQueryParams,
): Promise<SecurityIncident[]> {
  const res = await fetch(buildIncidentsUrl(p));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as SecurityIncident[];
}

export function useIncidentsQuery(p: IncidentsQueryParams) {
  return useQuery({
    queryKey: securityKeys.incidents(p),
    queryFn: () => fetchIncidents(p),
    // 60s staleTime globalement déjà configuré — la donnée affichée
    // immédiatement depuis le cache évite le flash "Chargement…" lors du
    // retour sur l'onglet.
  });
}

// ---------------------------------------------------------------------------
// Onglets de la page — définition partagée pour que le prefetcher idle sache
// quels buckets charger sans dupliquer la liste.
// ---------------------------------------------------------------------------

export const SECURITY_TAB_QUERIES: IncidentsQueryParams[] = [
  { sources: ["wazuh_email", "wazuh_api"], priority: "main" },
  { sources: ["wazuh_email", "wazuh_api"], priority: "low" },
  { sources: ["ad_email"], priority: "main" },
  { sources: ["ad_email"], priority: "low" },
  { kind: "persistence_tool", priority: "all" },
  { sources: ["bitdefender_api"], priority: "main" },
  { sources: ["bitdefender_api"], priority: "low" },
];

/**
 * Prefetch les autres onglets après le chargement initial. Appelé depuis la
 * page du Centre de sécurité — dès que la page est affichée, on warme les
 * caches pour que les switches d'onglets soient instantanés.
 *
 * Utilise `requestIdleCallback` pour ne pas entrer en compétition avec le
 * rendu principal, avec fallback `setTimeout(…, 200)` pour Safari.
 */
export function usePrefetchOtherTabs(active: IncidentsQueryParams) {
  const qc = useQueryClient();

  useEffect(() => {
    const activeKey = securityKeys.incidents(active).join("|");

    const run = () => {
      for (const q of SECURITY_TAB_QUERIES) {
        const key = securityKeys.incidents(q).join("|");
        if (key === activeKey) continue;
        qc.prefetchQuery({
          queryKey: securityKeys.incidents(q),
          queryFn: () => fetchIncidents(q),
          staleTime: 60 * 1000,
        });
      }
    };

    const ric: typeof window.requestIdleCallback | undefined =
      typeof window !== "undefined"
        ? (window as Window & {
            requestIdleCallback?: typeof window.requestIdleCallback;
          }).requestIdleCallback
        : undefined;

    if (ric) {
      const handle = ric(run, { timeout: 2000 });
      return () => {
        if (typeof window !== "undefined") {
          (window as Window & {
            cancelIdleCallback?: (h: number) => void;
          }).cancelIdleCallback?.(handle);
        }
      };
    }
    const t = setTimeout(run, 200);
    return () => clearTimeout(t);
  }, [qc, active]);
}

// ---------------------------------------------------------------------------
// Hook pour la fiche détaillée — utilise initialData si l'incident est déjà
// dans une liste cachée (navigation depuis le rollup).
// ---------------------------------------------------------------------------

export function useIncidentQuery(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: securityKeys.incident(id),
    queryFn: async () => {
      const res = await fetch(`/api/v1/security-center/incidents/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SecurityIncident;
    },
    initialData: () => {
      // On scanne toutes les listes d'incidents déjà en cache — si
      // l'incident s'y trouve, on l'affiche immédiatement sans refetch
      // bloquant (le refetch arrière-plan ramène les alertes complètes).
      const caches = qc.getQueriesData<SecurityIncident[]>({
        queryKey: ["security-center", "incidents"],
      });
      for (const [, list] of caches) {
        if (!list) continue;
        const found = list.find((i) => i.id === id);
        if (found) return found;
      }
      return undefined;
    },
    // On rafraîchit la fiche quand on vient du cache — initialData n'a
    // que 20 alertes max (la liste) alors que l'endpoint par id renvoie
    // l'historique complet.
    initialDataUpdatedAt: 0,
  });
}
