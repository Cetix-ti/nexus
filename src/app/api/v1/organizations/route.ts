import { NextResponse } from "next/server";
import { listOrganizations, createOrganization } from "@/lib/orgs/service";

export async function GET() {
  const orgs = await listOrganizations();
  return NextResponse.json(orgs);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name requis" }, { status: 400 });
  const created = await createOrganization(body);
  return NextResponse.json(created, { status: 201 });
}
