import prisma from "@/lib/prisma";

export async function listAssets(organizationId?: string) {
  return prisma.asset.findMany({
    where: organizationId ? { organizationId } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function createAsset(input: any) {
  return prisma.asset.create({ data: input });
}

// Fields that come from external sync (Atera, etc.).
// When a user manually edits one of these on a synced asset,
// it gets added to `fieldOverrides` so the next sync won't overwrite it.
const EXTERNAL_SYNCABLE_FIELDS = new Set([
  "name",
  "type",
  "status",
  "manufacturer",
  "model",
  "serialNumber",
  "ipAddress",
  "macAddress",
]);

export async function updateAsset(id: string, patch: any) {
  // For externally-synced assets, track which syncable fields the user edited
  // so they are protected from being overwritten on the next sync.
  const { fieldOverrides: _ignore, ...data } = patch;

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { externalSource: true, fieldOverrides: true },
  });

  if (asset?.externalSource) {
    const currentOverrides = new Set(asset.fieldOverrides ?? []);
    const editedSyncable = Object.keys(data).filter((k) =>
      EXTERNAL_SYNCABLE_FIELDS.has(k),
    );
    for (const f of editedSyncable) currentOverrides.add(f);

    if (editedSyncable.length > 0) {
      data.fieldOverrides = Array.from(currentOverrides);
    }
  }

  return prisma.asset.update({ where: { id }, data });
}

export async function deleteAsset(id: string) {
  return prisma.asset.delete({ where: { id } });
}

// ----------------------------------------------------------------------------
// RMM mappings (Atera, NinjaOne, etc.)
// ----------------------------------------------------------------------------

export async function getOrgMapping(orgId: string, provider: string) {
  return prisma.orgIntegrationMapping.findFirst({
    where: { organizationId: orgId, provider, isActive: true },
  });
}

export async function setOrgMapping(input: {
  organizationId: string;
  provider: string;
  externalId: string;
  externalName: string;
  externalUrl?: string;
  mappedBy?: string;
}) {
  // Find the parent integration record (must exist)
  let integration = await prisma.tenantIntegration.findUnique({
    where: { provider: input.provider },
  });
  if (!integration) {
    integration = await prisma.tenantIntegration.create({
      data: {
        provider: input.provider,
        category: input.provider === "atera" ? "rmm" : "other",
        name: input.provider,
        authType: "api_key",
      },
    });
  }
  return prisma.orgIntegrationMapping.upsert({
    where: { organizationId_provider: { organizationId: input.organizationId, provider: input.provider } },
    update: {
      externalId: input.externalId,
      externalName: input.externalName,
      externalUrl: input.externalUrl,
      isActive: true,
      mappedBy: input.mappedBy,
    },
    create: {
      organizationId: input.organizationId,
      provider: input.provider,
      integrationId: integration.id,
      externalId: input.externalId,
      externalName: input.externalName,
      externalUrl: input.externalUrl,
      mappedBy: input.mappedBy,
    },
  });
}

export async function deleteOrgMapping(orgId: string, provider: string) {
  await prisma.orgIntegrationMapping.deleteMany({
    where: { organizationId: orgId, provider },
  });
}
