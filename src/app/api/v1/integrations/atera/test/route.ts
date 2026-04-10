import { NextResponse } from "next/server";
import { testAteraConnection } from "@/lib/integrations/atera-client";

/**
 * GET /api/v1/integrations/atera/test
 * Tests the Atera API connection by hitting /customers with the configured key.
 */
export async function GET() {
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
