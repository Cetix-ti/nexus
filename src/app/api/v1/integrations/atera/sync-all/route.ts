import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  listAteraAgentsForCustomer,
  mapAteraAgentToOrgAsset,
} from "@/lib/integrations/atera-client";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/**
 * Sync Atera nightly pour toutes les organisations mappées.
 *
 * Authentification :
 *   - Header `Authorization: Bearer <CRON_SECRET>` pour un cron externe
 *   - OU session MSP_ADMIN pour un déclenchement manuel depuis l'UI
 *
 * Déclenchement typique (crontab) :
 *   0 3 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://nexus.cetix.ca/api/v1/integrations/atera/sync-all
 */

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

async function syncOrganization(orgId: string, externalId: string) {
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

    // `fieldOverrides` est un `String[]` Prisma : liste des champs que
    // l'utilisateur a édités manuellement et qu'on ne doit pas écraser.
    const overridden = new Set(existing?.fieldOverrides ?? []);

    // Don't overwrite fields the user has manually edited locally.
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
      await prisma.asset.update({
        where: { id: existing.id },
        data,
      });
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
          status:
            uiAsset.status === "active" ? "ACTIVE" : "INACTIVE",
        } as any,
      });
      created++;
    }
  }

  return { created, updated, total: agents.length };
}

export async function POST(req: NextRequest) {
  // Auth : cron secret OU MSP_ADMIN
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const mappings = await prisma.orgIntegrationMapping.findMany({
    where: { provider: "atera", isActive: true },
    select: { organizationId: true, externalId: true, externalName: true, id: true },
  });

  const results: Array<{
    organizationId: string;
    externalName: string;
    created?: number;
    updated?: number;
    total?: number;
    error?: string;
  }> = [];

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
        data: {
          lastSyncAt: new Date(),
          syncedRecordCount: r.total,
        },
      });
    } catch (err) {
      results.push({
        organizationId: m.organizationId,
        externalName: m.externalName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    orgsProcessed: mappings.length,
    orgsWithErrors: results.filter((r) => r.error).length,
    totalCreated,
    totalUpdated,
    results,
  });
}
