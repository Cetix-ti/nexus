// ============================================================================
// FRESHSERVICE → NEXUS MAPPER
// Transforms parsed Freshservice entities into Nexus entities.
// ============================================================================

import type {
  FsExport,
  FsCompany,
  FsUser,
  FsGroup,
  FsTicket,
  FsTicketNote,
  FsAsset,
  FsSolutionCategory,
} from "./types";
import type {
  Ticket,
  TicketStatus,
  TicketPriority,
  TicketUrgency,
  TicketImpact,
  TicketType,
  TicketSource,
  TicketComment,
  TicketActivity,
} from "@/lib/mock-data";

// ----------------------------------------------------------------------------
// STATUS / PRIORITY / SOURCE / TYPE MAPPING
// ----------------------------------------------------------------------------

/**
 * Freshservice status integers
 *  2 = Open
 *  3 = Pending
 *  4 = Resolved
 *  5 = Closed
 *  6 = Waiting on Customer  (sometimes)
 *  7 = Waiting on Third Party (sometimes)
 *  + custom statuses with higher integers
 */
function mapStatus(fsStatus: number, fsName?: string): TicketStatus {
  // Look at the name first if provided — more reliable
  const n = (fsName || "").toLowerCase();
  if (n.includes("close")) return "closed";
  if (n.includes("resolv")) return "resolved";
  if (n.includes("waiting") || n.includes("attent")) return "waiting_client";
  if (n.includes("on-site") || n.includes("sur place") || n.includes("on site"))
    return "on_site";
  if (n.includes("progress") || n.includes("cours")) return "in_progress";
  if (n.includes("open") || n.includes("ouvert")) return "open";
  if (n.includes("new") || n.includes("nouveau")) return "new";

  // Fallback on the integer
  switch (fsStatus) {
    case 2:
      return "open";
    case 3:
      return "in_progress";
    case 4:
      return "resolved";
    case 5:
      return "closed";
    case 6:
    case 7:
      return "waiting_client";
    default:
      return "new";
  }
}

function mapPriority(fsPriority: number): TicketPriority {
  switch (fsPriority) {
    case 4:
      return "critical";
    case 3:
      return "high";
    case 2:
      return "medium";
    case 1:
    default:
      return "low";
  }
}

function mapUrgency(fsUrgency: number): TicketUrgency {
  return mapPriority(fsUrgency);
}

function mapImpact(fsImpact: number): TicketImpact {
  return mapPriority(fsImpact);
}

function mapSource(fsSource: number, fsName?: string): TicketSource {
  const n = (fsName || "").toLowerCase();
  if (n.includes("portal")) return "portal";
  if (n.includes("email") || n.includes("courriel")) return "email";
  if (n.includes("phone") || n.includes("téléphone") || n.includes("telephone"))
    return "phone";
  if (n.includes("monitor") || n.includes("alert")) return "monitoring";
  switch (fsSource) {
    case 1:
      return "email";
    case 2:
      return "portal";
    case 3:
      return "phone";
    case 7:
      return "monitoring";
    default:
      return "portal";
  }
}

function mapType(fsType: string): TicketType {
  const t = (fsType || "").toLowerCase();
  if (t.includes("incident")) return "incident";
  if (t.includes("problem")) return "problem";
  if (t.includes("change") || t.includes("changement")) return "change";
  if (t.includes("request") || t.includes("demande")) return "service_request";
  return "incident";
}

// ----------------------------------------------------------------------------
// HELPER UTILS
// ----------------------------------------------------------------------------

function makeOrgId(name: string): string {
  // Stable id from name — replace with UUIDs in production
  return (
    "org_" +
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40)
  );
}

function makeContactId(email: string): string {
  return "ct_" + email.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
}

function makeUserId(fsId: number): string {
  return `usr_fs_${fsId}`;
}

function makeTicketId(fsId: number): string {
  return `t_fs_${fsId}`;
}

function makeQueueId(fsId: number): string {
  return `q_fs_${fsId}`;
}

function makeAssetId(fsId: number): string {
  return `as_fs_${fsId}`;
}

function makeArticleId(fsId: number): string {
  return `kb_fs_${fsId}`;
}

function gradientForName(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-700",
    "from-emerald-500 to-teal-600",
    "from-violet-500 to-purple-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-cyan-500 to-sky-600",
    "from-fuchsia-500 to-purple-600",
    "from-indigo-500 to-blue-600",
  ];
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

// ----------------------------------------------------------------------------
// MAPPED ENTITY SHAPES
// ----------------------------------------------------------------------------

