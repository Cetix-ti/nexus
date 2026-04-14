import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createTicket, listTickets } from "@/lib/tickets/service";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

export async function GET(request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.permissions.canAccessPortal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;

  // Query DB with organization filter — no client-side filtering needed
  let result = await listTickets({
    organizationId: user.organizationId,
    status: sp.get("status") || undefined,
    search: sp.get("search") || undefined,
  });

  // Standard users only see their own tickets
  if (!user.permissions.canSeeAllOrgTickets) {
    result = result.filter((t) => t.requesterEmail === user.email);
  }

  return NextResponse.json({
    success: true,
    data: result,
    meta: {
      total: result.length,
      organizationId: user.organizationId,
      scope: user.permissions.canSeeAllOrgTickets ? "all_org" : "own_only",
    },
  });
}

/**
 * POST /api/v1/portal/tickets — portal-side ticket creation.
 * Forces requesterId = current contact and organizationId = contact's org.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.canAccessPortal || !user.permissions.canCreateTickets) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  if (!body.subject || typeof body.subject !== "string") {
    return NextResponse.json({ error: "subject requis" }, { status: 422 });
  }

  // Resolve category by name if provided
  let categoryId: string | null = null;
  if (body.category && typeof body.category === "string") {
    const cat = await prisma.category.findFirst({
      where: { name: { equals: body.category, mode: "insensitive" } },
      select: { id: true },
    });
    categoryId = cat?.id ?? null;
  }

  // Resolve a creator User — portal users don't have User records, so use
  // a system fallback (first active SUPER_ADMIN or MSP_ADMIN).
  let creatorId = "";
  const sysUser = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "MSP_ADMIN"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (sysUser) creatorId = sysUser.id;

  try {
    const ticket = await createTicket({
      subject: body.subject.trim(),
      description: body.description || "",
      status: "NEW",
      priority: (body.priority || "medium").toUpperCase(),
      type: "INCIDENT",
      source: "PORTAL",
      organizationId: user.organizationId,
      requesterId: user.contactId,
      categoryId,
      creatorId,
    });
    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (err) {
    console.error("[portal/tickets POST]", err);
    return NextResponse.json(
      { error: "Erreur lors de la création du ticket" },
      { status: 500 },
    );
  }
}
