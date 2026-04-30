// ============================================================================
// POST /api/v1/admin/categories/sync   (admin only)
//
// Déclenche un wipe + import des catégories depuis la data table N8N
// `freshservice_ticket_categories`. Action destructive : tous les
// `tickets.category_id` sont mis à null avant la suppression des catégories.
// ============================================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { syncCategoriesFromN8n } from "@/lib/categories/sync-from-n8n";

export const dynamic = "force-dynamic";

export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Réservé aux admins MSP — action destructive sur tout l'arbre catégorie.
  if (me.role !== "SUPER_ADMIN" && me.role !== "MSP_ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin MSP requis" }, { status: 403 });
  }

  try {
    const result = await syncCategoriesFromN8n();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[categories/sync] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
