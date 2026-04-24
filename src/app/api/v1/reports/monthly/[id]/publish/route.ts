// ============================================================================
// POST /api/v1/reports/monthly/[id]/publish   (agent) : toggle publication
//
// Body: { publish: boolean }. Publier expose le rapport au portail client
// (visible par les utilisateurs avec canSeeBillingReports ou portalRole ADMIN).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const schema = z.object({ publish: z.boolean() });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updated = await prisma.monthlyClientReport.update({
    where: { id },
    data: {
      publishedToPortal: parsed.data.publish,
      publishedAt: parsed.data.publish ? new Date() : null,
    },
    select: { id: true, publishedToPortal: true, publishedAt: true },
  });

  return NextResponse.json({
    id: updated.id,
    publishedToPortal: updated.publishedToPortal,
    publishedAt: updated.publishedAt
      ? updated.publishedAt.toISOString()
      : null,
  });
}