export interface NexusOrganization {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  description?: string;
  // Source tracking
  externalSource?: "freshservice";
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NexusContact {
  id: string;
  organizationId: string;
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  mobile?: string;
  jobTitle?: string;
  isVip: boolean;
  isActive: boolean;
  externalSource?: "freshservice";
  externalId?: string;
  azureId?: string;
}

export interface NexusAgent {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle?: string;
  phone?: string;
  isActive: boolean;
  role: string;
  externalId?: string;
  azureId?: string;
}

export interface NexusQueue {
  id: string;
  name: string;
  description?: string;
  approvalRequired: boolean;
  agentEmails: string[];
  externalId?: string;
}

export interface NexusKbArticle {
  id: string;
  categoryName: string;
  folderName: string;
  title: string;
  body: string;
  views?: number;
  externalId?: string;
}

export interface NexusAsset {
  id: string;
  name: string;
  organizationName?: string;
  assetTag?: string;
  type: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  os?: string;
  ipAddress?: string;
  macAddress?: string;
  cost?: number;
  warrantyExpiryDate?: string;
  externalSource?: "freshservice";
  externalId?: string;
}

export interface MappingResult {
  organizations: NexusOrganization[];
  contacts: NexusContact[];
  agents: NexusAgent[];
  queues: NexusQueue[];
  tickets: Ticket[];
  assets: NexusAsset[];
  kbArticles: NexusKbArticle[];
  warnings: string[];
  // Look-up maps used for FK resolution
  orgIdByName: Record<string, string>;
  contactIdByFsId: Record<number, string>;
  agentIdByFsId: Record<number, string>;
  queueIdByFsId: Record<number, string>;
}

// ----------------------------------------------------------------------------
// MAIN MAPPING FUNCTION
// ----------------------------------------------------------------------------

export function mapFreshserviceToNexus(fs: FsExport): MappingResult {
  const warnings: string[] = [];

  // ----- Organizations -----
  const organizations: NexusOrganization[] = fs.companies.map((c: FsCompany) => ({
    id: makeOrgId(c.name),
    name: c.name,
    slug: c.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    domain: c.domains?.split(/[, ]/)[0]?.trim() || undefined,
    description: c.description,
    externalSource: "freshservice",
    externalId: String(c.id),
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: c.updatedAt || new Date().toISOString(),
  }));

  const orgIdByName: Record<string, string> = {};
  for (const o of organizations) {
    orgIdByName[o.name] = o.id;
  }

  // ----- Users → split into agents and contacts -----
  const agents: NexusAgent[] = [];
  const contacts: NexusContact[] = [];
  const contactIdByFsId: Record<number, string> = {};
  const agentIdByFsId: Record<number, string> = {};

  for (const u of fs.users) {
    if (!u.email) {
      warnings.push(`Utilisateur sans email ignoré : ${u.name} (id ${u.id})`);
      continue;
    }
    const [first = "", ...rest] = (u.name || u.email).split(" ");
    const last = rest.join(" ");

    if (u.helpdeskAgent) {
      const agent: NexusAgent = {
        id: makeUserId(u.id),
        email: u.email,
        firstName: first,
        lastName: last,
        fullName: u.name || u.email,
        jobTitle: u.jobTitle,
        phone: u.phone || u.mobile,
        isActive: u.active,
        role: "TECHNICIAN",
        externalId: String(u.id),
        azureId: u.externalId,
      };
      agents.push(agent);
      agentIdByFsId[u.id] = agent.id;
    } else {
      // Resolve org from company-names (first non-empty)
      const orgName = u.companyNames.find((n) => n && orgIdByName[n]);
      if (!orgName) {
        if (u.companyNames.length > 0) {
          warnings.push(
            `Contact ${u.email} : entreprise « ${u.companyNames[0]} » non trouvée dans les organisations importées`
          );
        }
      }
      const orgId = orgName ? orgIdByName[orgName] : "";
      const contact: NexusContact = {
        id: makeContactId(u.email),
        organizationId: orgId,
        organizationName: orgName || "",
        firstName: first,
        lastName: last,
        email: u.email,
        phone: u.phone,
        mobile: u.mobile,
        jobTitle: u.jobTitle,
        isVip: u.vipUser,
        isActive: u.active,
        externalSource: "freshservice",
        externalId: String(u.id),
        azureId: u.externalId,
      };
      contacts.push(contact);
      contactIdByFsId[u.id] = contact.id;
    }
  }

  // ----- Groups → Queues -----
  const queueIdByFsId: Record<number, string> = {};
  const queues: NexusQueue[] = fs.groups.map((g: FsGroup) => {
    const id = makeQueueId(g.id);
    queueIdByFsId[g.id] = id;
    return {
      id,
      name: g.name,
      description: g.description,
      approvalRequired: g.approvalRequired,
      agentEmails: g.agentNames, // best effort — names not emails
      externalId: String(g.id),
    };
  });

  // ----- Tickets -----
  const tickets: Ticket[] = fs.tickets
    .filter((t) => !t.deleted && !t.spam)
    .map((t: FsTicket) => {
      // Department-name == organization-name (per user requirement Q1)
      const orgName =
        t.departmentName ||
        // fallback: try to find org by requester's company
        "";
      const requesterEmail = t.requesterId
        ? fs.users.find((u) => u.id === t.requesterId)?.email || ""
        : "";

      // Build comments timeline from notes
      const comments: TicketComment[] = t.notes
        .filter((n) => !n.private || n.private) // include all
        .map((n: FsTicketNote) => ({
          id: `cm_fs_${n.id}`,
          authorName:
            fs.users.find((u) => u.id === n.userId)?.name ||
            (n.incoming ? t.requesterName : t.responderName) ||
            "Inconnu",
          content: n.bodyHtml || n.body,
          isInternal: n.private,
          createdAt: n.createdAt,
        }));

      // Activities — synthesize from notes (simple)
      const activities: TicketActivity[] = [
        {
          id: `act_fs_${t.id}_created`,
          type: "created" as const,
          authorName: t.requesterName || "Système",
          content: "Ticket créé",
          createdAt: t.createdAt,
        },
      ];

      // After-hours: niveau == SOIR or NUIT
      const isAfterHours =
        (t.customFields?.niveau || "").toUpperCase().includes("SOIR") ||
        (t.customFields?.niveau || "").toUpperCase().includes("NUIT") ||
        (t.customFields?.niveau || "").toUpperCase().includes("FIN");

      // On-site: travaux_sur_place == OUI
      const onSite =
        (t.customFields?.travauxSurPlace || "").toUpperCase() === "OUI";

      let status = mapStatus(t.status, t.statusName);
      if (onSite && status !== "closed" && status !== "resolved") {
        status = "on_site";
      }

      // Support tier from cedule (NIVEAU 1, NIVEAU 2, NIVEAU 3, SENIOR)
      const cedule = (t.customFields?.cedule || "").toUpperCase();
      let supportTier: string | undefined;
      if (cedule.includes("SENIOR")) supportTier = "SR";
      else if (cedule.includes("NIVEAU 1") || cedule.includes("N1"))
        supportTier = "N1";
      else if (cedule.includes("NIVEAU 2") || cedule.includes("N2"))
        supportTier = "N2";
      else if (cedule.includes("NIVEAU 3") || cedule.includes("N3"))
        supportTier = "N3";

      // Tags + project from custom field
      const tags: string[] = [...t.tags];
      if (t.customFields?.projet) tags.push(`projet:${t.customFields.projet}`);
      if (cedule) tags.push(`cdule:${cedule}`);

      // Append actions_prise as an internal note if present
      if (t.customFields?.actionsPrise) {
        comments.push({
          id: `cm_fs_${t.id}_actions`,
          authorName: t.responderName || "Technicien",
          content: `<div><strong>Actions prises :</strong></div><div>${t.customFields.actionsPrise.replace(/\n/g, "<br>")}</div>`,
          isInternal: true,
          createdAt: t.updatedAt || t.createdAt,
        });
      }

      return {
        id: makeTicketId(t.id),
        number: `TK-${t.displayId}`,
        subject: t.subject,
        description: t.description,
        status,
        priority: mapPriority(t.priority),
        urgency: mapUrgency(t.urgency),
        impact: mapImpact(t.impact),
        type: mapType(t.ticketType),
        source: mapSource(t.source, t.sourceName),
        organizationName: orgName,
        requesterName: t.requesterName || "",
        requesterEmail,
        assigneeId: t.responderId ? `fs_agent_${t.responderId}` : null,
        assigneeName: t.responderName || null,
        assigneeAvatar: null,
        creatorId: t.requesterId ? `fs_user_${t.requesterId}` : "fs_unknown",
        categoryName: t.category || "",
        subcategoryName: t.subCategory,
        itemCategoryName: t.itemCategory,
        queueName:
          fs.groups.find((g) => g.id === t.groupId)?.name || "",
        supportTier,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        dueAt: t.dueBy || null,
        isOverdue: t.isEscalated,
        slaBreached: t.frEscalated,
        tags,
        comments: comments.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
        activities,
      };
    });

  // ----- Assets (only the few demo items, mapped to OrgAsset shape) -----
  const assets: NexusAsset[] = fs.assets.map((a: FsAsset) => ({
    id: makeAssetId(a.id),
    name: a.name,
    organizationName: a.companyName,
    assetTag: a.assetTag,
    type: (a.ciTypeName || "other").toLowerCase(),
    manufacturer: a.hardware?.vendorName,
    model: a.hardware?.productName,
    serialNumber: a.hardware?.serialNumber,
    os: a.computer?.os,
    ipAddress: a.computer?.ipAddress,
    macAddress: a.computer?.macAddress,
    cost: a.hardware?.cost,
    warrantyExpiryDate: a.hardware?.warrantyExpiryDate,
    externalSource: "freshservice",
    externalId: String(a.id),
  }));

  // ----- KB Articles -----
  const kbArticles: NexusKbArticle[] = [];
  for (const cat of fs.solutions) {
    for (const folder of cat.folders) {
      for (const article of folder.articles) {
        kbArticles.push({
          id: makeArticleId(article.id),
          categoryName: cat.name,
          folderName: folder.name,
          title: article.title,
          body: article.description,
          views: article.views,
          externalId: String(article.id),
        });
      }
    }
  }

  return {
    organizations,
    contacts,
    agents,
    queues,
    tickets,
    assets,
    kbArticles,
    warnings,
    orgIdByName,
    contactIdByFsId,
    agentIdByFsId,
    queueIdByFsId,
  };
}
