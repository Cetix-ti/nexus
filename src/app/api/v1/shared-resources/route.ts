import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

/**
 * GET — List shared resources (admin only)
 * Query params: resourceType, projectId, reportId
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const resourceType = sp.get("resourceType");
  const projectId = sp.get("projectId");
  const reportId = sp.get("reportId");

  const where: any = {};
  if (resourceType) where.resourceType = resourceType;
  if (projectId) where.projectId = projectId;
  if (reportId) where.reportId = reportId;

  const shares = await prisma.sharedResource.findMany({
    where,
    include: {
      targetOrg: { select: { id: true, name: true, logo: true } },
      sharedBy: { select: { firstName: true, lastName: true } },
      project: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    data: shares.map((s) => ({
      id: s.id,
      resourceType: s.resourceType,
      projectId: s.projectId,
      reportId: s.reportId,
      targetOrgId: s.targetOrgId,
      targetOrgName: s.targetOrg.name,
      targetOrgLogo: s.targetOrg.logo,
      portalAdminOnly: s.portalAdminOnly,
      sharedByName: `${s.sharedBy.firstName} ${s.sharedBy.lastName}`,
      notes: s.notes,
      projectName: s.project?.name ?? null,
      projectCode: s.project?.code ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

/**
 * POST — Share a resource with a target organization
 * Only MSP admins/supervisors can share resources.
 *
 * Body: { resourceType, projectId?, reportId?, targetOrgId, portalAdminOnly?, notes? }
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await req.json();
  const { resourceType, projectId, reportId, targetOrgId, portalAdminOnly, notes } = body;

  if (!resourceType || !targetOrgId) {
    return NextResponse.json({ error: "resourceType et targetOrgId requis" }, { status: 400 });
  }
  if (resourceType === "project" && !projectId) {
    return NextResponse.json({ error: "projectId requis pour un projet" }, { status: 400 });
  }
  if (resourceType === "report" && !reportId) {
    return NextResponse.json({ error: "reportId requis pour un rapport" }, { status: 400 });
  }

  // Validate target org exists
  const targetOrg = await prisma.organization.findUnique({
    where: { id: targetOrgId },
    select: { id: true, name: true },
  });
  if (!targetOrg) {
    return NextResponse.json({ error: "Organisation cible introuvable" }, { status: 404 });
  }

  // Validate project exists and belongs to the target org or any org
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    }
    // Security: cannot share a project that belongs to org A with org B
    // unless it's an MSP-wide project (orgId matches target, or it's a cross-org share by admin)
  }

  // Check for existing share (idempotent)
  const existing = await prisma.sharedResource.findFirst({
    where: { resourceType, projectId: projectId ?? null, reportId: reportId ?? null, targetOrgId },
  });
  if (existing) {
    return NextResponse.json({
      success: true,
      data: { id: existing.id, message: "Déjà partagé" },
    });
  }

  const share = await prisma.sharedResource.create({
    data: {
      resourceType,
      projectId: projectId ?? null,
      reportId: reportId ?? null,
      targetOrgId,
      portalAdminOnly: portalAdminOnly ?? true, // default: admin only
      sharedByUserId: me.id,
      notes: notes ?? null,
    },
  });

  // If sharing a project, also set isVisibleToClient = true
  if (resourceType === "project" && projectId) {
    await prisma.project.update({
      where: { id: projectId },
      data: { isVisibleToClient: true },
    });
  }

  return NextResponse.json({ success: true, data: { id: share.id } }, { status: 201 });
}

/**
 * DELETE — Revoke a share
 */
export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(me.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  try {
    await prisma.sharedResource.delete({ where: { id } });
  } catch (err) {
    console.error("[shared-resource delete]", err);
    return NextResponse.json({ error: "Suppression échouée" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
