// ============================================================================
// Atera sync — logique partagée entre l'endpoint HTTP et le background job.
//
// Expose :
//   - syncOrganization(orgId, externalId)  → pull + upsert d'une seule org
//   - syncAllMappedOrgs()                   → boucle sur toutes les mappings actives
//   - autoMapOrganizations()                → établit des mappings auto par match
//                                             de nom normalisé (Nexus ↔ Atera)
//
// Les deux routes HTTP (manuel + sync-all) et le scheduler utilisent ces
// fonctions — évite la duplication et rend la logique testable.
// ============================================================================

import prisma from "@/lib/prisma";
import {
  listAteraAgentsForCustomer,
  listAteraCustomers,
  mapAteraAgentToOrgAsset,
} from "./atera-client";

const TYPE_MAP: Record<string, string> = {
  windows_server: "SERVER",
  linux_server: "SERVER",
  workstation: "WORKSTATION",
  laptop: "LAPTOP",
  printer: "PRINTER",
  network: "NETWORK",
  switch: "NETWORK",
  router: "NETWORK",
  firewall: "NETWORK",
};

/** Normalise un nom pour comparaison cross-système (Nexus ↔ Atera) :
 *  lowercase, strip accents, strip ponctuation/espaces, supprime les
 *  suffixes corporatifs communs. "Ville de Louiseville" et "VILLE DE
 *  LOUISEVILLE INC." matchent. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(inc|ltd|ltee|ltée|corp|sarl|llc|sa|srl|co)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export async function syncOrganization(
  orgId: string,
  externalId: string,
): Promise<{ created: number; updated: number; total: number }> {
  const customerId = Number(externalId);
  if (!Number.isFinite(customerId)) {
    throw new Error(`externalId invalide: ${externalId}`);
  }

  const agents = await listAteraAgentsForCustomer(customerId);
  let created = 0;
  let updated = 0;

  for (const agent of agents) {
    const uiAsset = mapAteraAgentToOrgAsset(agent, orgId);
    const dbType = (TYPE_MAP[uiAsset.type] ?? "OTHER") as
      | "SERVER"
      | "WORKSTATION"
      | "LAPTOP"
      | "PRINTER"
      | "NETWORK"
      | "OTHER";
    const externalAgentId = String(agent.AgentID);

    const existing = await prisma.asset.findFirst({
      where: {
        organizationId: orgId,
        externalSource: "atera",
        externalId: externalAgentId,
      },
      select: { id: true, fieldOverrides: true, metadata: true },
    });
    const overridden = new Set(existing?.fieldOverrides ?? []);

    const data: Record<string, unknown> = {
      lastSyncedAt: new Date(),
      metadata: {
        ...((existing?.metadata as Record<string, unknown>) ?? {}),
        type: uiAsset.type,
        os: uiAsset.os,
        osVersion: uiAsset.osVersion,
        cpuModel: uiAsset.cpuModel,
        ramGb: uiAsset.ramGb,
        fqdn: uiAsset.fqdn,
        lastLoggedUser: uiAsset.lastLoggedUser,
      },
    };
    if (!overridden.has("name")) data.name = uiAsset.name;
    if (!overridden.has("type")) data.type = dbType;
    if (!overridden.has("status")) {
      data.status = uiAsset.status === "active" ? "ACTIVE" : "INACTIVE";
    }
    if (!overridden.has("manufacturer")) data.manufacturer = uiAsset.manufacturer ?? null;
    if (!overridden.has("model")) data.model = uiAsset.model ?? null;
    if (!overridden.has("serialNumber")) data.serialNumber = uiAsset.serialNumber ?? null;
    if (!overridden.has("ipAddress")) data.ipAddress = uiAsset.ipAddress ?? null;
    if (!overridden.has("macAddress")) data.macAddress = uiAsset.macAddress ?? null;

    if (existing) {
      await prisma.asset.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.asset.create({
        data: {
          ...data,
          organizationId: orgId,
          externalSource: "atera",
          externalId: externalAgentId,
          name: uiAsset.name,
          type: dbType,
          status: uiAsset.status === "active" ? "ACTIVE" : "INACTIVE",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      created++;
    }
  }

  return { created, updated, total: agents.length };
}

export interface SyncAllResult {
  orgsProcessed: number;
  orgsWithErrors: number;
  totalCreated: number;
  totalUpdated: number;
  results: Array<{
    organizationId: string;
    externalName: string;
    created?: number;
    updated?: number;
    total?: number;
    error?: string;
  }>;
}

export async function syncAllMappedOrgs(): Promise<SyncAllResult> {
  const mappings = await prisma.orgIntegrationMapping.findMany({
    where: { provider: "atera", isActive: true },
    select: { organizationId: true, externalId: true, externalName: true, id: true },
  });

  const results: SyncAllResult["results"] = [];
  let totalCreated = 0;
  let totalUpdated = 0;

  for (const m of mappings) {
    try {
      const r = await syncOrganization(m.organizationId, m.externalId);
      totalCreated += r.created;
      totalUpdated += r.updated;
      results.push({
        organizationId: m.organizationId,
        externalName: m.externalName,
        ...r,
      });
      await prisma.orgIntegrationMapping.update({
        where: { id: m.id },
        data: { lastSyncAt: new Date(), syncedRecordCount: r.total },
      });
    } catch (err) {
      results.push({
        organizationId: m.organizationId,
        externalName: m.externalName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    orgsProcessed: mappings.length,
    orgsWithErrors: results.filter((r) => r.error).length,
    totalCreated,
    totalUpdated,
    results,
  };
}

export interface AutoMapResult {
  candidates: number;       // Nexus orgs sans mapping
  created: number;          // Nouvelles mappings créées
  ambiguous: Array<{ organizationId: string; organizationName: string; matches: string[] }>;
  noMatch: Array<{ organizationId: string; organizationName: string }>;
}

/**
 * Auto-mapping Nexus ↔ Atera par match de nom normalisé.
 *
 * Pour chaque organisation Nexus SANS mapping Atera actif, on cherche le
 * client Atera dont le nom correspond (après normalisation). Si UN seul
 * client matche → création automatique de la mapping (active). Si
 * plusieurs matchent (ambiguïté) ou aucun → on skip et on reporte la
 * situation pour que l'admin puisse trancher manuellement.
 */
