// ============================================================================
// FRESHSERVICE PARSER
// Reads a Freshservice export ZIP, extracts XML files, and converts them
// into normalized JS objects for the importer.
// ============================================================================

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type {
  FsExport,
  FsCompany,
  FsUser,
  FsGroup,
  FsTicket,
  FsTicketNote,
  FsAsset,
  FsSolutionCategory,
  FsSolutionFolder,
  FsSolutionArticle,
} from "./types";

// Freshservice ticket descriptions contain massive amounts of HTML entities
// (&lt;, &gt;, &amp;, etc.). fast-xml-parser's built-in protection against
// XML bombs caps entity expansion at 1000 — which trips on every real
// ticket. We disable entity processing here and decode them ourselves
// after parsing (see decodeEntities below).
const xmlParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: true,
  processEntities: false,
  htmlEntities: false,
  isArray: (name) => {
    // Force these tags to always be arrays so single-element cases don't get
    // collapsed into a single object.
    const arrays = new Set([
      "company",
      "user",
      "group",
      "agent",
      "company-name",
      "workspace",
      "helpdesk-ticket",
      "helpdesk-note",
      "tag",
      "config-item",
      "solution-category",
      "solution-folder",
      "solution-article",
      "workspaces",
      "workspace",
    ]);
    return arrays.has(name);
  },
});

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

function asNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "object" && v !== null && "@_nil" in v) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Decode the basic XML entities that fast-xml-parser leaves alone when we
 * disable processEntities. Numeric entities are decoded too.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    // &amp; must be last so we don't double-decode
    .replace(/&amp;/g, "&");
}

function asString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "object") return undefined;
  const s = String(v).trim();
  if (s.length === 0) return undefined;
  return decodeXmlEntities(s);
}

function asBool(v: unknown): boolean {
  if (v === true || v === "true") return true;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  return [v as T];
}

