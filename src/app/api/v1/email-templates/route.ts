import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/**
 * GET /api/v1/email-templates
 *
 * Liste tous les templates email persistés. Accessible MSP_ADMIN+ (admin
 * settings — modifie le contenu envoyé à tous les utilisateurs).
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.emailTemplate.findMany({
    orderBy: [{ audience: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(templates);
}
