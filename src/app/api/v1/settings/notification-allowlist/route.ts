// ============================================================================
// GET / PUT /api/v1/settings/notification-allowlist
// Liste blanche des courriels de contacts autorisés à recevoir des
// notifications pendant la phase de développement (cohabitation Freshservice).
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";
import {
  getAllowlist,
  saveAllowlist,
  type NotificationAllowlist,
} from "@/lib/notifications/allowlist";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cfg = await getAllowlist();
  return NextResponse.json(cfg);
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<NotificationAllowlist>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validation légère : on accepte enabled:boolean + allowedEmails:string[].
  // La normalisation (lowercase, trim, dedup, filter invalid) est faite
  // par saveAllowlist().
  const patch: Partial<NotificationAllowlist> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (Array.isArray(body.allowedEmails)) {
    patch.allowedEmails = body.allowedEmails.filter(
      (e): e is string => typeof e === "string",
    );
  }

  const actor = `${me.firstName} ${me.lastName}`.trim() || me.email || me.id;
  const updated = await saveAllowlist(patch, actor);
  return NextResponse.json(updated);
}
