// Server-only helpers — never import from a client component.
import { auth } from "@/lib/auth";
import {
  PORTAL_ORGS,
  buildDefaultPermissions,
  type PortalOrg,
} from "@/lib/portal/org-resolver";
import { mockClientPortalPermissions } from "@/lib/projects/mock-data";
import {
  type ClientPortalPermissions,
} from "@/lib/projects/types";

export interface PortalUserContext {
  contactId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  name: string;
  email: string;
  permissions: Omit<ClientPortalPermissions, "contactId" | "organizationId"> & {
    contactId: string;
    organizationId: string;
  };
  org: PortalOrg;
}

/**
 * Server-side: read the current portal user from the session.
 * Returns null if not signed in.
 */
export async function getCurrentPortalUser(): Promise<PortalUserContext | null> {
  const session = await auth();
  if (!session?.user) return null;

  const u = session.user as any;
  const orgId = u.organizationId as string | undefined;
  if (!orgId) return null;

  const org = PORTAL_ORGS.find((o) => o.id === orgId);
  if (!org) return null;

  const existing = mockClientPortalPermissions.find(
    (p) => p.organizationId === orgId
  );
  const perms =
    existing ||
    ({
      ...buildDefaultPermissions(org),
      contactId: `ct_${u.id}`,
      organizationId: orgId,
    } as ClientPortalPermissions);

  return {
    contactId: existing?.contactId || `ct_${u.id}`,
    organizationId: orgId,
    organizationName: u.organizationName || org.name,
    organizationSlug: u.organizationSlug || org.slug,
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Utilisateur",
    email: u.email,
    permissions: {
      ...perms,
      contactId: existing?.contactId || `ct_${u.id}`,
      organizationId: orgId,
    },
    org,
  };
}
