// Portail client : renouvellements à venir visibles selon flag +
// visibilité CLIENT_* sur chaque objet.
//
// Masque automatiquement les montants si !canSeeLicenseCounts.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import type { ContentVisibility, PortalRole } from "@prisma/client";

function allowedVis(role: PortalRole): ContentVisibility[] {
  return role === "ADMIN" ? ["CLIENT_ADMIN", "CLIENT_ALL"] : ["CLIENT_ALL"];
}

export async function GET(req: Request) {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!portalUser.permissions.canSeeRenewals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const rangeDays = Math.max(1, Math.min(parseInt((searchParams.get("range") ?? "90d").replace("d", "")) || 90, 365));
  const now = new Date();
  const horizon = new Date(now.getTime() + rangeDays * 86400_000);
  const orgId = portalUser.organizationId;
  const vis = allowedVis(portalUser.portalRole);

  const [warranties, subscriptions, supportContracts] = await Promise.all([
    prisma.assetWarranty.findMany({
      where: { organizationId: orgId, endDate: { gte: now, lte: horizon }, visibility: { in: vis } },
      select: { id: true, vendor: true, startDate: true, endDate: true, coverageLevel: true, asset: { select: { name: true } } },
    }),
    prisma.assetSubscription.findMany({
      where: { organizationId: orgId, endDate: { gte: now, lte: horizon }, visibility: { in: vis } },
      select: {
        id: true, vendor: true, plan: true, startDate: true, endDate: true, autoRenew: true,
        billingCycle: true, amount: portalUser.permissions.canSeeLicenseCounts, currency: true,
        asset: { select: { name: true } },
      },
    }),
    prisma.assetSupportContract.findMany({
      where: { organizationId: orgId, endDate: { gte: now, lte: horizon }, visibility: { in: vis } },
      select: { id: true, vendor: true, tier: true, startDate: true, endDate: true, asset: { select: { name: true } } },
    }),
  ]);

  const items = [
    ...warranties.map((w) => ({
      id: `wa-${w.id}`, type: "warranty", title: `Garantie ${w.vendor ?? ""} — ${w.asset.name}`.trim(),
      endDate: w.endDate.toISOString(), subjectName: w.asset.name,
    })),
    ...subscriptions.map((s) => ({
      id: `su-${s.id}`, type: "subscription",
      title: `Abonnement ${s.vendor ?? s.plan ?? ""}`.trim(),
      endDate: s.endDate.toISOString(), subjectName: s.asset?.name ?? s.plan ?? null,
      amount: (s as unknown as { amount?: number | null }).amount ?? null,
      currency: (s as unknown as { currency?: string | null }).currency ?? null,
      autoRenew: s.autoRenew,
    })),
    ...supportContracts.map((c) => ({
      id: `sc-${c.id}`, type: "support_contract",
      title: `Support ${c.vendor ?? ""} (${c.tier})`.trim(),
      endDate: c.endDate.toISOString(), subjectName: c.asset.name,
    })),
  ];
  items.sort((a, b) => a.endDate.localeCompare(b.endDate));
  return NextResponse.json(items);
}
