import { NextRequest, NextResponse } from "next/server";
import {
  mockOrgIntegrationMappings,
  getOrgMapping,
} from "@/lib/integrations/mock-data";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/organizations/[id]/integrations
 * Returns the list of integration mappings for a given org
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const mappings = mockOrgIntegrationMappings.filter(
    (m) => m.organizationId === id
  );
  return NextResponse.json({
    success: true,
    data: mappings,
    meta: { total: mappings.length, organizationId: id },
  });
}

/**
 * POST /api/v1/organizations/[id]/integrations
 * Create a new mapping (e.g. link this org to an Atera customer)
 *
 * Body: { provider: string, externalId: string, externalName: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();

  if (!body.provider || !body.externalId || !body.externalName) {
    return NextResponse.json(
      { success: false, error: "Missing required fields" },
      { status: 400 }
    );
  }

  const existing = getOrgMapping(id, body.provider);
  if (existing) {
    return NextResponse.json(
      { success: false, error: "Cette organisation est déjà mappée à ce fournisseur" },
      { status: 409 }
    );
  }

  const mapping = {
    id: `map_${body.provider}_${id}_${Date.now()}`,
    organizationId: id,
    organizationName: body.organizationName || "—",
    provider: body.provider,
    externalId: body.externalId,
    externalName: body.externalName,
    externalUrl: body.externalUrl,
    isActive: true,
    syncedRecordCount: 0,
    syncedRecordType: body.syncedRecordType,
    mappedAt: new Date().toISOString(),
    mappedBy: "Jean-Philippe Côté",
  };

  return NextResponse.json({ success: true, data: mapping }, { status: 201 });
}

/**
 * DELETE /api/v1/organizations/[id]/integrations?provider=atera
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const provider = request.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.json(
      { success: false, error: "provider query param required" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    success: true,
    data: { organizationId: id, provider, removed: true },
  });
}
