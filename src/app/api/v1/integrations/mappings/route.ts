import { NextResponse } from "next/server";
import { getOrgMapping, setOrgMapping, deleteOrgMapping } from "@/lib/assets/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId");
  const provider = url.searchParams.get("provider");
  if (!orgId || !provider) return NextResponse.json({ error: "organizationId + provider requis" }, { status: 400 });
  return NextResponse.json(await getOrgMapping(orgId, provider));
}

export async function POST(req: Request) {
  const body = await req.json();
  return NextResponse.json(await setOrgMapping(body));
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId");
  const provider = url.searchParams.get("provider");
  if (!orgId || !provider) return NextResponse.json({ error: "organizationId + provider requis" }, { status: 400 });
  await deleteOrgMapping(orgId, provider);
  return NextResponse.json({ ok: true });
}
