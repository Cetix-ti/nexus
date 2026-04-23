// Assemble le payload complet du dossier 360 pour une organisation.

import prisma from "@/lib/prisma";
import { computeMaturity } from "@/lib/maturity/checks";
import type { ChangeCategory, ChangeImpact, PolicySubcategory } from "@prisma/client";

export interface DossierPayload {
  generatedAt: string;
  org: { id: string; name: string; slug: string; domain: string | null; clientCode: string | null };
  capabilities: Record<string, boolean> | null;
  sites: Array<{ name: string; address: string | null; city: string | null; isMain: boolean }>;
  contactsCount: number;
  mainContacts: Array<{ firstName: string; lastName: string; email: string; jobTitle: string | null }>;
  maturity: { score: number; passedCount: number; applicableCount: number; failedTitles: string[] };
  particularities: Array<{ title: string; summary: string | null; categoryName: string | null; visibility: string }>;
  software: Array<{ name: string; vendor: string | null; version: string | null; categoryName: string | null }>;
  policies: Array<{ title: string; subcategory: PolicySubcategory; summary: string | null }>;
  changes12m: Array<{ title: string; summary: string | null; category: ChangeCategory; impact: ChangeImpact; changeDate: string }>;
  renewals180d: Array<{ type: "warranty" | "subscription" | "support_contract" | "contract" | "license"; title: string; endDate: string }>;
  activeContracts: Array<{ name: string; type: string; startDate: string; endDate: string | null }>;
}

const CAPABILITY_LABELS: Record<string, string> = {
  hasAD: "Active Directory local", hasAzureAD: "Azure AD (legacy)", hasEntra: "Microsoft Entra",
  hasM365: "Microsoft 365", hasExchangeOnPrem: "Exchange on-prem", hasVPN: "VPN",
  hasRDS: "Bureau à distance", hasHyperV: "Hyper-V", hasVMware: "VMware",
  hasOnPremServers: "Serveurs on-prem", hasBackupsVeeam: "Sauvegardes Veeam",
  hasSOC: "SOC / Cybersécurité", hasMDM: "MDM", hasKeePass: "KeePass", allowEnglishUI: "Interface anglaise autorisée",
};

