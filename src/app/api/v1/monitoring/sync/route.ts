import { NextResponse } from "next/server";
import { syncMonitoringAlerts } from "@/lib/monitoring/email-sync";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sinceDays = typeof body?.sinceDays === "number" ? body.sinceDays : undefined;
    const result = await syncMonitoringAlerts(null, { sinceDays });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { fetched: 0, created: 0, resolved: 0, skipped: 0, errors: [err instanceof Error ? err.message : String(err)] },
      { status: 500 },
    );
  }
}
