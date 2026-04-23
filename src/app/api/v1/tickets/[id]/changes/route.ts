// Reverse lookup : Changes qui citent ce ticket dans linkedTicketIds.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const items = await prisma.change.findMany({
    where: { linkedTicketIds: { has: id }, mergedIntoId: null },
    select: {
      id: true, title: true, summary: true, category: true, impact: true,
      status: true, changeDate: true, publishedAt: true,
    },
    orderBy: [{ changeDate: "desc" }],
    take: 20,
  });
  return NextResponse.json(items);
}
