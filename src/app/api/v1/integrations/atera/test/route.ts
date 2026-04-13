import { NextResponse } from "next/server";
import { testAteraConnection } from "@/lib/integrations/atera-client";
import { getCurrentUser } from "@/lib/auth-utils";

/**
 * GET /api/v1/integrations/atera/test
 * Tests the Atera API connection by hitting /customers with the configured key.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await testAteraConnection();
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 502 }
    );
  }
  return NextResponse.json({
    success: true,
    data: { connected: true, customerCount: result.customerCount },
  });
}
