import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/tenant-settings/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * GET /api/v1/settings/tickets
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const settings = await getSetting("tickets");
  return NextResponse.json(settings);
}

/**
 * PATCH /api/v1/settings/tickets
 * Body: { numberingPrefix?, defaultPriority?, defaultQueue?, autoCloseDays? }
 */
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();

  let body: {
    numberingPrefix?: string;
    defaultPriority?: string;
    defaultQueue?: string;
    autoCloseDays?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<{
    numberingPrefix: string;
    defaultPriority: string;
    defaultQueue: string;
    autoCloseDays: number;
  }> = {};
  if (body.numberingPrefix !== undefined) patch.numberingPrefix = body.numberingPrefix.slice(0, 20);
  if (body.defaultPriority !== undefined) patch.defaultPriority = body.defaultPriority;
  if (body.defaultQueue !== undefined) patch.defaultQueue = body.defaultQueue;
  if (body.autoCloseDays !== undefined) patch.autoCloseDays = Math.max(1, Math.floor(body.autoCloseDays));

  const updated = await setSetting("tickets", patch);
  return NextResponse.json(updated);
}
