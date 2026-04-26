"use client";

// ============================================================================
// PermissionGate — wrapper standard pour conditionner l'affichage d'une
// section UI à un rôle minimum et/ou une capability (Phase 10G).
//
// Avant : chaque composant fetchait /api/v1/me et hardcodait son test
// (role === "MSP_ADMIN" || role === "SUPER_ADMIN"). Inconsistances entre
// composants, code dupliqué.
//
// Maintenant : un seul appel /api/v1/me par usage, logique unifiée.
//
// Exemples :
//
//   <PermissionGate minRole="MSP_ADMIN">
//     <Button>Modifier la facturation</Button>
//   </PermissionGate>
//
//   <PermissionGate capability="finances" fallback={<NoAccessNote />}>
//     <FinancialKpis />
//   </PermissionGate>
//
//   <PermissionGate minRole="SUPERVISOR" capability="approvals">
//     <ApprovalActions />
//   </PermissionGate>
//
// Pendant le chargement (premier mount), `loadingFallback` (ou le fallback)
// est affiché. Pour éviter un flicker "disponible → caché", défaut : null
// (rien affiché tant que le rôle n'est pas connu).
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { ROLES_HIERARCHY, type UserRole } from "@/lib/constants";

interface MeResponse {
  id?: string;
  role?: UserRole;
  capabilities?: string[];
  effectiveCapabilities?: string[];
  rolePermissions?: string[];
}

let cachedMe: MeResponse | null | undefined; // undefined = pas chargé, null = anonyme

/** Fetch /api/v1/me avec un cache module-scope. Évite N appels /me par
 *  rendu de page (typique : 5-10 PermissionGate sur la même page). */
async function loadMe(): Promise<MeResponse | null> {
  if (cachedMe !== undefined) return cachedMe;
  try {
    const r = await fetch("/api/v1/me");
    if (!r.ok) {
      cachedMe = null;
      return null;
    }
    cachedMe = (await r.json()) as MeResponse;
    return cachedMe;
  } catch {
    cachedMe = null;
    return null;
  }
}

interface MeetsProps {
  minRole?: UserRole;
  capability?: string;
  notRole?: UserRole | UserRole[];
}

function meets(me: MeResponse | null, props: MeetsProps): boolean {
  if (!me?.role) return false;
  if (props.minRole) {
    const required = ROLES_HIERARCHY[props.minRole];
    const actual = ROLES_HIERARCHY[me.role];
    if (actual === undefined || actual > required) return false;
  }
  if (props.capability) {
    const caps = new Set([
      ...(me.capabilities ?? []),
      ...(me.effectiveCapabilities ?? []),
      ...(me.rolePermissions ?? []),
    ]);
    if (!caps.has(props.capability)) return false;
  }
  if (props.notRole) {
    const denied = Array.isArray(props.notRole) ? props.notRole : [props.notRole];
    if (denied.includes(me.role)) return false;
  }
  return true;
}

interface GateProps extends MeetsProps {
  /** Affiché quand l'utilisateur n'a pas accès. Défaut : rien. */
  fallback?: ReactNode;
  /** Affiché pendant le premier load (avant que /me revienne). Défaut :
   *  rien (évite un flicker "section visible puis cachée"). */
  loadingFallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate(props: GateProps) {
  const [me, setMe] = useState<MeResponse | null | undefined>(cachedMe);

  useEffect(() => {
    if (cachedMe !== undefined) {
      setMe(cachedMe);
      return;
    }
    let cancelled = false;
    loadMe().then((m) => {
      if (!cancelled) setMe(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (me === undefined) {
    return <>{props.loadingFallback ?? null}</>;
  }
  if (!meets(me, props)) {
    return <>{props.fallback ?? null}</>;
  }
  return <>{props.children}</>;
}

/** Hook équivalent — pour les cas où on a besoin du booléen avant le
 *  rendu (ex. logique conditionnelle dans un useMemo). */
export function usePermission(props: MeetsProps): {
  loading: boolean;
  allowed: boolean;
} {
  const [me, setMe] = useState<MeResponse | null | undefined>(cachedMe);
  useEffect(() => {
    if (cachedMe !== undefined) {
      setMe(cachedMe);
      return;
    }
    let cancelled = false;
    loadMe().then((m) => {
      if (!cancelled) setMe(m);
    });
    return () => { cancelled = true; };
  }, []);
  if (me === undefined) return { loading: true, allowed: false };
  return { loading: false, allowed: meets(me, props) };
}
