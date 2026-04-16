// PATCH  /api/v1/backup-templates/[id]  → éditer le titre du template
// DELETE /api/v1/backup-templates/[id]  → retirer un template de la colonne 1
//
// Ni l'une ni l'autre ne touche aux tickets colonne 2. Un template n'est
// qu'une carte éditable en staging avant conversion.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.subject !== "string" || !body.subject.trim()) {
    return NextResponse.json({ error: "subject requis" }, { status: 400 });
  }

  try {
    const updated = await prisma.backupTicketTemplate.update({
      where: { id },
      data: { subject: body.subject.trim() },
    });
    return NextResponse.json(updated);
  } catch (e) {
    // Prisma renvoie P2025 si pas trouvé.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Not found" },
      { status: 404 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await prisma.backupTicketTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    // Idempotent : si déjà supprimé, on renvoie quand même ok pour que
    // l'UI n'affiche pas d'erreur bizarre après un double-clic.
    return NextResponse.json({ ok: true });
  }
}
