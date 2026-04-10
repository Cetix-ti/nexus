import { NextResponse } from "next/server";
import { updateRule, deleteRule } from "@/lib/automations/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await updateRule(id, await req.json()));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteRule(id);
  return NextResponse.json({ ok: true });
}
