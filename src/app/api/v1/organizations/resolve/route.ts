import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const org = await prisma.organization.findFirst({
    where: {
      OR: [
        { slug: { equals: slug, mode: "insensitive" } },
        { name: { equals: slug, mode: "insensitive" } },
        { clientCode: { equals: slug, mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(org);
}
