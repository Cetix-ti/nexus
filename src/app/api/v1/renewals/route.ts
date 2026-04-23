// Feed unifié des renouvellements : union de Warranty / Subscription /
// AssetSupportContract / Contract / SoftwareLicense dans une fenêtre (?range=90d).
//
// Format commun : { id, type, title, endDate, orgId, orgName?, subjectName?, url, color }

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

type RenewalType = "warranty" | "subscription" | "support_contract" | "contract" | "software_license";

interface RenewalItem {
  id: string;
  type: RenewalType;
  title: string;
  endDate: string;
  orgId: string | null;
  orgName: string | null;
  subjectName: string | null;
  url: string;
  color: string;
}

const COLORS: Record<RenewalType, string> = {
  warranty:         "#F59E0B",
  subscription:     "#8B5CF6",
  support_contract: "#3B82F6",
  contract:         "#10B981",
  software_license: "#06B6D4",
};

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const rangeParam = searchParams.get("range") ?? "90d";
  const orgId = searchParams.get("orgId");
  const rangeDays = Math.max(1, Math.min(parseInt(rangeParam.replace("d", "")) || 90, 730));
  const now = new Date();
  const horizon = new Date(now.getTime() + rangeDays * 86400_000);

  const baseWhere = { endDate: { gte: now, lte: horizon }, ...(orgId ? { organizationId: orgId } : {}) };

  const [warranties, subscriptions, supportContracts, contracts, licenses] = await Promise.all([
    prisma.assetWarranty.findMany({
      where: baseWhere,
      include: { asset: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } } },
    }),
    prisma.assetSubscription.findMany({
      where: baseWhere,
      include: { asset: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } } },
    }),
    prisma.assetSupportContract.findMany({
      where: baseWhere,
      include: { asset: { select: { id: true, name: true } }, organization: { select: { id: true, name: true } } },
    }),
    prisma.contract.findMany({
      where: {
        endDate: { gte: now, lte: horizon },
        ...(orgId ? { organizationId: orgId } : {}),
      },
      include: { organization: { select: { id: true, name: true } } },
    }),
    prisma.softwareLicense.findMany({
      where: {
        endDate: { gte: now, lte: horizon },
        ...(orgId ? { organizationId: orgId } : {}),
      },
      include: { organization: { select: { id: true, name: true } }, instance: { select: { id: true, name: true } } },
    }),
  ]);

  const items: RenewalItem[] = [];
  for (const w of warranties) {
    items.push({
      id: w.id, type: "warranty",
      title: `Garantie ${w.vendor ?? ""} — ${w.asset.name}`.trim(),
      endDate: w.endDate.toISOString(),
      orgId: w.organization.id, orgName: w.organization.name,
      subjectName: w.asset.name,
      url: `/assets/${w.asset.id}`,
      color: COLORS.warranty,
    });
  }
  for (const s of subscriptions) {
    items.push({
      id: s.id, type: "subscription",
      title: `Abonnement ${s.vendor ?? s.plan ?? ""}`.trim(),
      endDate: s.endDate.toISOString(),
      orgId: s.organization.id, orgName: s.organization.name,
      subjectName: s.asset?.name ?? s.plan ?? null,
      url: s.asset ? `/assets/${s.asset.id}` : "/assets",
      color: COLORS.subscription,
    });
  }
  for (const c of supportContracts) {
    items.push({
      id: c.id, type: "support_contract",
      title: `Contrat support ${c.vendor ?? ""} (${c.tier})`.trim(),
      endDate: c.endDate.toISOString(),
      orgId: c.organization.id, orgName: c.organization.name,
      subjectName: c.asset.name,
      url: `/assets/${c.asset.id}`,
      color: COLORS.support_contract,
    });
  }
  for (const c of contracts) {
    if (!c.endDate) continue;
    items.push({
      id: c.id, type: "contract",
      title: c.name,
      endDate: c.endDate.toISOString(),
      orgId: c.organization.id, orgName: c.organization.name,
      subjectName: null,
      url: `/organisations/${c.organization.id}?tab=contracts`,
      color: COLORS.contract,
    });
  }
  for (const l of licenses) {
    if (!l.endDate) continue;
    items.push({
      id: l.id, type: "software_license",
      title: `Licence ${l.instance?.name ?? ""}`.trim() || "Licence logiciel",
      endDate: l.endDate.toISOString(),
      orgId: l.organization?.id ?? null, orgName: l.organization?.name ?? null,
      subjectName: l.instance?.name ?? null,
      url: l.instance ? `/software/${l.instance.id}` : "/software",
      color: COLORS.software_license,
    });
  }

  items.sort((a, b) => a.endDate.localeCompare(b.endDate));
  return NextResponse.json(items);
}
