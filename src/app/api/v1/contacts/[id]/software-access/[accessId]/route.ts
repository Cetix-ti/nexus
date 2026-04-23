import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

// Révocation soft : set revokedAt au lieu de delete.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; accessId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { accessId } = await ctx.params;
  await prisma.contactSoftwareAccess.update({
    where: { id: accessId },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
