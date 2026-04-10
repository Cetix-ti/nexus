// ============================================================================
// FRESHSERVICE → POSTGRES WRITER
// Upsert-based: existing rows are matched by externalId and merged.
// New rows are inserted. Existing-with-no-changes are no-ops.
// ============================================================================

import prisma from "@/lib/prisma";
import type { MappingResult } from "./mapper";

interface WriteOptions {
  purgeFirst?: boolean; // truncate everything before importing
  log?: (msg: string) => void;
}

interface WriteStats {
  organizations: { created: number; updated: number };
  users: { created: number; updated: number };
  contacts: { created: number; updated: number };
  queues: { created: number; updated: number };
  categories: { created: number };
  tickets: { created: number; updated: number };
  comments: number;
  activities: number;
  assets: { created: number; updated: number };
  articleCategories: { created: number };
  articles: { created: number; updated: number };
  durationMs: number;
  warnings: string[];
}

function mapStatusEnum(s: string): any {
  return s.toUpperCase().replace(/-/g, "_");
}
function mapPriorityEnum(p: string): any {
  return p.toUpperCase();
}
function mapTypeEnum(t: string): any {
  if (t === "request") return "SERVICE_REQUEST";
  return t.toUpperCase();
}
function mapSourceEnum(s: string): any {
  return s.toUpperCase();
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function writeMappingResultToDb(
  result: MappingResult,
  options: WriteOptions = {}
): Promise<WriteStats> {
  const log = options.log || (() => {});
  const t0 = Date.now();
  const stats: WriteStats = {
    organizations: { created: 0, updated: 0 },
    users: { created: 0, updated: 0 },
    contacts: { created: 0, updated: 0 },
    queues: { created: 0, updated: 0 },
    categories: { created: 0 },
    tickets: { created: 0, updated: 0 },
    comments: 0,
    activities: 0,
    assets: { created: 0, updated: 0 },
    articleCategories: { created: 0 },
    articles: { created: 0, updated: 0 },
    durationMs: 0,
    warnings: [],
  };

  // ---------- PURGE ----------
  if (options.purgeFirst) {
    log("→ Purge des données existantes...");
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.ticketTag.deleteMany();
    await prisma.ticketAsset.deleteMany();
    await prisma.ticket.deleteMany();
    await prisma.article.deleteMany();
    await prisma.articleCategory.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.queue.deleteMany();
    await prisma.category.deleteMany();
    await prisma.orgApprover.deleteMany();
    await prisma.portalAccessUser.deleteMany();
    await prisma.orgIntegrationMapping.deleteMany();
    await prisma.orgSlaOverride.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
    log("  ✓ Purgé");
  }

  // ---------- ORGANIZATIONS ----------
  log(`→ ${result.organizations.length} organisations...`);
  const orgIdByExternal = new Map<string, string>();
  const orgIdByName = new Map<string, string>();
  for (const o of result.organizations) {
    if (!o.externalId) continue;
    const existing = await prisma.organization.findUnique({
      where: { externalId: o.externalId },
    });
    if (existing) {
      const updated = await prisma.organization.update({
        where: { id: existing.id },
        data: {
          name: o.name,
          domain: o.domain || existing.domain,
          slug: existing.slug, // keep stable slug
        },
      });
      orgIdByExternal.set(o.externalId, updated.id);
      orgIdByName.set(o.name, updated.id);
      stats.organizations.updated++;
    } else {
      const created = await prisma.organization.create({
        data: {
          externalSource: "freshservice",
          externalId: o.externalId,
          name: o.name,
          slug: o.slug || slugify(o.name) + "-" + Math.random().toString(36).slice(2, 6),
          domain: o.domain,
        },
      });
      orgIdByExternal.set(o.externalId, created.id);
      orgIdByName.set(o.name, created.id);
      stats.organizations.created++;
    }
  }

  // ---------- AGENTS (USERS) ----------
  log(`→ ${result.agents.length} agents...`);
  const userIdByExternal = new Map<string, string>();
  const userIdByName = new Map<string, string>();
  for (const a of result.agents) {
    if (!a.externalId) continue;
    const existing = await prisma.user.findUnique({
      where: { externalId: a.externalId },
    });
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email,
          phone: a.phone,
          isActive: a.isActive,
        },
      });
      userIdByExternal.set(a.externalId, updated.id);
      userIdByName.set(`${a.firstName} ${a.lastName}`.trim().toLowerCase(), updated.id);
      if (a.fullName) userIdByName.set(a.fullName.toLowerCase(), updated.id);
      stats.users.updated++;
    } else {
      try {
        const created = await prisma.user.create({
          data: {
            externalSource: "freshservice",
            externalId: a.externalId,
            email: a.email || `agent-${a.externalId}@import.local`,
            firstName: a.firstName || "Agent",
            lastName: a.lastName || a.externalId,
            phone: a.phone,
            isActive: a.isActive,
            role: "TECHNICIAN",
          },
        });
        userIdByExternal.set(a.externalId, created.id);
        userIdByName.set(`${a.firstName} ${a.lastName}`.trim().toLowerCase(), created.id);
        if (a.fullName) userIdByName.set(a.fullName.toLowerCase(), created.id);
        stats.users.created++;
      } catch (e) {
        stats.warnings.push(`User skipped (${a.email}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // System creator user (required for tickets)
  let systemUser = await prisma.user.findUnique({ where: { email: "freshservice-import@cetix.ca" } });
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        email: "freshservice-import@cetix.ca",
        firstName: "Freshservice",
        lastName: "Import",
        role: "MSP_ADMIN",
      },
    });
  }

  // ---------- CONTACTS ----------
  log(`→ ${result.contacts.length} contacts...`);
  const contactIdByExternal = new Map<string, string>();
  const contactIdByEmail = new Map<string, string>();
  for (const c of result.contacts) {
    if (!c.externalId) continue;
    const orgId = orgIdByName.get(c.organizationName);
    if (!orgId) {
      stats.warnings.push(`Contact ${c.email}: org "${c.organizationName}" introuvable`);
      continue;
    }
    const existing = await prisma.contact.findUnique({
      where: { externalId: c.externalId },
    });
    if (existing) {
      const updated = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone || c.mobile,
          jobTitle: c.jobTitle,
          isVIP: c.isVip,
          isActive: c.isActive,
        },
      });
      contactIdByExternal.set(c.externalId, updated.id);
      if (c.email) contactIdByEmail.set(c.email.toLowerCase(), updated.id);
      stats.contacts.updated++;
    } else {
      try {
        const created = await prisma.contact.create({
          data: {
            externalSource: "freshservice",
            externalId: c.externalId,
            organizationId: orgId,
            firstName: c.firstName || "—",
            lastName: c.lastName || "—",
            email: c.email || `contact-${c.externalId}@import.local`,
            phone: c.phone || c.mobile,
            jobTitle: c.jobTitle,
            isVIP: c.isVip,
            isActive: c.isActive,
          },
        });
        contactIdByExternal.set(c.externalId, created.id);
        if (c.email) contactIdByEmail.set(c.email.toLowerCase(), created.id);
        stats.contacts.created++;
      } catch (e) {
        stats.warnings.push(`Contact skipped (${c.email}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ---------- QUEUES ----------
  log(`→ ${result.queues.length} queues...`);
  const queueIdByExternal = new Map<string, string>();
  for (const q of result.queues) {
    if (!q.externalId) continue;
    const existing = await prisma.queue.findUnique({ where: { externalId: q.externalId } });
    if (existing) {
      const updated = await prisma.queue.update({
        where: { id: existing.id },
        data: { name: q.name, description: q.description },
      });
      queueIdByExternal.set(q.externalId, updated.id);
      stats.queues.updated++;
    } else {
      const created = await prisma.queue.create({
        data: { externalId: q.externalId, name: q.name, description: q.description },
      });
      queueIdByExternal.set(q.externalId, created.id);
      stats.queues.created++;
    }
  }

  // ---------- CATEGORIES (deduce from tickets) ----------
  log(`→ Catégories tickets...`);
  const distinctCats = new Set<string>();
  for (const t of result.tickets) {
    if (t.categoryName) distinctCats.add(t.categoryName);
  }
  const categoryIdByName = new Map<string, string>();
  for (const name of distinctCats) {
    let cat = await prisma.category.findFirst({ where: { name, organizationId: null } });
    if (!cat) {
      cat = await prisma.category.create({ data: { name } });
      stats.categories.created++;
    }
    categoryIdByName.set(name, cat.id);
  }

  // ---------- TAGS ----------
  log(`→ Tags...`);
  const distinctTags = new Set<string>();
  for (const t of result.tickets) for (const tag of t.tags) distinctTags.add(tag);
  const tagIdByName = new Map<string, string>();
  for (const name of distinctTags) {
    let tag = await prisma.tag.findFirst({ where: { name, organizationId: null } });
    if (!tag) tag = await prisma.tag.create({ data: { name } });
    tagIdByName.set(name, tag.id);
  }

  // ---------- TICKETS ----------
  log(`→ ${result.tickets.length} tickets... (peut prendre 1-2 min)`);
  let processed = 0;
  for (const t of result.tickets) {
    const externalId = (t as any).externalId || (t as any).id;
    if (!externalId) continue;

    const orgId = orgIdByName.get(t.organizationName);
    if (!orgId) {
      stats.warnings.push(`Ticket ${externalId}: org "${t.organizationName}" introuvable`);
      continue;
    }

    const existing = await prisma.ticket.findUnique({ where: { externalId: String(externalId) } });
    const requesterId = t.requesterEmail
      ? contactIdByEmail.get(t.requesterEmail.toLowerCase()) || null
      : null;
    const assigneeId = t.assigneeName
      ? userIdByName.get(t.assigneeName.toLowerCase()) || null
      : null;
    const ticketData = {
      organizationId: orgId,
      requesterId,
      assigneeId,
      categoryId: t.categoryName ? categoryIdByName.get(t.categoryName) || null : null,
      queueId: null as string | null,
      subject: t.subject,
      description: t.description,
      status: mapStatusEnum(t.status),
      priority: mapPriorityEnum(t.priority),
      urgency: mapPriorityEnum(t.urgency),
      impact: mapPriorityEnum(t.impact),
      type: mapTypeEnum(t.type),
      source: mapSourceEnum(t.source),
      dueAt: t.dueAt ? new Date(t.dueAt) : null,
      slaBreached: t.slaBreached,
      isOverdue: t.isOverdue,
    };

    try {
      if (existing) {
        await prisma.ticket.update({ where: { id: existing.id }, data: ticketData });
        stats.tickets.updated++;
      } else {
        const ticket = await prisma.ticket.create({
          data: {
            ...ticketData,
            externalSource: "freshservice",
            externalId: String(externalId),
            creatorId: systemUser.id,
            createdAt: new Date(t.createdAt),
            updatedAt: new Date(t.updatedAt),
            ticketTags: {
              create: t.tags
                .map((name) => tagIdByName.get(name))
                .filter((id): id is string => !!id)
                .map((tagId) => ({ tagId })),
            },
            comments: {
              create: t.comments.slice(0, 50).map((c) => ({
                authorId: systemUser!.id,
                body: c.content,
                isInternal: c.isInternal,
                createdAt: new Date(c.createdAt),
              })),
            },
            activities: {
              create: t.activities.slice(0, 30).map((a) => ({
                userId: systemUser!.id,
                action: a.type,
                oldValue: a.oldValue,
                newValue: a.newValue,
                createdAt: new Date(a.createdAt),
                metadata: { authorName: a.authorName, content: a.content },
              })),
            },
          },
        });
        stats.tickets.created++;
        stats.comments += t.comments.length;
        stats.activities += t.activities.length;
      }
    } catch (e) {
      stats.warnings.push(`Ticket ${externalId} skipped: ${e instanceof Error ? e.message : String(e)}`);
    }

    processed++;
    if (processed % 500 === 0) log(`  ... ${processed} / ${result.tickets.length}`);
  }

  // ---------- ASSETS ----------
  // Fallback org for orphan assets — first org alphabetically (typically Cetix interne)
  const fallbackOrgId = orgIdByName.values().next().value as string | undefined;
  log(`→ ${result.assets.length} actifs...`);
  for (const a of result.assets) {
    if (!a.externalId) continue;
    const orgId =
      (a.organizationName ? orgIdByName.get(a.organizationName) : null) ||
      fallbackOrgId;
    if (!orgId) {
      stats.warnings.push(`Asset ${a.name}: pas d'org et pas de fallback`);
      continue;
    }
    const existing = await prisma.asset.findUnique({ where: { externalId: a.externalId } });
    const data: any = {
      name: a.name,
      manufacturer: a.manufacturer,
      model: a.model,
      serialNumber: a.serialNumber,
      ipAddress: a.ipAddress,
      macAddress: a.macAddress,
      warrantyExpiry: a.warrantyExpiryDate ? new Date(a.warrantyExpiryDate) : null,
    };
    if (existing) {
      await prisma.asset.update({ where: { id: existing.id }, data });
      stats.assets.updated++;
    } else {
      try {
        await prisma.asset.create({
          data: {
            ...data,
            externalSource: "freshservice",
            externalId: a.externalId,
            organizationId: orgId,
            type: "WORKSTATION",
          },
        });
        stats.assets.created++;
      } catch (e) {
        stats.warnings.push(`Asset ${a.name} skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ---------- KB ARTICLES ----------
  log(`→ ${result.kbArticles.length} articles KB...`);
  // Build category tree from "categoryName" → "folderName"
  const articleCatIdByPath = new Map<string, string>();
  for (const art of result.kbArticles) {
    const catKey = art.categoryName || "Général";
    const folderKey = `${catKey}::${art.folderName || ""}`;

    let parentId = articleCatIdByPath.get(catKey);
    if (!parentId) {
      const parent = await prisma.articleCategory.upsert({
        where: { organizationId_parentId_slug: { organizationId: null as any, parentId: null as any, slug: slugify(catKey) } },
        update: {},
        create: { name: catKey, slug: slugify(catKey), color: "#3B82F6", icon: "📁" },
      }).catch(async () => {
        return await prisma.articleCategory.create({
          data: { name: catKey, slug: slugify(catKey) + "-" + Math.random().toString(36).slice(2, 6), color: "#3B82F6", icon: "📁" },
        });
      });
      parentId = parent.id;
      articleCatIdByPath.set(catKey, parent.id);
      stats.articleCategories.created++;
    }

    let folderId = articleCatIdByPath.get(folderKey);
    if (!folderId && art.folderName) {
      const folder = await prisma.articleCategory.create({
        data: {
          name: art.folderName,
          slug: slugify(art.folderName) + "-" + Math.random().toString(36).slice(2, 6),
          parentId,
          color: "#3B82F6",
          icon: "📂",
        },
      });
      folderId = folder.id;
      articleCatIdByPath.set(folderKey, folder.id);
      stats.articleCategories.created++;
    }

    const categoryId = folderId || parentId;
    if (!art.externalId) continue;

    const existing = await prisma.article.findUnique({ where: { externalId: art.externalId } });
    if (existing) {
      await prisma.article.update({
        where: { id: existing.id },
        data: { title: art.title, body: art.body, categoryId },
      });
      stats.articles.updated++;
    } else {
      try {
        await prisma.article.create({
          data: {
            externalSource: "freshservice",
            externalId: art.externalId,
            title: art.title,
            slug: slugify(art.title) + "-" + art.externalId,
            body: art.body || "",
            summary: "",
            status: "PUBLISHED",
            isPublic: true,
            categoryId,
            viewCount: art.views || 0,
          },
        });
        stats.articles.created++;
      } catch (e) {
        stats.warnings.push(`Article "${art.title}" skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}
