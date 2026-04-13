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
 * GET /api/v1/settings/regional
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  const settings = await getSetting("regional");
  return NextResponse.json(settings);
}

/**
 * PATCH /api/v1/settings/regional
 * Body: { timezone?, language?, dateFormat? }
 */
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();

  let body: { timezone?: string; language?: string; dateFormat?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<{ timezone: string; language: string; dateFormat: string }> = {};
  if (body.timezone !== undefined) patch.timezone = body.timezone;
  if (body.language !== undefined) patch.language = body.language;
  if (body.dateFormat !== undefined) patch.dateFormat = body.dateFormat;

  const updated = await setSetting("regional", patch);
  return NextResponse.json(updated);
}
