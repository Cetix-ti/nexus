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
  isInternal: boolean;
  // Champs supplémentaires chargés depuis la DB pour que EditOrgModal
  // puisse repopuler correctement son formulaire sans refaire un fetch
  // détail à chaque ouverture.
  calendarAliases: string[];
  endpointPatterns: string[];
  domains: string[];
  website: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  plan: string | null;
  description: string | null;
  isActive: boolean;
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

export async function listOrganizations(search?: string): Promise<UiOrganization[]> {
  const where = search
    ? { name: { contains: search, mode: "insensitive" as const } }
    : undefined;

  const rows = await prisma.organization.findMany({
    where,
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
    isInternal: o.isInternal,
    // Champs utilisés par EditOrgModal — si on ne les renvoie pas,
    // la modale les réinitialise à "" à chaque ouverture et donne
    // l'illusion que Save n'a rien sauvegardé (la DB a pourtant les
    // valeurs, elles ne se rechargent juste pas dans le formulaire).
    calendarAliases: o.calendarAliases ?? [],
    endpointPatterns: o.endpointPatterns ?? [],
    domains: o.domains ?? [],
    website: o.website,
    address: o.address,
    city: o.city,
    province: o.province,
    postalCode: o.postalCode,
    country: o.country,
    plan: o.plan,
    description: o.description,
    isActive: o.isActive,
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
      // Portail : on duplique ici les defaults du schéma Prisma
      // pour éviter que les éventuelles overrides applicatives ne
      // privent une nouvelle org des trois providers. Cette ligne
      // rend le comportement explicite et documenté côté service.
      portalEnabled: true,
      portalAuthProviders: ["microsoft", "google", "local"],
      portalDefaultRole: "STANDARD",
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
    // Marquer une organisation comme "interne" fait que tous les tickets
    // créés pour elle sont classés comme tickets internes (administratifs
    // Cetix) et donc exclus des vues clients.
    isInternal: boolean;
    /** Alias de calendrier Outlook — voir Organization.calendarAliases. */
    calendarAliases: string[];
    /** Patterns hostname pour le résolveur Centre de sécurité. */
    endpointPatterns: string[];
    /** Auto-publish des rapports mensuels au portail client. */
    monthlyReportAutoPublish: boolean;
  }>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { ...patch };
  // Normalisation des alias calendrier : trim, uppercase, strip accents,
  // dedup. Le décodeur fait déjà `norm()` à la comparaison mais stocker
  // en forme canonique rend l'affichage propre côté admin UI.
  if (patch.calendarAliases !== undefined) {
    data.calendarAliases = Array.from(
      new Set(
        patch.calendarAliases
          .map((a) =>
            a
              .trim()
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, ""),
          )
          .filter((a) => a.length >= 2),
      ),
    );
  }
  if (patch.endpointPatterns !== undefined) {
    // Patterns hostname : trim + uppercase + dedup. Pas de strip d'accents
    // (les hostnames Windows sont en ASCII pur, mais on garde "STATION-LAV"
    // tel quel sans normalisation diacritique).
    data.endpointPatterns = Array.from(
      new Set(
        patch.endpointPatterns
          .map((p) => p.trim().toUpperCase())
          .filter((p) => p.length >= 2),
      ),
    );
  }
  if (patch.clientCode !== undefined) {
    const upper = patch.clientCode ? patch.clientCode.toUpperCase() : null;
    data.clientCode = upper;
    // Le slug en BD doit suivre le code client (lowercased) — sinon les
    // URLs basées sur le slug (portail, etc.) restent collées à l'ancien
    // code après une mise à jour. Si le code est vidé, on retombe sur le
    // slug courant en BD pour ne pas violer la contrainte UNIQUE.
    if (upper) {
      data.slug = upper.toLowerCase();
      // Auto-ajout du clientCode aux calendarAliases. L'agent qui tape
      // "MTG MRVL" dans un titre Outlook s'attend à ce que MRVL matche
      // sans devoir l'ajouter manuellement aux alias. Si calendarAliases
      // est aussi en cours de patch, on fusionne ; sinon on lit la valeur
      // actuelle en DB et on l'enrichit.
      const incomingAliases = Array.isArray(data.calendarAliases)
        ? (data.calendarAliases as string[])
        : null;
      if (incomingAliases !== null) {
        if (!incomingAliases.includes(upper)) {
          data.calendarAliases = [...incomingAliases, upper];
        }
      } else {
        const current = await prisma.organization.findUnique({
          where: { id },
          select: { calendarAliases: true },
        });
        const existing = current?.calendarAliases ?? [];
        if (!existing.includes(upper)) {
          data.calendarAliases = [...existing, upper];
        }
      }
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
