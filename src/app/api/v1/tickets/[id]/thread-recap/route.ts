// ============================================================================
// GET /api/v1/tickets/[id]/thread-recap
//
// Retourne le récap consolidé d'un thread long (≥ 8 commentaires). Null si
// le thread est trop court ou pas encore consolidé.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { getThreadRecap } from "@/lib/ai/jobs/thread-consolidator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const recap = await getThreadRecap(id);
  return NextResponse.json({ recap });
}
