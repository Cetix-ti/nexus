// POST /api/v1/tickets/bulk
// Body: { op: "delete" | "restore" | "purge", ids: string[] }
//
// - delete   : soft-delete (status → DELETED). Récupérable.
// - restore  : remet en NEW depuis la corbeille.
// - purge    : suppression DÉFINITIVE. SUPER_ADMIN uniquement.
//              Cascade sur les dépendances (comments, activities…).

import { NextResponse } from "next/server";
import {
  softDeleteTickets,
  restoreTickets,
  purgeTickets,
} from "@/lib/tickets/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const op = String(body.op || "").toLowerCase();
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string" && !!x)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids requis" }, { status: 400 });
  }

  if (op === "delete") {
    const count = await softDeleteTickets(ids);
    return NextResponse.json({ op, count });
  }
  if (op === "restore") {
    const count = await restoreTickets(ids);
    return NextResponse.json({ op, count });
  }
  if (op === "purge") {
    // Purge = suppression définitive. On la réserve aux SUPER_ADMIN
    // pour éviter qu'un utilisateur mal calibré vide la corbeille sans
    // retour en arrière possible.
    if (!hasMinimumRole(me.role, "SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "Seul un SUPER_ADMIN peut purger la corbeille" },
        { status: 403 },
      );
    }
    const count = await purgeTickets(ids);
    return NextResponse.json({ op, count });
  }

  return NextResponse.json(
    { error: `op invalide : "${op}" (attendu: delete | restore | purge)` },
    { status: 400 },
  );
}
