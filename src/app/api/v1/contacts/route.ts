import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { listContacts, createContact } from "@/lib/orgs/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Les CLIENT_* n'ont aucun accès à la liste globale — ils utilisent
  // leurs propres endpoints `/api/v1/portal/*`.
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId") || undefined;
  const contacts = await listContacts(orgId);

  // Get ticket counts per contact in one query
  const ticketCounts = await prisma.ticket.groupBy({
    by: ["requesterId"],
    where: { requesterId: { not: null } },
    _count: true,
  });
  const countMap = new Map(
    ticketCounts.map((tc: any) => [tc.requesterId!, typeof tc._count === "number" ? tc._count : 0]),
  );

  const ui = contacts.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone || "—",
    organization: c.organization?.name || "—",
    organizationId: c.organizationId,
    organizationName: c.organization?.name || "—",
    jobTitle: c.jobTitle || "",
    vip: c.isVIP,
    tickets: countMap.get(c.id) ?? 0,
    portalEnabled: c.portalEnabled,
    status: c.isActive ? "Actif" : "Inactif",
  }));
  return NextResponse.json(ui);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Création de contact : TECHNICIAN+ (pas de CLIENT_*).
  if (!hasMinimumRole(me.role, "TECHNICIAN") || me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.firstName || !body.lastName || !body.email || !body.organizationId) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  const created = await createContact(body);
  return NextResponse.json(created, { status: 201 });
}
