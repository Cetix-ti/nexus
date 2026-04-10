import { NextResponse } from "next/server";
import { listContacts, createContact } from "@/lib/orgs/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("organizationId") || undefined;
  const contacts = await listContacts(orgId);
  // Flatten to UI shape
  const ui = contacts.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone || "—",
    organization: c.organization?.name || "—",
    organizationId: c.organizationId,
    jobTitle: c.jobTitle || "",
    vip: c.isVIP,
    tickets: 0,
    status: c.isActive ? "Actif" : "Inactif",
    color: "bg-blue-600",
  }));
  return NextResponse.json(ui);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.firstName || !body.lastName || !body.email || !body.organizationId) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  const created = await createContact(body);
  return NextResponse.json(created, { status: 201 });
}
