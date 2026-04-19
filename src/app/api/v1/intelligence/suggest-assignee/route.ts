// ============================================================================
// GET /api/v1/intelligence/suggest-assignee?categoryId=...
// GET /api/v1/intelligence/suggest-assignee?categoryName=...
//
// Suggestion d'assignataire PRÉ-CRÉATION : utilisable depuis le formulaire
// new-ticket avant qu'un ticket n'existe. Retourne les 5 meilleurs techs
// combinant expertise de la catégorie × disponibilité courante.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { suggestAssigneesForCategory } from "@/lib/ai/jobs/workload-optimizer";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  let categoryId = url.searchParams.get("categoryId");
  const categoryName = url.searchParams.get("categoryName");
  if (!categoryId && categoryName) {
    const cat = await prisma.category.findFirst({
      where: { name: categoryName, isActive: true },
      select: { id: true },
    });
    if (!cat) return NextResponse.json({ suggestions: [] });
    categoryId = cat.id;
  }
  if (!categoryId) {
    return NextResponse.json(
      { error: "categoryId or categoryName required" },
      { status: 400 },
    );
  }

  const suggestions = await suggestAssigneesForCategory(categoryId);
  return NextResponse.json({ suggestions });
}
