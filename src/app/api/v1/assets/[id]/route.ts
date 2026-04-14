import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateAsset, deleteAsset } from "@/lib/assets/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      site: { select: { id: true, name: true } },
      assignedContact: { select: { id: true, firstName: true, lastName: true, email: true } },
      assetNotes: {
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { firstName: true, lastName: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
      },
      tickets: {
        include: {
          ticket: { select: { id: true, number: true, subject: true, status: true } },
        },
      },
    },
  });
  if (!asset) return NextResponse.json({ error: "Actif introuvable" }, { status: 404 });
  return NextResponse.json(asset);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await updateAsset(id, await req.json()));
  } catch (err) {
    console.error("[assets PATCH]", err);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[assets DELETE]", err);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
