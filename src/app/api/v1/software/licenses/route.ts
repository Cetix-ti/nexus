import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { assertUserOrgAccess, getAccessibleOrgIds } from "@/lib/auth/org-access";
import { encryptField, maskSecret } from "@/lib/crypto/field-crypto";
import type { ContentVisibility, SoftwareLicenseScope } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const SCOPES: SoftwareLicenseScope[] = ["GLOBAL_POOL", "ORG", "PER_SEAT", "PER_USER"];

// Liste : on retourne la clé masquée uniquement ; jamais la valeur en clair.
function redactLicense<T extends { licenseKey: string | null }>(l: T): T {
  return { ...l, licenseKey: maskSecret(l.licenseKey) } as T;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = {};
  const instanceId = searchParams.get("instanceId");
  const templateId = searchParams.get("templateId");
  const orgId = searchParams.get("orgId");

  if (instanceId) {
    const inst = await prisma.softwareInstance.findUnique({ where: { id: instanceId }, select: { organizationId: true } });
    if (!inst) return NextResponse.json({ error: "Instance introuvable" }, { status: 404 });
    const guard = await assertUserOrgAccess(me, inst.organizationId);
    if (!guard.ok) return guard.res;
    where.softwareInstanceId = instanceId;
  } else if (orgId) {
    const guard = await assertUserOrgAccess(me, orgId);
    if (!guard.ok) return guard.res;
    where.organizationId = orgId;
  } else if (templateId) {
    // Templates are cross-org — only staff should query them without scope.
    const accessible = await getAccessibleOrgIds(me);
    if (accessible !== null) {
      return NextResponse.json({ error: "Scope org requis" }, { status: 400 });
    }
    where.softwareTemplateId = templateId;
  } else {
    // Sans filtre, limiter aux orgs accessibles pour les clients.
    const accessible = await getAccessibleOrgIds(me);
    if (accessible !== null) {
      if (accessible.length === 0) return NextResponse.json([]);
      where.organizationId = { in: accessible };
    }
  }

  const items = await prisma.softwareLicense.findMany({
    where,
    include: {
      template: { select: { id: true, name: true } },
      instance: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      asset: { select: { id: true, name: true } },
      contract: { select: { id: true, name: true } },
    },
    orderBy: [{ endDate: "asc" }],
    take: 200,
  });
  return NextResponse.json(items.map(redactLicense));
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const scope = body?.scope as SoftwareLicenseScope;
  if (!SCOPES.includes(scope)) return NextResponse.json({ error: "scope invalide" }, { status: 400 });

  if (scope === "PER_USER" && !body?.contactId) return NextResponse.json({ error: "contactId requis pour PER_USER" }, { status: 400 });
  if (scope === "PER_SEAT" && !body?.assetId) return NextResponse.json({ error: "assetId requis pour PER_SEAT" }, { status: 400 });
  if (scope === "ORG" && !body?.organizationId) return NextResponse.json({ error: "organizationId requis pour ORG" }, { status: 400 });

  // Détermine l'org effective pour vérif + cohérence contact/asset.
  let effectiveOrgId: string | null = body?.organizationId || null;
  if (body?.softwareInstanceId) {
    const inst = await prisma.softwareInstance.findUnique({ where: { id: body.softwareInstanceId }, select: { organizationId: true } });
    if (!inst) return NextResponse.json({ error: "Instance introuvable" }, { status: 404 });
    effectiveOrgId = effectiveOrgId ?? inst.organizationId;
    if (effectiveOrgId !== inst.organizationId) {
      return NextResponse.json({ error: "organizationId incohérent avec l'instance" }, { status: 400 });
    }
  }
  if (effectiveOrgId) {
    const guard = await assertUserOrgAccess(me, effectiveOrgId);
    if (!guard.ok) return guard.res;
  }

  // Cohérence contactId ↔ org.
  if (body?.contactId) {
    const c = await prisma.contact.findUnique({ where: { id: body.contactId }, select: { organizationId: true } });
    if (!c) return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    if (effectiveOrgId && c.organizationId !== effectiveOrgId) {
      return NextResponse.json({ error: "Contact n'appartient pas à l'organisation" }, { status: 400 });
    }
  }
  if (body?.assetId) {
    const a = await prisma.asset.findUnique({ where: { id: body.assetId }, select: { organizationId: true } });
    if (!a) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });
    if (effectiveOrgId && a.organizationId !== effectiveOrgId) {
      return NextResponse.json({ error: "Asset n'appartient pas à l'organisation" }, { status: 400 });
    }
  }

  const created = await prisma.softwareLicense.create({
    data: {
      scope,
      softwareTemplateId: body?.softwareTemplateId || null,
      softwareInstanceId: body?.softwareInstanceId || null,
      organizationId: body?.organizationId || null,
      contactId: body?.contactId || null,
      assetId: body?.assetId || null,
      contractId: body?.contractId || null,
      licenseKey: encryptField(body?.licenseKey || null),
      seats: body?.seats ?? null,
      usedSeats: body?.usedSeats ?? null,
      startDate: body?.startDate ? new Date(body.startDate) : null,
      endDate: body?.endDate ? new Date(body.endDate) : null,
      notes: body?.notes || null,
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      createdByUserId: me.id,
    },
  });
  return NextResponse.json(redactLicense(created), { status: 201 });
}
