import { NextResponse } from "next/server";
import { listApprovers, createApprover } from "@/lib/approvers/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId");
  if (!orgId) return NextResponse.json({ error: "organizationId requis" }, { status: 400 });
  return NextResponse.json(await listApprovers(orgId));
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.organizationId || !body.contactName || !body.contactEmail) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  const created = await createApprover(body);
  return NextResponse.json(created, { status: 201 });
}
