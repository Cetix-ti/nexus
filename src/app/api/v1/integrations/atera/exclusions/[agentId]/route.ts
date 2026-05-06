import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { removeExclusion } from "@/lib/integrations/atera-purge";

/**
 * DELETE /api/v1/integrations/atera/exclusions/[agentId]
 * Retire une exclusion (l'agent redeviendra purgeable).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { agentId: agentIdStr } = await params;
  const agentId = Number(agentIdStr);
  if (!Number.isFinite(agentId) || agentId <= 0) {
    return NextResponse.json({ error: "Invalid agentId" }, { status: 400 });
  }

  await removeExclusion(agentId);
  return NextResponse.json({ success: true });
}
