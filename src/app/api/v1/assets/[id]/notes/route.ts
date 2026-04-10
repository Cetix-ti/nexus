import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

/** GET — all notes for an asset (MSP agents see both public and private) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const notes = await prisma.assetNote.findMany({
    where: { assetId: id },
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
      authorType: n.authorId ? "agent" : "contact",
      createdAt: n.createdAt.toISOString(),
    })),
  );
}

/** POST — create a note on an asset (MSP agents can create public or private) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { body: noteBody, isPrivate } = await req.json();
  if (!noteBody?.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 422 });
  }

  const note = await prisma.assetNote.create({
    data: {
      assetId: id,
      authorId: me.id,
      body: noteBody.trim(),
      isPrivate: isPrivate === true,
    },
  });

  return NextResponse.json(note, { status: 201 });
}
