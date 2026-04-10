import { NextResponse } from "next/server";
import { listAteraCustomers } from "@/lib/integrations/atera-client";

/**
 * GET /api/v1/integrations/atera/customers
 * Returns the full list of Atera customers (clients) for picking the
 * external entity to map an internal organization to.
 */
export async function GET() {
  try {
    const customers = await listAteraCustomers();
    return NextResponse.json({
      success: true,
      data: customers.map((c) => ({
        externalId: String(c.CustomerID),
        externalName: c.CustomerName,
        type: "company" as const,
        city: c.City || undefined,
        country: c.Country || undefined,
        domain: c.Domain || undefined,
      })),
      meta: { total: customers.length },
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
