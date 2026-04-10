import { NextResponse } from "next/server";
import { getGlobalProfile, setGlobalProfile } from "@/lib/sla/service";

export async function GET() {
  return NextResponse.json(await getGlobalProfile());
}

export async function PUT(req: Request) {
  const body = await req.json();
  return NextResponse.json(await setGlobalProfile(body));
}
