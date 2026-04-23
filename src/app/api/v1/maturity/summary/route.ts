import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { summarizeAllOrgs } from "@/lib/maturity/checks";

export const maxDuration = 60;

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await summarizeAllOrgs();
  return NextResponse.json(summary);
}
