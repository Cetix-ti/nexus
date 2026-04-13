import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const mappings = await prisma.orgIntegrationMapping.findMany({
    where: { organizationId: id },
    orderBy: { provider: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: mappings.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      provider: m.provider,
      externalId: m.externalId,
      externalName: m.externalName,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
      recordCount: m.syncedRecordCount ?? 0,
      isActive: m.isActive,
    })),
    meta: { total: mappings.length, organizationId: id },
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();

  if (!body.provider || !body.externalId || !body.externalName) {
    return NextResponse.json(
      { success: false, error: "Champs requis manquants" },
      { status: 400 },
    );
  }

  // Check existing
  const existing = await prisma.orgIntegrationMapping.findFirst({
    where: { organizationId: id, provider: body.provider },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: "Ce fournisseur est déjà mappé pour cette organisation" },
      { status: 409 },
    );
  }

  // Find or create the tenant integration record for this provider
  let integration = await prisma.tenantIntegration.findFirst({
    where: { provider: body.provider },
  });
  if (!integration) {
    integration = await prisma.tenantIntegration.create({
      data: {
        provider: body.provider,
        name: body.provider === "atera" ? "Atera RMM" : "QuickBooks Online",
        category: body.provider === "atera" ? "rmm" : "accounting",
        authType: body.provider === "atera" ? "api_key" : "oauth2",
        status: "connected",
      },
    });
  }

  const mapping = await prisma.orgIntegrationMapping.create({
    data: {
      organizationId: id,
      integrationId: integration.id,
      provider: body.provider,
      externalId: body.externalId,
      externalName: body.externalName,
      isActive: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: mapping.id,
      organizationId: mapping.organizationId,
      provider: mapping.provider,
      externalId: mapping.externalId,
      externalName: mapping.externalName,
      lastSyncAt: null,
      recordCount: 0,
      isActive: true,
    },
  }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const provider = request.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "Paramètre provider requis" }, { status: 400 });
  }

  await prisma.orgIntegrationMapping.deleteMany({
    where: { organizationId: id, provider },
  });

  return NextResponse.json({ success: true });
}
