import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-utils";
import { listExclusions, addExclusion } from "@/lib/integrations/atera-purge";

const postSchema = z.object({
  agentId: z.number().int().positive(),
  machineName: z.string().optional(),
  customerName: z.string().optional(),
  reason: z.string().min(5).max(2000),
  expiresAt: z.string().datetime().nullable().optional(),
});

/**
 * GET /api/v1/integrations/atera/exclusions
 * Liste toutes les exclusions actives (whitelist d'agents à ne pas purger).
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await listExclusions();
  return NextResponse.json({ success: true, data });
}

/**
 * POST /api/v1/integrations/atera/exclusions
 * Ajoute (ou met à jour) une exclusion. Idempotent sur agentId.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { agentId, machineName, customerName, reason, expiresAt } = parsed.data;
  const created = await addExclusion({
    agentId,
    machineName,
    customerName,
    reason,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    addedById: me.id,
  });
  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
