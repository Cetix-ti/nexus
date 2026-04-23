// Reveal de la licenseKey en clair — explicite, audité, staff MSP uniquement.
// Les listes et détail standards renvoient la clé masquée. Ce endpoint est
// appelé par l'UI quand l'utilisateur clique "Afficher la clé".

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import { assertSameOrg } from "@/lib/auth/org-access";
import { decryptField } from "@/lib/crypto/field-crypto";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const lic = await prisma.softwareLicense.findUnique({
    where: { id },
    select: { licenseKey: true, organizationId: true, instance: { select: { organizationId: true } } },
  });
  if (!lic) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const orgId = lic.organizationId ?? lic.instance?.organizationId ?? null;
  const guard = await assertSameOrg(me, orgId);
  if (!guard.ok) return guard.res;

  const cleartext = decryptField(lic.licenseKey);

  // AuditLog systématique — trace qui a révélé quelle clé.
  try {
    await prisma.auditLog.create({
      data: {
        action: "software.license.reveal",
        entityType: "SoftwareLicense",
        entityId: id,
        userId: me.id,
        userEmail: me.email,
        organizationId: orgId,
      },
    });
  } catch { /* non bloquant */ }

  return NextResponse.json({ licenseKey: cleartext });
}
