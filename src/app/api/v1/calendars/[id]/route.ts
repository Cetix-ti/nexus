import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/** PATCH — rename/recolor a calendar (MSP_ADMIN+ only).
 *  Les calendriers système (RENEWALS/LEAVE/GENERAL) peuvent être renommés
 *  et recolorés mais pas désactivés. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.calendar.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Nom vide" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if ("description" in body) data.description = body.description;
  if ("color" in body) data.color = body.color;
  if ("visibility" in body && ["team", "private"].includes(body.visibility)) {
    data.visibility = body.visibility;
  }
  if ("isActive" in body) {
    // Les calendriers système ne peuvent pas être désactivés : l'UI
    // s'appuie dessus (création automatique d'events LEAVE/RENEWAL).
    const isSystem = ["RENEWALS", "LEAVE", "GENERAL"].includes(existing.kind);
    if (isSystem && body.isActive === false) {
      return NextResponse.json(
        { error: "Les calendriers système ne peuvent pas être désactivés" },
        { status: 400 },
      );
    }
    data.isActive = body.isActive;
  }
  const updated = await prisma.calendar.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/** DELETE — retire un calendrier CUSTOM (les systèmes sont protégés).
 *  Cascade Prisma sur CalendarEvent → supprime aussi tous les events. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.calendar.findUnique({
    where: { id },
    select: { kind: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (["RENEWALS", "LEAVE", "GENERAL"].includes(existing.kind)) {
    return NextResponse.json(
      { error: "Calendrier système — non supprimable" },
      { status: 400 },
    );
  }
  await prisma.calendar.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
