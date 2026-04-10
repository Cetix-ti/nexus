import prisma from "@/lib/prisma";

// UI shape kept aligned with what /organizations and detail pages consume
export interface UiOrganization {
  id: string;
  clientCode: string | null;
  name: string;
  slug: string;
  billingMode: string;
  sites: number;
  contacts: number;
  openTickets: number;
  contractStatus: "Actif" | "Expiré" | "En attente";
  createdAt: string;
  color: string;
  domain: string;
  phone: string;
  logo: string | null;
}

const COLORS = ["bg-blue-600", "bg-emerald-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-indigo-600", "bg-pink-600"];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

// Map a contract type to the UI billing-mode bucket used by tables/badges.
function contractTypeToBillingMode(type: string | null | undefined): string {
  switch (type) {
    case "MANAGED_SERVICES":
      return "msp_monthly";
    case "RETAINER":
      return "retainer";
    case "HOURLY":
      return "hourly";
    case "PROJECT":
      return "project";
    case "SUPPORT":
      return "support";
    default:
      return "none";
  }
}

export async function listOrganizations(): Promise<UiOrganization[]> {
  const rows = await prisma.organization.findMany({
    include: {
      _count: { select: { sites: true, contacts: true, tickets: true } },
      sites: { take: 1, where: { isMain: true } },
    },
    orderBy: { name: "asc" },
  });

  // Tickets ouverts par org (un seul roundtrip groupé)
  const openCounts = await prisma.ticket.groupBy({
    by: ["organizationId"],
    where: { status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT"] } },
    _count: { id: true },
  });
  const openMap = new Map(openCounts.map((c) => [c.organizationId, c._count.id]));

  // Active contract per org → derive billing mode (single grouped query).
  const activeContracts = await prisma.contract.findMany({
    where: { status: "ACTIVE" },
    select: { organizationId: true, type: true, startDate: true },
    orderBy: { startDate: "desc" },
  });
  const billingModeMap = new Map<string, string>();
  for (const c of activeContracts) {
    if (!billingModeMap.has(c.organizationId)) {
      billingModeMap.set(c.organizationId, contractTypeToBillingMode(c.type));
    }
  }

  return rows.map((o) => ({
    id: o.id,
    clientCode: o.clientCode,
    name: o.name,
    slug: o.clientCode || o.slug,
    billingMode: billingModeMap.get(o.id) ?? "none",
    sites: o._count.sites,
    contacts: o._count.contacts,
    openTickets: openMap.get(o.id) || 0,
    contractStatus: o.isActive ? "Actif" : "Expiré",
    createdAt: o.createdAt.toISOString(),
    color: colorFor(o.id),
    domain: o.domain || `${o.slug}.com`,
    phone: "—",
    logo: o.logo || null,
  }));
}

export async function getOrganization(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      _count: {
        select: { sites: true, contacts: true, tickets: true, assets: true, contracts: true },
      },
    },
  });
  if (!org) return null;
  const openTickets = await prisma.ticket.count({
    where: {
      organizationId: id,
      status: { in: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "WAITING_CLIENT", "PENDING"] },
    },
  });
  const activeContracts = await prisma.contract.count({
    where: { organizationId: id, status: "ACTIVE" },
  });
  return {
    ...org,
    sitesCount: org._count.sites,
    contactsCount: org._count.contacts,
    assetsCount: org._count.assets,
    openTickets,
    activeContracts,
  };
}

export async function createOrganization(input: {
  name: string;
  clientCode?: string;
  slug?: string;
  domain?: string;
}) {
  const slug =
    input.clientCode?.toLowerCase() ||
    input.slug ||
    input.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return prisma.organization.create({
    data: {
      name: input.name,
      slug,
      domain: input.domain,
      clientCode: input.clientCode?.toUpperCase() || null,
    },
  });
}

export async function updateOrganization(
  id: string,
  patch: Partial<{
    name: string;
    domain: string;
    domains: string[];
    isActive: boolean;
    clientCode: string;
    website: string;
    description: string;
    phone: string;
    address: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    logo: string;
    logoOverridden: boolean;
  }>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { ...patch };
  if (patch.clientCode !== undefined) {
    const upper = patch.clientCode ? patch.clientCode.toUpperCase() : null;
    data.clientCode = upper;
    // Le slug en BD doit suivre le code client (lowercased) — sinon les
    // URLs basées sur le slug (portail, etc.) restent collées à l'ancien
    // code après une mise à jour. Si le code est vidé, on retombe sur le
    // slug courant en BD pour ne pas violer la contrainte UNIQUE.
    if (upper) {
      data.slug = upper.toLowerCase();
    }
  }
  // Normalisation des domaines : déduplication, trim, lowercase, et le
  // premier domaine est répliqué dans `domain` pour rétro-compat.
  if (patch.domains !== undefined) {
    const cleaned = Array.from(
      new Set(
        patch.domains
          .map((d) => d.trim().toLowerCase())
          .filter((d) => d.length > 0)
      )
    );
    data.domains = cleaned;
    data.domain = cleaned[0] ?? null;
  } else if (patch.domain !== undefined) {
    // Si seul `domain` est fourni (ancien client), on le synchronise dans le tableau.
    const d = (patch.domain || "").trim().toLowerCase();
    data.domain = d || null;
    data.domains = d ? [d] : [];
  }
  return prisma.organization.update({ where: { id }, data });
}

export async function deleteOrganization(id: string) {
  return prisma.organization.delete({ where: { id } });
}

// ----------------------------------------------------------------------------
// Contacts
// ----------------------------------------------------------------------------
export async function listContacts(organizationId?: string) {
  return prisma.contact.findMany({
    where: organizationId ? { organizationId } : undefined,
    include: { organization: true, site: true },
    orderBy: { lastName: "asc" },
  });
}

export async function createContact(input: {
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  siteId?: string | null;
}) {
  return prisma.contact.create({ data: input });
}

export async function updateContact(id: string, patch: any) {
  return prisma.contact.update({ where: { id }, data: patch });
}

export async function deleteContact(id: string) {
  return prisma.contact.delete({ where: { id } });
}

// ----------------------------------------------------------------------------
// Users (techs / agents)
// ----------------------------------------------------------------------------
export async function listUsers() {
  return prisma.user.findMany({
    where: { role: { not: "CLIENT_USER" } },
    orderBy: { firstName: "asc" },
  });
}
