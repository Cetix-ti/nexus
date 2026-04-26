"use client";

// ============================================================================
// OrgScopeBanner — Bandeau permanent affiché aux techniciens dont l'accès
// est limité à un sous-ensemble d'organisations clientes (Phase 9F).
//
// Caché pour :
//   - Les SUPER_ADMIN (jamais scopés)
//   - Les users sans aucune row UserOrganizationScope (accès complet)
//   - Les CLIENT_* (utilisent le portail, pas concernés)
//
// L'objectif : rendre visible la limitation pour éviter qu'un tech
// pense que des données sont "manquantes" alors qu'elles sont juste
// hors de son périmètre.
// ============================================================================

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

interface ScopeRow {
  id: string;
  organizationId: string;
  organizationName: string;
}

export function OrgScopeBanner() {
  const [scopes, setScopes] = useState<ScopeRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (cancelled) return;
        if (!me?.id) return;
        if (me.role === "SUPER_ADMIN") return;
        if (typeof me.role === "string" && me.role.startsWith("CLIENT_")) return;
        return fetch(`/api/v1/users/${me.id}/org-scopes`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (cancelled) return;
            const rows = Array.isArray(data?.data) ? data.data : [];
            setScopes(rows);
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Aucun scope chargé OU accès complet → pas de bandeau.
  if (!scopes || scopes.length === 0) return null;

  const orgList = scopes.slice(0, 3).map((s) => s.organizationName).join(", ");
  const more = scopes.length > 3 ? ` (+${scopes.length - 3})` : "";

  return (
    <div className="border-b border-amber-200/80 bg-amber-50/70 px-4 lg:px-8 py-1.5">
      <div className="max-w-[1800px] mx-auto flex items-center gap-2 text-[12px] text-amber-900">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">
          {scopes.length === 1 ? "Vue limitée à" : "Vue limitée aux organisations :"}
        </span>
        <span className="truncate">
          {orgList}
          {more}
        </span>
      </div>
    </div>
  );
}
