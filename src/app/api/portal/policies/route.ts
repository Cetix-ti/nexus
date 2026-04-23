// Portail client — expose les PolicyDocuments dont la sous-catégorie N'EST
// PAS dans INTERNAL_ONLY, ET dont la visibilité autorise le rôle portail.
// Les GPO, scripts, KeePass, accès privilégiés ne sont JAMAIS exposés.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { portalVisibilityWhere } from "@/lib/portal/visibility";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

const INTERNAL_ONLY = ["SCRIPT", "PRIVILEGED_ACCESS", "KEEPASS"] as const;

export async function GET() {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!portalUser.permissions.canSeePolicies) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = {
    organizationId: portalUser.organizationId,
    status: "ACTIVE" as const,
    subcategory: { notIn: INTERNAL_ONLY as unknown as never[] },
    ...portalVisibilityWhere(portalUser.portalRole),
  };
  const items = await prisma.policyDocument.findMany({
    where,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      subcategory: true,
      tags: true,
      visibility: true,
      updatedAt: true,
      category: { select: { name: true, icon: true, color: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return NextResponse.json(items);
}
