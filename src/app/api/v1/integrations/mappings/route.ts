import { NextResponse } from "next/server";
import { getOrgMapping, setOrgMapping, deleteOrgMapping } from "@/lib/assets/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId");
  const provider = url.searchParams.get("provider");
  if (!orgId || !provider) return NextResponse.json({ error: "organizationId + provider requis" }, { status: 400 });

  const mapping = await getOrgMapping(orgId, provider);
  return NextResponse.json(mapping || { externalId: null, externalName: null });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  return NextResponse.json(await setOrgMapping(body));
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId");
  const provider = url.searchParams.get("provider");
  if (!orgId || !provider) return NextResponse.json({ error: "organizationId + provider requis" }, { status: 400 });
  await deleteOrgMapping(orgId, provider);
  return NextResponse.json({ ok: true });
}
