import { NextResponse } from "next/server";
import { updateAsset, deleteAsset } from "@/lib/assets/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await updateAsset(id, await req.json()));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteAsset(id);
  return NextResponse.json({ ok: true });
}
