import { NextRequest, NextResponse } from "next/server";
import { syncEmailsToTickets } from "@/lib/email-to-ticket/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  // Auth: session OR cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Authenticated via cron secret
  } else {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncEmailsToTickets();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { fetched: 0, created: 0, skipped: 0, errors: [err instanceof Error ? err.message : String(err)] },
      { status: 500 },
    );
  }
}
