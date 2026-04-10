import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/** GET — org portal config */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      portalEnabled: true,
      portalAuthProviders: true,
      portalDefaultRole: true,
    },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(org);
}

/** PATCH — update org portal config */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.portalEnabled !== undefined) data.portalEnabled = !!body.portalEnabled;
  if (body.portalAuthProviders !== undefined)
    data.portalAuthProviders = body.portalAuthProviders;
  if (body.portalDefaultRole !== undefined)
    data.portalDefaultRole = body.portalDefaultRole || null;

  const updated = await prisma.organization.update({
    where: { id },
    data,
    select: {
      id: true,
      portalEnabled: true,
      portalAuthProviders: true,
      portalDefaultRole: true,
    },
  });
  return NextResponse.json(updated);
}
