import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContactSoftwareAccessLevel } from "@prisma/client";

const LEVELS: ContactSoftwareAccessLevel[] = ["USER", "ADMIN", "APPROVER", "NONE"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const items = await prisma.contactSoftwareAccess.findMany({
    where: { contactId: id, revokedAt: null },
    include: {
      instance: {
        select: {
          id: true, name: true, vendor: true, version: true,
          category: { select: { name: true, icon: true, color: true } },
        },
      },
    },
    orderBy: [{ grantedAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const softwareInstanceId = String(body?.softwareInstanceId ?? "");
  if (!softwareInstanceId) return NextResponse.json({ error: "softwareInstanceId requis" }, { status: 400 });
  const created = await prisma.contactSoftwareAccess.create({
    data: {
      contactId: id,
      softwareInstanceId,
      accessLevel: LEVELS.includes(body?.accessLevel) ? body.accessLevel : "USER",
      grantedByUserId: me.id,
      note: body?.note || null,
    },
    include: { instance: { select: { id: true, name: true, vendor: true } } },
  });
  return NextResponse.json(created, { status: 201 });
}
