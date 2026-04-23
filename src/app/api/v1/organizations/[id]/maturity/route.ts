import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { computeMaturity } from "@/lib/maturity/checks";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const report = await computeMaturity(id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(report);
}
