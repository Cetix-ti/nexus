import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: { organization: { select: { id: true, name: true } } },
  });

  if (!site) {
    return NextResponse.json({ error: "Site introuvable" }, { status: 404 });
  }

  return NextResponse.json(site);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.address !== undefined) data.address = body.address;
  if (body.city !== undefined) data.city = body.city;
  if (body.state !== undefined) data.state = body.state;
  if (body.postalCode !== undefined) data.postalCode = body.postalCode;
  if (body.country !== undefined) data.country = body.country;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.primary !== undefined) data.isMain = body.primary;
  if (body.isMain !== undefined) data.isMain = body.isMain;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Aucun champ à mettre à jour" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.site.update({
      where: { id },
      data,
      include: { organization: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de mise à jour" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await prisma.site.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de suppression" },
      { status: 500 }
    );
  }
}
