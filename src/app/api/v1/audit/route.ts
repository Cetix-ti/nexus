import { NextResponse } from "next/server";
import { listAudit, logAudit } from "@/lib/audit/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json(
    await listAudit({
      organizationId: url.searchParams.get("organizationId") || undefined,
      entityType: url.searchParams.get("entityType") || undefined,
      entityId: url.searchParams.get("entityId") || undefined,
      limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined,
    })
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.action) return NextResponse.json({ error: "action requise" }, { status: 400 });
  return NextResponse.json(await logAudit(body), { status: 201 });
}
