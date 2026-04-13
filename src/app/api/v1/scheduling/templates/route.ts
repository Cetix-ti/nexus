import { NextResponse } from "next/server";
import { listTemplates, createTemplate } from "@/lib/scheduling/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listTemplates());
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await createTemplate(await req.json()), { status: 201 });
}
