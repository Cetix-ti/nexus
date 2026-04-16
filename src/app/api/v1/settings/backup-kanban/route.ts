import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/tenant-settings/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/**
 * GET /api/v1/settings/backup-kanban
 * Retourne la config actuelle du Kanban /backups (title pattern, catégorie,
 * sous-catégorie, priorité, fenêtre de lookback).
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getSetting("backup-kanban");
  return NextResponse.json(settings);
}

/**
 * PATCH /api/v1/settings/backup-kanban
 * Réservé aux admins MSP+. On accepte un payload partiel — chaque champ
 * peut être modifié indépendamment. Le merge est fait par `setSetting`.
 */
export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    titlePattern?: string;
    categoryId?: string | null;
    subcategoryId?: string | null;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    lookbackDays?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validation souple — on valide seulement les champs fournis.
  if (
    body.titlePattern !== undefined &&
    (typeof body.titlePattern !== "string" || body.titlePattern.trim().length === 0)
  ) {
    return NextResponse.json(
      { error: "titlePattern doit être une chaîne non vide" },
      { status: 400 },
    );
  }
  if (body.priority && !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.priority)) {
    return NextResponse.json({ error: "priorité invalide" }, { status: 400 });
  }
  if (body.lookbackDays !== undefined) {
    const n = Number(body.lookbackDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      return NextResponse.json(
        { error: "lookbackDays doit être entre 1 et 365" },
        { status: 400 },
      );
    }
    body.lookbackDays = n;
  }

  const updated = await setSetting("backup-kanban", body);
  return NextResponse.json(updated);
}
