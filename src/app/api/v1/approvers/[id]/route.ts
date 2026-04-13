import { NextResponse } from "next/server";
import { updateApprover, deleteApprover, setPrimary } from "@/lib/approvers/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (body.action === "setPrimary" && body.organizationId) {
    await setPrimary(body.organizationId, id);
    return NextResponse.json({ ok: true });
  }
  const updated = await updateApprover(id, body);
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteApprover(id);
  return NextResponse.json({ ok: true });
}
