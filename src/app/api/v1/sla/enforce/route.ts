import { NextResponse } from "next/server";
import { enforceSla } from "@/lib/sla/service";

/**
 * POST /api/v1/sla/enforce
 * Runs the SLA enforcement engine across all open tickets.
 * Can be called by a cron job (e.g., every 10 minutes) or manually.
 *
 * Security: accepts a bearer token from env (CRON_SECRET) for
 * headless cron calls, or falls back to session auth.
 */
export async function POST(req: Request) {
  // Allow cron calls with a shared secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Authenticated via cron secret
  } else {
    // Fallback: require admin session
    const { getCurrentUser, hasMinimumRole } = await import("@/lib/auth-utils");
    const me = await getCurrentUser();
    if (!me || !hasMinimumRole(me.role, "MSP_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await enforceSla();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SLA enforcement failed" },
      { status: 500 },
    );
  }
}