export async function autoMapOrganizations(): Promise<AutoMapResult> {
  const [ateraCustomers, existingMappings, nexusOrgs] = await Promise.all([
    listAteraCustomers(),
    prisma.orgIntegrationMapping.findMany({
      where: { provider: "atera" },
      select: { organizationId: true },
    }),
    prisma.organization.findMany({
      where: { isActive: true, isInternal: false },
      select: { id: true, name: true },
    }),
  ]);

  const mappedOrgIds = new Set(existingMappings.map((m) => m.organizationId));
  const candidates = nexusOrgs.filter((o) => !mappedOrgIds.has(o.id));

  // Index Atera : nom normalisé → [customers]
  const ateraByNorm = new Map<string, typeof ateraCustomers>();
  for (const c of ateraCustomers) {
    const key = normalizeName(c.CustomerName ?? "");
    if (!key) continue;
    const bucket = ateraByNorm.get(key) ?? [];
    bucket.push(c);
    ateraByNorm.set(key, bucket);
  }

  let created = 0;
  const ambiguous: AutoMapResult["ambiguous"] = [];
  const noMatch: AutoMapResult["noMatch"] = [];

  // Trouve ou crée le TenantIntegration Atera (FK requise sur la mapping).
  let integration = await prisma.tenantIntegration.findFirst({
    where: { provider: "atera" },
  });
  if (!integration) {
    integration = await prisma.tenantIntegration.create({
      data: {
        provider: "atera",
        name: "Atera RMM",
        category: "rmm",
        authType: "api_key",
        status: "connected",
      },
    });
  }

  for (const o of candidates) {
    const key = normalizeName(o.name);
    if (!key) { noMatch.push({ organizationId: o.id, organizationName: o.name }); continue; }
    const matches = ateraByNorm.get(key) ?? [];
    if (matches.length === 0) {
      noMatch.push({ organizationId: o.id, organizationName: o.name });
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push({
        organizationId: o.id,
        organizationName: o.name,
        matches: matches.map((m) => `${m.CustomerName} (#${m.CustomerID})`),
      });
      continue;
    }
    const atera = matches[0];
    await prisma.orgIntegrationMapping.create({
      data: {
        organizationId: o.id,
        integrationId: integration.id,
        provider: "atera",
        externalId: String(atera.CustomerID),
        externalName: atera.CustomerName ?? "",
        isActive: true,
      },
    });
    created++;
  }

  return { candidates: candidates.length, created, ambiguous, noMatch };
}
