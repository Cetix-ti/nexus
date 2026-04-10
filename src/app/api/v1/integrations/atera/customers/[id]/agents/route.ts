import { NextRequest, NextResponse } from "next/server";
import {
  listAteraAgentsForCustomer,
  mapAteraAgentToOrgAsset,
} from "@/lib/integrations/atera-client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/integrations/atera/customers/[id]/agents?orgId=org-2
 *
 * Returns all Atera agents (devices) for a given Atera customer,
 * mapped to the internal OrgAsset shape so they can be displayed in
 * the client's asset list.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const orgId = request.nextUrl.searchParams.get("orgId") || "unknown";
  const customerId = parseInt(id, 10);

  if (Number.isNaN(customerId)) {
    return NextResponse.json(
      { success: false, error: "Invalid Atera customer id" },
      { status: 400 }
    );
  }

  try {
    const agents = await listAteraAgentsForCustomer(customerId);
    const assets = agents.map((a) => mapAteraAgentToOrgAsset(a, orgId));
    return NextResponse.json({
      success: true,
      data: assets,
      meta: {
        total: assets.length,
        ateraCustomerId: customerId,
        organizationId: orgId,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Erreur Atera",
      },
      { status: 502 }
    );
  }
}
