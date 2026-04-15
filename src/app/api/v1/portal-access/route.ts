import { NextResponse } from "next/server";
import { listPortalUsers, createPortalUser } from "@/lib/portal-access/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

// Gestion des accès portail = création/lecture de comptes utilisateurs
// client. Réservé aux agents MSP (MSP_ADMIN+). Aucun CLIENT_* ne peut
// créer d'autres comptes — il passerait par l'endpoint portail qui est
// scopé à sa propre org.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId") || undefined;
  return NextResponse.json(await listPortalUsers(orgId));
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.organizationId || !body.email || !body.name) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  return NextResponse.json(await createPortalUser(body), { status: 201 });
}
