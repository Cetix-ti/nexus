import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId") || undefined;

  const sites = await prisma.site.findMany({
    where: organizationId ? { organizationId } : undefined,
    include: { organization: { select: { id: true, name: true } } },
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
  });

  const ui = sites.map((s) => ({
    id: s.id,
    name: s.name,
    address: s.address || "—",
    city: s.city || "—",
    phone: s.phone || "—",
    primary: s.isMain,
    organizationId: s.organizationId,
    organization: s.organization?.name || "—",
    isActive: s.isActive,
  }));

  return NextResponse.json(ui);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.name || !body.organizationId) {
    return NextResponse.json(
      { error: "Champs requis manquants (name, organizationId)" },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.site.create({
      data: {
        name: body.name,
        organizationId: body.organizationId,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        postalCode: body.postalCode || null,
        country: body.country || null,
        phone: body.phone || null,
        isMain: body.primary ?? false,
      },
      include: { organization: { select: { id: true, name: true } } },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de création" },
      { status: 500 }
    );
  }
}
