// ============================================================================
// SUPPORT TIERS — Mock data + helpers
// ============================================================================

import {
  DEFAULT_SUPPORT_TIERS,
  type SupportTier,
} from "./types";

/**
 * Mock support tiers per organization. In production these live in DB and
 * are managed from the org detail → "Facturation" tab.
 */
export const mockSupportTiers: SupportTier[] = [
  // Acme Corp — uses default 4-tier scale
  ...DEFAULT_SUPPORT_TIERS.map((t, i) => ({
    ...t,
    id: `tier_acme_${t.shortCode.toLowerCase()}`,
    organizationId: "org-2",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  })),
  // TechStart — startup, only 3 tiers with lower rates
  {
    id: "tier_ts_n1",
    organizationId: "org-3",
    name: "Niveau 1",
    shortCode: "N1",
    description: "Support de premier niveau",
    color: "#10B981",
    order: 1,
    hourlyRate: 75,
    isActive: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "tier_ts_n2",
    organizationId: "org-3",
    name: "Niveau 2",
    shortCode: "N2",
    description: "Support avancé",
    color: "#3B82F6",
    order: 2,
    hourlyRate: 105,
    isActive: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "tier_ts_n3",
    organizationId: "org-3",
    name: "Niveau 3",
    shortCode: "N3",
    description: "Expert",
    color: "#8B5CF6",
    order: 3,
    hourlyRate: 145,
    isActive: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  // Global Finance — premium 5-tier scale
  ...DEFAULT_SUPPORT_TIERS.map((t) => ({
    ...t,
    id: `tier_global_${t.shortCode.toLowerCase()}`,
    organizationId: "org-4",
    hourlyRate: t.hourlyRate * 1.4,    // 40% premium
    afterHoursRate: t.hourlyRate * 1.7,
    weekendRate: t.hourlyRate * 1.9,
    urgentRate: t.hourlyRate * 1.95,
    onsiteRate: t.hourlyRate * 1.55,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  })),
];

/** Get all tiers configured for an organization, sorted by order. */
export function getSupportTiersForOrg(orgId: string): SupportTier[] {
  return mockSupportTiers
    .filter((t) => t.organizationId === orgId && t.isActive)
    .sort((a, b) => a.order - b.order);
}

/** Get a single tier by short code (e.g. "N2") for an org. */
export function getSupportTierByCode(
  orgId: string,
  shortCode: string
): SupportTier | undefined {
  return mockSupportTiers.find(
    (t) =>
      t.organizationId === orgId &&
      t.shortCode.toUpperCase() === shortCode.toUpperCase()
  );
}

/** Resolve the applicable hourly rate for a tier given context. */
export function resolveTierRate(
  tier: SupportTier,
  ctx: {
    isAfterHours?: boolean;
    isWeekend?: boolean;
    isUrgent?: boolean;
    isOnsite?: boolean;
    isTravel?: boolean;
  }
): number {
  if (ctx.isTravel && tier.travelRate) return tier.travelRate;
  if (ctx.isUrgent && tier.urgentRate) return tier.urgentRate;
  if (ctx.isWeekend && tier.weekendRate) return tier.weekendRate;
  if (ctx.isAfterHours && tier.afterHoursRate) return tier.afterHoursRate;
  if (ctx.isOnsite && tier.onsiteRate) return tier.onsiteRate;
  return tier.hourlyRate;
}
