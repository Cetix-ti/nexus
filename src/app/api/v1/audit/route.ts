import { NextResponse } from "next/server";
import { listAudit, logAudit } from "@/lib/audit/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.action) return NextResponse.json({ error: "action requise" }, { status: 400 });
  return NextResponse.json(await logAudit(body), { status: 201 });
}