export async function buildDossierPayload(orgId: string): Promise<DossierPayload | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true, name: true, slug: true, domain: true, clientCode: true,
      sites: { select: { name: true, address: true, city: true, isMain: true }, orderBy: { isMain: "desc" } },
      capabilities: true,
      _count: { select: { contacts: true } },
    },
  });
  if (!org) return null;

  const mainContacts = await prisma.contact.findMany({
    where: { organizationId: orgId, isActive: true, OR: [{ isVIP: true }, { jobTitle: { contains: "IT", mode: "insensitive" } }] },
    select: { firstName: true, lastName: true, email: true, jobTitle: true },
    take: 6,
  });

  const maturityReport = await computeMaturity(orgId);
  const maturity = maturityReport ? {
    score: maturityReport.score,
    passedCount: maturityReport.passedCount,
    applicableCount: maturityReport.applicableCount,
    failedTitles: maturityReport.checks.filter((c) => c.applicable && !c.passed).map((c) => c.title),
  } : { score: 0, passedCount: 0, applicableCount: 0, failedTitles: [] };

  const [particularities, software, policies, changes, warranties, subscriptions, supportContracts, contracts, licenses] = await Promise.all([
    prisma.particularity.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: { title: true, summary: true, visibility: true, category: { select: { name: true } } },
      orderBy: { updatedAt: "desc" }, take: 30,
    }),
    prisma.softwareInstance.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: { name: true, vendor: true, version: true, category: { select: { name: true } } },
      orderBy: { name: "asc" }, take: 40,
    }),
    prisma.policyDocument.findMany({
      where: {
        organizationId: orgId, status: "ACTIVE",
        subcategory: { notIn: ["SCRIPT", "PRIVILEGED_ACCESS", "KEEPASS"] },
      },
      select: { title: true, subcategory: true, summary: true },
      orderBy: { updatedAt: "desc" }, take: 20,
    }),
    prisma.change.findMany({
      where: {
        organizationId: orgId, mergedIntoId: null,
        status: { in: ["APPROVED", "PUBLISHED"] },
        changeDate: { gte: new Date(Date.now() - 365 * 86400_000) },
      },
      select: { title: true, summary: true, category: true, impact: true, changeDate: true },
      orderBy: { changeDate: "desc" }, take: 30,
    }),
    prisma.assetWarranty.findMany({
      where: { organizationId: orgId, endDate: { gte: new Date(), lte: new Date(Date.now() + 180 * 86400_000) } },
      select: { vendor: true, endDate: true, asset: { select: { name: true } } },
    }),
    prisma.assetSubscription.findMany({
      where: { organizationId: orgId, endDate: { gte: new Date(), lte: new Date(Date.now() + 180 * 86400_000) } },
      select: { vendor: true, plan: true, endDate: true, asset: { select: { name: true } } },
    }),
    prisma.assetSupportContract.findMany({
      where: { organizationId: orgId, endDate: { gte: new Date(), lte: new Date(Date.now() + 180 * 86400_000) } },
      select: { vendor: true, tier: true, endDate: true, asset: { select: { name: true } } },
    }),
    prisma.contract.findMany({
      where: { organizationId: orgId, status: "ACTIVE", OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      select: { name: true, type: true, startDate: true, endDate: true },
      orderBy: { endDate: "asc" }, take: 20,
    }),
    prisma.softwareLicense.findMany({
      where: { organizationId: orgId, endDate: { gte: new Date(), lte: new Date(Date.now() + 180 * 86400_000) } },
      select: { endDate: true, instance: { select: { name: true } } },
    }),
  ]);

  const caps = org.capabilities
    ? Object.fromEntries(Object.entries(CAPABILITY_LABELS).map(([k]) => [k, Boolean((org.capabilities as unknown as Record<string, unknown>)[k])]))
    : null;

  const renewals180d: DossierPayload["renewals180d"] = [
    ...warranties.map((w) => ({ type: "warranty" as const, title: `Garantie ${w.vendor ?? ""} — ${w.asset.name}`.trim(), endDate: w.endDate.toISOString() })),
    ...subscriptions.map((s) => ({ type: "subscription" as const, title: `Abonnement ${s.vendor ?? s.plan ?? ""}`.trim(), endDate: s.endDate.toISOString() })),
    ...supportContracts.map((c) => ({ type: "support_contract" as const, title: `Support ${c.vendor ?? ""} (${c.tier}) — ${c.asset.name}`.trim(), endDate: c.endDate.toISOString() })),
    ...licenses.filter((l) => l.endDate).map((l) => ({ type: "license" as const, title: `Licence ${l.instance?.name ?? ""}`.trim() || "Licence", endDate: l.endDate!.toISOString() })),
  ];
  renewals180d.sort((a, b) => a.endDate.localeCompare(b.endDate));

  return {
    generatedAt: new Date().toISOString(),
    org: { id: org.id, name: org.name, slug: org.slug, domain: org.domain, clientCode: org.clientCode },
    capabilities: caps,
    sites: org.sites,
    contactsCount: org._count.contacts,
    mainContacts,
    maturity,
    particularities: particularities.map((p) => ({ title: p.title, summary: p.summary, categoryName: p.category?.name ?? null, visibility: p.visibility })),
    software: software.map((s) => ({ name: s.name, vendor: s.vendor, version: s.version, categoryName: s.category?.name ?? null })),
    policies: policies.map((p) => ({ title: p.title, subcategory: p.subcategory, summary: p.summary })),
    changes12m: changes.map((c) => ({ title: c.title, summary: c.summary, category: c.category, impact: c.impact, changeDate: c.changeDate.toISOString() })),
    renewals180d,
    activeContracts: contracts.map((c) => ({ name: c.name, type: c.type, startDate: c.startDate.toISOString(), endDate: c.endDate?.toISOString() ?? null })),
  };
}

export const CAPABILITY_LABELS_EXPORT = CAPABILITY_LABELS;
