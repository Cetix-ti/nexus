import { NextRequest, NextResponse } from "next/server";
import { syncVeeamAlerts } from "@/lib/veeam/graph-sync";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Authenticated via cron secret
  } else {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
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
