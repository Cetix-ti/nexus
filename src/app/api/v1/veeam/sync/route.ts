import { NextResponse } from "next/server";
import { syncVeeamAlerts } from "@/lib/veeam/graph-sync";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    // sinceDays: number of days to import (0 = all history, undefined = incremental)
    const sinceDays =
      typeof body?.sinceDays === "number" ? body.sinceDays : undefined;
    const result = await syncVeeamAlerts(null, { sinceDays });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        fetched: 0,
        newAlerts: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      },
      { status: 500 },
    );
  }
}
