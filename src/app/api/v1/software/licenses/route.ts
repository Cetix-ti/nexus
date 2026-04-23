import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, SoftwareLicenseScope } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const SCOPES: SoftwareLicenseScope[] = ["GLOBAL_POOL", "ORG", "PER_SEAT", "PER_USER"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = {};
  const instanceId = searchParams.get("instanceId");
  const templateId = searchParams.get("templateId");
  const orgId = searchParams.get("orgId");
  if (instanceId) where.softwareInstanceId = instanceId;
  if (templateId) where.softwareTemplateId = templateId;
  if (orgId) where.organizationId = orgId;

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
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const scope = body?.scope as SoftwareLicenseScope;
  if (!SCOPES.includes(scope)) return NextResponse.json({ error: "scope invalide" }, { status: 400 });

  // Validation cohérence scope → liens requis
  if (scope === "PER_USER" && !body?.contactId) return NextResponse.json({ error: "contactId requis pour PER_USER" }, { status: 400 });
  if (scope === "PER_SEAT" && !body?.assetId) return NextResponse.json({ error: "assetId requis pour PER_SEAT" }, { status: 400 });
  if (scope === "ORG" && !body?.organizationId) return NextResponse.json({ error: "organizationId requis pour ORG" }, { status: 400 });

  const created = await prisma.softwareLicense.create({
    data: {
      scope,
      softwareTemplateId: body?.softwareTemplateId || null,
      softwareInstanceId: body?.softwareInstanceId || null,
      organizationId: body?.organizationId || null,
      contactId: body?.contactId || null,
      assetId: body?.assetId || null,
      contractId: body?.contractId || null,
      licenseKey: body?.licenseKey || null,
      seats: body?.seats ?? null,
      usedSeats: body?.usedSeats ?? null,
      startDate: body?.startDate ? new Date(body.startDate) : null,
      endDate: body?.endDate ? new Date(body.endDate) : null,
      notes: body?.notes || null,
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      createdByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
