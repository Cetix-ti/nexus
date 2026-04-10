import { NextResponse } from "next/server";
import { updatePortalUser, deletePortalUser } from "@/lib/portal-access/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await updatePortalUser(id, await req.json()));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deletePortalUser(id);
  return NextResponse.json({ ok: true });
}
