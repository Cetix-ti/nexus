import { NextResponse } from "next/server";
import { updateRule, deleteRule } from "@/lib/automations/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

// Mutations d'automations : MSP_ADMIN+ (règles globales sensibles).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  return NextResponse.json(await updateRule(id, await req.json()));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await deleteRule(id);
  return NextResponse.json({ ok: true });
}