function customFieldsToObject(cf: unknown): Record<string, string> {
  if (!cf || typeof cf !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cf as Record<string, unknown>)) {
    if (v !== null && v !== undefined && typeof v !== "object") {
      out[k] = String(v);
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// COMPANY PARSER
// ----------------------------------------------------------------------------
function parseCompanies(xml: string): FsCompany[] {
  const data = xmlParser.parse(xml);
  const list = asArray<any>(data?.companies?.company);
  return list.map((c) => ({
    id: asNumber(c.id) ?? 0,
    name: asString(c.name) ?? "Sans nom",
    description: asString(c.description),
    domains: asString(c.domains),
    apiName: asString(c["api-name"]),
    workspaceId: asNumber(c["workspace-id"]),
    createdAt: asString(c["created-at"]),
    updatedAt: asString(c["updated-at"]),
    customFields: customFieldsToObject(c.custom_field),
  }));
}

// ----------------------------------------------------------------------------
// USER PARSER
// ----------------------------------------------------------------------------
function parseUsers(xml: string): FsUser[] {
  const data = xmlParser.parse(xml);
  const list = asArray<any>(data?.users?.user);
  return list.map((u) => {
    const companyArr = asArray<any>(u["company-names"]?.["company-name"]);
    const wsArr = asArray<any>(u.workspaces?.workspace);
    return {
      id: asNumber(u.id) ?? 0,
      name: asString(u.name) ?? asString(u.email) ?? "Sans nom",
      email: asString(u.email) ?? "",
      active: asBool(u.active),
      jobTitle: asString(u["job-title"]),
      phone: asString(u.phone),
      mobile: asString(u.mobile),
      language: asString(u.language),
      timeZone: asString(u["time-zone"]),
      externalId: asString(u["external-id"]),
      helpdeskAgent: asBool(u["helpdesk-agent"]),
      vipUser: asBool(u["vip-user"]),
      locationName: asString(u["location-name"]),
      companyNames: companyArr.map((c) =>
        typeof c === "string" ? c : asString(c) ?? ""
      ).filter(Boolean),
      workspaceIds: wsArr.map((w) => asNumber(w?.id) ?? 0).filter(Boolean),
      createdAt: asString(u["created-at"]),
      updatedAt: asString(u["updated-at"]),
    };
  });
}

// ----------------------------------------------------------------------------
// GROUP PARSER
// ----------------------------------------------------------------------------
function parseGroups(xml: string): FsGroup[] {
  const data = xmlParser.parse(xml);
  const list = asArray<any>(data?.groups?.group);
  return list.map((g) => {
    const agents = asArray<any>(g.agents?.agent);
    return {
      id: asNumber(g.id) ?? 0,
      name: asString(g.name) ?? "Groupe",
      description: asString(g.description),
      workspaceId: asNumber(g["workspace-id"]),
      businessFunction: asString(g["business-function"]),
      approvalRequired: asBool(g["approval-required"]),
      agentIds: agents.map((a) => asNumber(a.id) ?? 0).filter(Boolean),
      agentNames: agents
        .map((a) => asString(a.name))
        .filter((n): n is string => Boolean(n)),
      createdAt: asString(g["created-at"]),
      updatedAt: asString(g["updated-at"]),
    };
  });
}

// ----------------------------------------------------------------------------
// TICKET PARSER
// ----------------------------------------------------------------------------
function parseTicketNote(n: any): FsTicketNote {
  return {
    id: asNumber(n.id) ?? 0,
    userId: asNumber(n["user-id"]) ?? 0,
    source: asNumber(n.source) ?? 0,
    incoming: asBool(n.incoming),
    private: asBool(n.private),
    body: asString(n.body) ?? "",
    bodyHtml: asString(n["body-html"]),
    supportEmail: asString(n["support-email"]),
    createdAt: asString(n["created-at"]) ?? "",
    updatedAt: asString(n["updated-at"]),
  };
}

function parseTickets(xml: string): FsTicket[] {
  const data = xmlParser.parse(xml);
  const list = asArray<any>(data?.["helpdesk-tickets"]?.["helpdesk-ticket"]);
  return list.map((t) => {
    const notes = asArray<any>(t["helpdesk-notes"]?.["helpdesk-note"]).map(
      parseTicketNote
    );
    const tags = asArray<any>(t.tags?.tag).map((tg) =>
      typeof tg === "object" ? asString(tg.name) || "" : String(tg)
    );

    // Map the well-known custom fields to friendly names
    const cf = (t.custom_field || {}) as Record<string, unknown>;
    const customFields: FsTicket["customFields"] = {};
    for (const [k, v] of Object.entries(cf)) {
      if (v === null || v === undefined || typeof v === "object") continue;
      const value = String(v);
      if (k.startsWith("projet")) customFields.projet = value;
      else if (k.startsWith("cdule") || k.startsWith("cedule"))
        customFields.cedule = value;
      else if (k.startsWith("niveau")) customFields.niveau = value;
      else if (k.startsWith("travaux_sur_place"))
        customFields.travauxSurPlace = value;
      else if (k.startsWith("actions_prise") || k.startsWith("action_prise"))
        customFields.actionsPrise = value;
      customFields[k] = value;
    }

    return {
      id: asNumber(t.id) ?? 0,
      displayId: asNumber(t["display-id"]) ?? 0,
      subject: asString(t.subject) ?? "",
      description: asString(t.description) ?? "",
      descriptionHtml: asString(t["description-html"]),
      status: asNumber(t.status) ?? 0,
      statusName: asString(t["status-name"]),
      priority: asNumber(t.priority) ?? 0,
      priorityName: asString(t["priority-name"]),
      source: asNumber(t.source) ?? 0,
      sourceName: asString(t["source-name"]),
      urgency: asNumber(t.urgency) ?? 0,
      impact: asNumber(t.impact) ?? 0,
      ticketType: asString(t["ticket-type"]) ?? "Incident",
      requesterId: asNumber(t["requester-id"]),
      requesterName: asString(t["requester-name"]),
      responderId: asNumber(t["responder-id"]),
      responderName: asString(t["responder-name"]),
      ownerId: asNumber(t["owner-id"]),
      groupId: asNumber(t["group-id"]),
      departmentName: asString(t["department-name"]),
      departmentId: asNumber(t["department-id-value"]),
      category: asString(t.category),
      subCategory: asString(t["sub-category"]),
      itemCategory: asString(t["item-category"]),
      workspaceId: asNumber(t["workspace-id"]),
      dueBy: asString(t["due-by"]),
      frDueBy: asString(t.frDueBy),
      isEscalated: asBool(t.isescalated),
      frEscalated: asBool(t["fr-escalated"]),
      spam: asBool(t.spam),
      deleted: asBool(t.deleted),
      createdAt: asString(t["created-at"]) ?? "",
      updatedAt: asString(t["updated-at"]) ?? "",
      tags: tags.filter(Boolean) as string[],
      notes,
      customFields,
    };
  });
}

// ----------------------------------------------------------------------------
// ASSETS PARSER
// ----------------------------------------------------------------------------
function parseAssets(xml: string): FsAsset[] {
  const data = xmlParser.parse(xml);
  const list = asArray<any>(data?.["cmdb-config-items"]?.["config-item"]);
  return list.map((a) => {
    const hw = a.Hardware || {};
    const computer = hw.Computer || {};
    return {
      id: asNumber(a.id) ?? 0,
      name: asString(a.name) ?? "Sans nom",
      description: asString(a.description),
      ciTypeName: asString(a["ci-type-name"]),
      assetTag: asString(a["asset-tag"]),
      usedBy: asString(a["used-by"]),
      usedByEmail: asString(a["used-by-email"]),
      companyName: asString(a["company-name"]),
      hardware: {
        productName: asString(hw["product-name"]),
        vendorName: asString(hw["vendor-name"]),
        serialNumber: asString(hw.serialnumber),
        cost: asNumber(hw.cost),
        acquisitionDate: asString(hw.acquisitiondate),
        warrantyExpiryDate: asString(hw.warrantyexpirydate),
      },
      computer: {
        os: asString(computer.os),
        osVersion: asString(computer.osversion),
        osServicePack: asString(computer.osservicepack),
        memoryGb: asNumber(computer.memorygb),
        diskSpaceGb: asNumber(computer.diskspacegb),
        cpuSpeedGhz: asNumber(computer.cpuspeedghz),
        cpuCoreCount: asNumber(computer.cpucorecount),
        macAddress: asString(computer.macaddress),
        ipAddress: asString(computer.ipaddress),
      },
      createdAt: asString(a["created-at"]),
      updatedAt: asString(a["updated-at"]),
    };
  });
}

// ----------------------------------------------------------------------------
// SOLUTIONS PARSER
// ----------------------------------------------------------------------------
function parseSolutions(xml: string): FsSolutionCategory[] {
  const data = xmlParser.parse(xml);
  const cats = asArray<any>(data?.["solution-categories"]?.["solution-category"]);
  return cats.map((cat) => {
    const folders = asArray<any>(cat.folders?.["solution-folder"]);
    return {
      id: asNumber(cat.id) ?? 0,
      name: asString(cat.name) ?? "Catégorie",
      description: asString(cat.description),
      position: asNumber(cat.position),
      workspaceId: asNumber(cat["workspace-id"]),
      folders: folders.map((f): FsSolutionFolder => {
        const articles = asArray<any>(f.articles?.["solution-article"]);
        return {
          id: asNumber(f.id) ?? 0,
          name: asString(f.name) ?? "Dossier",
          description: asString(f.description),
          visibility: asNumber(f.visibility),
          position: asNumber(f.position),
          categoryId: asNumber(f["category-id"]),
          articles: articles.map(
            (a): FsSolutionArticle => ({
              id: asNumber(a.id) ?? 0,
              title: asString(a.title) ?? "Sans titre",
              description: asString(a.description) ?? "",
              status: asNumber(a.status),
              position: asNumber(a.position),
              agentId: asNumber(a["agent-id"]),
              views: asNumber(a.views),
              thumbsUp: asNumber(a["thumbs-up"]),
              thumbsDown: asNumber(a["thumbs-down"]),
              createdAt: asString(a["created-at"]),
              updatedAt: asString(a["updated-at"]),
              folderId: asNumber(f.id),
            })
          ),
        };
      }),
    };
  });
}

// ----------------------------------------------------------------------------
// MAIN ENTRY POINT
// ----------------------------------------------------------------------------
export interface ParseProgress {
  step: string;
  current: number;
  total: number;
}

/**
 * Parse a Freshservice export ZIP from a Buffer.
 * Returns a fully normalized FsExport.
 */
export async function parseFreshserviceZip(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  onProgress?: (p: ParseProgress) => void
): Promise<FsExport> {
  const zip = await JSZip.loadAsync(buffer);

  const result: FsExport = {
    workspaces: [],
    companies: [],
    users: [],
    groups: [],
    tickets: [],
    assets: [],
    solutions: [],
    stats: {
      companies: 0,
      users: 0,
      agents: 0,
      contacts: 0,
      groups: 0,
      tickets: 0,
      notes: 0,
      assets: 0,
      solutionCategories: 0,
      solutionArticles: 0,
    },
  };

  // 1. Companies
  const companiesFile = zip.file("Global/Companies.xml");
  if (companiesFile) {
    onProgress?.({ step: "companies", current: 0, total: 1 });
    const xml = await companiesFile.async("string");
    result.companies = parseCompanies(xml);
    result.stats.companies = result.companies.length;
  }

  // 2. Users (may have multiple parts: Users1_0, Users1_1, ...)
  const userFiles = Object.keys(zip.files).filter((p) =>
    /^Global\/Users\d+_\d+\.xml$/.test(p)
  );
  for (let i = 0; i < userFiles.length; i++) {
    onProgress?.({ step: "users", current: i + 1, total: userFiles.length });
    const xml = await zip.file(userFiles[i])!.async("string");
    result.users.push(...parseUsers(xml));
  }
  result.stats.users = result.users.length;
  result.stats.agents = result.users.filter((u) => u.helpdeskAgent).length;
  result.stats.contacts = result.users.length - result.stats.agents;

  // 3. Groups (per workspace, find any Groups.xml)
  const groupFiles = Object.keys(zip.files).filter((p) =>
    /\/Groups\.xml$/.test(p)
  );
  for (const f of groupFiles) {
    const xml = await zip.file(f)!.async("string");
    result.groups.push(...parseGroups(xml));
  }
  result.stats.groups = result.groups.length;

  // 4. Tickets (many parts)
  const ticketFiles = Object.keys(zip.files)
    .filter((p) => /\/Tickets\d+_\d+\.xml$/.test(p))
    .sort();
  for (let i = 0; i < ticketFiles.length; i++) {
    onProgress?.({
      step: "tickets",
      current: i + 1,
      total: ticketFiles.length,
    });
    const xml = await zip.file(ticketFiles[i])!.async("string");
    const parsed = parseTickets(xml);
    result.tickets.push(...parsed);
  }
  result.stats.tickets = result.tickets.length;
  result.stats.notes = result.tickets.reduce(
    (acc, t) => acc + t.notes.length,
    0
  );

  // 5. Assets (CMDB items)
  const itemFiles = Object.keys(zip.files).filter((p) =>
    /\/Items_\d+\.xml$/.test(p)
  );
  for (const f of itemFiles) {
    const xml = await zip.file(f)!.async("string");
    result.assets.push(...parseAssets(xml));
  }
  result.stats.assets = result.assets.length;

  // 6. Solutions (knowledge base) — both Global and IT
  const solFiles = Object.keys(zip.files).filter((p) =>
    /\/Solutions\.xml$/.test(p)
  );
  for (const f of solFiles) {
    const xml = await zip.file(f)!.async("string");
    result.solutions.push(...parseSolutions(xml));
  }
  result.stats.solutionCategories = result.solutions.length;
  result.stats.solutionArticles = result.solutions.reduce(
    (acc, c) =>
      acc + c.folders.reduce((acc2, f) => acc2 + f.articles.length, 0),
    0
  );

  return result;
}

/**
 * Quick "preview" parse — only reads the small files (companies, groups,
 * solutions metadata) without loading the heavy ticket files. Used by the
 * UI to show a summary before the user confirms the import.
 */
export async function previewFreshserviceZip(
  buffer: Buffer | ArrayBuffer | Uint8Array
): Promise<{
  fileCount: number;
  totalSizeMb: number;
  files: { name: string; sizeKb: number }[];
  preview: {
    companies: number;
    agents: number;
    contacts: number;
    groups: number;
    estimatedTickets: number;
    solutionCategories: number;
  };
}> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.entries(zip.files)
    .filter(([, f]) => !f.dir)
    .map(([name, f]) => ({
      name,
      sizeKb: Math.round(((f as any)._data?.uncompressedSize || 0) / 1024),
    }))
    .sort((a, b) => b.sizeKb - a.sizeKb);

  // Parse only small files
  const companiesFile = zip.file("Global/Companies.xml");
  const groupFiles = Object.keys(zip.files).filter((p) =>
    /\/Groups\.xml$/.test(p)
  );
  const userFiles = Object.keys(zip.files).filter((p) =>
    /^Global\/Users\d+_\d+\.xml$/.test(p)
  );
  const ticketFiles = Object.keys(zip.files).filter((p) =>
    /\/Tickets\d+_\d+\.xml$/.test(p)
  );
  const solFiles = Object.keys(zip.files).filter((p) =>
    /\/Solutions\.xml$/.test(p)
  );

  let companies = 0;
  if (companiesFile) {
    const xml = await companiesFile.async("string");
    companies = parseCompanies(xml).length;
  }

  let agents = 0;
  let contacts = 0;
  for (const f of userFiles) {
    const xml = await zip.file(f)!.async("string");
    const users = parseUsers(xml);
    for (const u of users) {
      if (u.helpdeskAgent) agents++;
      else contacts++;
    }
  }

  let groups = 0;
  for (const f of groupFiles) {
    const xml = await zip.file(f)!.async("string");
    groups += parseGroups(xml).length;
  }

  let solutionCategories = 0;
  for (const f of solFiles) {
    const xml = await zip.file(f)!.async("string");
    solutionCategories += parseSolutions(xml).length;
  }

  // Quick estimate: ~300 tickets per ticket file
  const estimatedTickets = ticketFiles.length * 300;

  const totalBytes = files.reduce((acc, f) => acc + f.sizeKb * 1024, 0);

  return {
    fileCount: files.length,
    totalSizeMb: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
    files: files.slice(0, 60),
    preview: {
      companies,
      agents,
      contacts,
      groups,
      estimatedTickets,
      solutionCategories,
    },
  };
}
