// ============================================================================
// PUT    /api/v1/security-center/persistence-whitelists/:id
// DELETE /api/v1/security-center/persistence-whitelists/:id
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | {
        hostname?: string | null;
        softwareName?: string;
        allowed?: boolean;
        notes?: string | null;
        organizationId?: string | null;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const updated = await prisma.securityPersistenceWhitelist.update({
    where: { id },
    data: {
      ...(body.hostname !== undefined ? { hostname: body.hostname || null } : {}),
      ...(body.softwareName !== undefined ? { softwareName: body.softwareName.trim() } : {}),
      ...(body.allowed !== undefined ? { allowed: body.allowed } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      ...(body.organizationId !== undefined ? { organizationId: body.organizationId || null } : {}),
    },
    include: {
      organization: { select: { id: true, name: true, clientCode: true } },
    },
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.securityPersistenceWhitelist.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
