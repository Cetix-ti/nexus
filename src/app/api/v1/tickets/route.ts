import { NextResponse } from "next/server";
import { listTickets, createTicket } from "@/lib/tickets/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickets = await listTickets({
    organizationId: url.searchParams.get("organizationId") || undefined,
    status: url.searchParams.get("status") || undefined,
    search: url.searchParams.get("q") || undefined,
  });
  return NextResponse.json(tickets);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.subject || !body.organizationId || !body.creatorId) {
    return NextResponse.json(
      { error: "subject, organizationId et creatorId sont requis" },
      { status: 400 }
    );
  }
  const created = await createTicket(body);
  return NextResponse.json(created, { status: 201 });
}
