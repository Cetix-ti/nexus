import { NextResponse } from "next/server";
import { updateArticle, deleteArticle } from "@/lib/kb/service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updated = await updateArticle(id, body);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteArticle(id);
  return NextResponse.json({ ok: true });
}
