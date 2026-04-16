// POST /api/v1/backup-templates/[id]/convert
// Convertit un template (colonne 1) en vrai Ticket (colonne 2).
// Utilise les settings backup-kanban pour la catégorie / priorité, et
// génère la description depuis la liste des jobs en échec du template.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { convertTemplateToTicket } from "@/lib/backup-kanban/service";

export async function POST(
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
    const res = await convertTemplateToTicket(id, me.id);
    return NextResponse.json(res, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
