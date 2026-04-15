import { NextResponse } from "next/server";
import { listRules, createRule } from "@/lib/automations/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

// Les automations sont des règles GLOBALES (triggers + actions) qui affectent
// tous les tickets/organisations. Seuls SUPERVISOR+ peuvent les lire/créer
// pour éviter qu'un CLIENT_USER ou TECHNICIAN puisse modifier les flux
// automatiques qui touchent toute la plateforme.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await listRules());
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await createRule(await req.json()), { status: 201 });
}
