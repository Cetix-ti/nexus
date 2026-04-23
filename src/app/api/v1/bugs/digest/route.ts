// POST /api/v1/bugs/digest?force=1 — déclenche manuellement l'envoi du
// digest quotidien. Utile pour tester sans attendre le cron. Admin-only.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { sendDailyDigestEmail } from "@/lib/bugs/notifications";

const ADMIN_ROLES = ["SUPER_ADMIN", "MSP_ADMIN"] as const;

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as readonly string[]).includes(me.role)) {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1";
  const result = await sendDailyDigestEmail({ force });
  return NextResponse.json(result);
}
