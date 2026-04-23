import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ChangeCategory, ChangeStatus, ChangeImpact, ContentVisibility } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const CATEGORIES: ChangeCategory[] = [
  "INFRASTRUCTURE", "NETWORK_SECURITY", "IDENTITY_ACCESS", "M365_CLOUD",
  "SOFTWARE", "BACKUPS", "WORKSTATIONS", "TELECOM_PRINT", "CONTRACTS",
  "ORGANIZATIONAL", "OTHER",
];
const STATUSES: ChangeStatus[] = ["AI_SUGGESTED", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"];
const IMPACTS: ChangeImpact[] = ["MINOR", "MODERATE", "MAJOR", "STRUCTURAL"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const status = searchParams.get("status") as ChangeStatus | null;
  const category = searchParams.get("category") as ChangeCategory | null;
  const impact = searchParams.get("impact") as ChangeImpact | null;
  const excludeSuggested = searchParams.get("excludeSuggested") === "true";

  const where: Record<string, unknown> = { mergedIntoId: null };
  if (orgId) where.organizationId = orgId;
  if (status && STATUSES.includes(status)) where.status = status;
  else if (excludeSuggested) where.status = { notIn: ["AI_SUGGESTED"] };
  if (category && CATEGORIES.includes(category)) where.category = category;
  if (impact && IMPACTS.includes(impact)) where.impact = impact;

  const items = await prisma.change.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      author: { select: { firstName: true, lastName: true } },
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ changeDate: "desc" }],
    take: 300,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const organizationId = String(body?.organizationId ?? "");
  const title = String(body?.title ?? "").trim();
  const category = body?.category as ChangeCategory;
  if (!organizationId || !title || !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "organizationId, title et category requis" }, { status: 400 });
  }
  const impact = IMPACTS.includes(body?.impact) ? body.impact : "MODERATE";
  const created = await prisma.change.create({
    data: {
      organizationId,
      title,
      summary: body?.summary || null,
      body: body?.body || "",
      category,
      impact,
      status: body?.status && STATUSES.includes(body.status) ? body.status : "APPROVED",
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      changeDate: body?.changeDate ? new Date(body.changeDate) : new Date(),
      manualEntry: true,
      authorId: me.id,
      exposeToClientAdmin: Boolean(body?.exposeToClientAdmin),
      linkedTicketIds: Array.isArray(body?.linkedTicketIds) ? body.linkedTicketIds.map(String) : [],
      linkedAssetIds: Array.isArray(body?.linkedAssetIds) ? body.linkedAssetIds.map(String) : [],
      linkedSoftwareIds: Array.isArray(body?.linkedSoftwareIds) ? body.linkedSoftwareIds.map(String) : [],
      linkedPolicyIds: Array.isArray(body?.linkedPolicyIds) ? body.linkedPolicyIds.map(String) : [],
      linkedParticularityIds: Array.isArray(body?.linkedParticularityIds) ? body.linkedParticularityIds.map(String) : [],
    },
  });
  return NextResponse.json(created, { status: 201 });
}
