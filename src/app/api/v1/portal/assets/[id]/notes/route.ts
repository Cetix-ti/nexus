import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify asset belongs to this org
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Portal users only see public notes
  const notes = await prisma.assetNote.findMany({
    where: { assetId: id, isPrivate: false },
    include: {
      author: { select: { firstName: true, lastName: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    notes.map((n) => ({
      id: n.id,
      body: n.body,
      isPrivate: n.isPrivate,
      authorName: n.author
        ? `${n.author.firstName} ${n.author.lastName}`
        : n.contact
          ? `${n.contact.firstName} ${n.contact.lastName}`
          : "Système",
      createdAt: n.createdAt.toISOString(),
    })),
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.portalRole !== "ADMIN" && !user.permissions.canManageAssets) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { body: noteBody } = await req.json();
  if (!noteBody?.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 422 });
  }

  const note = await prisma.assetNote.create({
    data: {
      assetId: id,
      contactId: user.contactId,
      body: noteBody.trim(),
      isPrivate: false, // Portal users can only create public notes
    },
  });

  return NextResponse.json(note, { status: 201 });
}
