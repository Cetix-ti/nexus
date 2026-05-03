"use client";

import { useEffect, useState } from "react";

// ============================================================================
// useAllOrganizations — liste exhaustive des orgs actives pour les
// dropdowns de filtre. Avant, beaucoup d'écrans dérivaient leur liste
// d'orgs à partir des données affichées (tickets, time entries…) → la
// dropdown ne montrait que les orgs ayant DÉJÀ de l'activité sur la
// période/scope courant. Conséquence : impossible de filtrer une org
// nouvellement créée tant qu'elle n'avait pas de données.
//
// Ce hook fetch /api/v1/organizations une fois par montage et expose
// la liste triée alphabétiquement, filtre sur isActive=true.
// Cache simple en module pour éviter de refetch entre composants —
// les données ne bougent pas pendant l'utilisation typique.
// ============================================================================

export interface OrgOption {
  id: string;
  name: string;
}

let _cache: OrgOption[] | null = null;
let _inflight: Promise<OrgOption[]> | null = null;

async function fetchOrgs(): Promise<OrgOption[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = fetch("/api/v1/organizations")
    .then((r) => (r.ok ? r.json() : []))
    .then((list: Array<{ id: string; name: string; isActive?: boolean }>) => {
      if (!Array.isArray(list)) return [];
      const out = list
        .filter((o) => o.isActive !== false)
        .map((o) => ({ id: o.id, name: o.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      _cache = out;
      _inflight = null;
      return out;
    })
    .catch(() => {
      _inflight = null;
      return [];
    });
  return _inflight;
}

export function useAllOrganizations(): OrgOption[] {
  const [orgs, setOrgs] = useState<OrgOption[]>(_cache ?? []);
  useEffect(() => {
    if (_cache) {
      setOrgs(_cache);
      return;
    }
    let alive = true;
    fetchOrgs().then((list) => {
      if (alive) setOrgs(list);
    });
    return () => { alive = false; };
  }, []);
  return orgs;
}

/** Force une nouvelle fetch — à appeler après création/modification d'org. */
export function invalidateOrganizationsCache() {
  _cache = null;
  _inflight = null;
}
