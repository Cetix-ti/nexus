import { NextResponse } from "next/server";
import { updateTemplate, deleteTemplate } from "@/lib/scheduling/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await updateTemplate(id, await req.json()));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
