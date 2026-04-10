import { NextResponse } from "next/server";
import { updateBoard, deleteBoard } from "@/lib/kanban-boards/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await updateBoard(id, await req.json()));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteBoard(id);
  return NextResponse.json({ ok: true });
}
