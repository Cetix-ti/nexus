import { NextResponse } from "next/server";
import { listTemplates, createTemplate } from "@/lib/scheduling/service";

export async function GET() {
  return NextResponse.json(await listTemplates());
}

export async function POST(req: Request) {
  return NextResponse.json(await createTemplate(await req.json()), { status: 201 });
}
