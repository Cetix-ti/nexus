// Client-safe portal helpers — no server-only imports here.
// For server-side session reads, see ./current-user.server.ts
import { PORTAL_ORGS } from "@/lib/portal/org-resolver";
import { mockClientPortalPermissions } from "@/lib/projects/mock-data";
import {
  DEFAULT_VIEWER_PERMISSIONS,
  type ClientPortalPermissions,
} from "@/lib/projects/types";

const FALLBACK_ORG = PORTAL_ORGS[0];

export const CURRENT_PORTAL_USER = {
  contactId: "ct_001",
  organizationId: FALLBACK_ORG.id,
  organizationName: FALLBACK_ORG.name,
  organizationSlug: FALLBACK_ORG.slug,
  name: "Robert Martin",
  email: "robert.martin@acme.com",
  permissions:
    mockClientPortalPermissions.find(
      (p) => p.organizationId === FALLBACK_ORG.id
    ) ||
    ({
      ...DEFAULT_VIEWER_PERMISSIONS,
      contactId: "ct_001",
      organizationId: FALLBACK_ORG.id,
    } as ClientPortalPermissions),
};

export function getCurrentPortalOrg(): string {
  return CURRENT_PORTAL_USER.organizationId;
}

export function hasPortalPermission(
  key: keyof typeof CURRENT_PORTAL_USER.permissions
): boolean {
  const value = CURRENT_PORTAL_USER.permissions[key];
  return typeof value === "boolean" ? value : false;
}
