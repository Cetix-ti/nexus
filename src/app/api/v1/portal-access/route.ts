import { NextResponse } from "next/server";
import { listPortalUsers, createPortalUser } from "@/lib/portal-access/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId") || undefined;
  return NextResponse.json(await listPortalUsers(orgId));
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.organizationId || !body.email || !body.name) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  return NextResponse.json(await createPortalUser(body), { status: 201 });
}
