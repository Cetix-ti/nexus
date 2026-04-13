import { NextRequest, NextResponse } from "next/server";
import { listOrganizations, createOrganization } from "@/lib/orgs/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = req.nextUrl.searchParams.get("search") || undefined;
  const orgs = await listOrganizations(search);
  return NextResponse.json(orgs);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name requis" }, { status: 400 });
  const created = await createOrganization(body);
  return NextResponse.json(created, { status: 201 });
}
