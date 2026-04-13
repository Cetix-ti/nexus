import { NextResponse } from "next/server";
import { getOrgOverride, setOrgOverride, deleteOrgOverride } from "@/lib/sla/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const profile = await getOrgOverride(orgId);
  if (!profile) return NextResponse.json(null);
  return NextResponse.json(profile);
}

export async function PUT(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const body = await req.json();
  return NextResponse.json(await setOrgOverride(orgId, body));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  await deleteOrgOverride(orgId);
  return NextResponse.json({ ok: true });
}
