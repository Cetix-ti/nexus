import { NextResponse } from "next/server";
import { listRules, createRule } from "@/lib/automations/service";

export async function GET() {
  return NextResponse.json(await listRules());
}

export async function POST(req: Request) {
  return NextResponse.json(await createRule(await req.json()), { status: 201 });
}
