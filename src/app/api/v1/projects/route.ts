import { NextRequest, NextResponse } from "next/server";
import { mockProjects } from "@/lib/projects/mock-data";

/**
 * GET /api/v1/projects
 *
 * Query params:
 * - organizationId: filter by organization
 * - status: filter by status (comma-separated)
 * - managerId: filter by manager
 * - search: search in name/code/description
 * - visibleToClient: only return projects visible to client
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  let result = [...mockProjects];

  const organizationId = sp.get("organizationId");
  if (organizationId) {
    result = result.filter((p) => p.organizationId === organizationId);
  }

  const status = sp.get("status");
  if (status) {
    const statuses = status.split(",");
    result = result.filter((p) => statuses.includes(p.status));
  }

  const managerId = sp.get("managerId");
  if (managerId) {
    result = result.filter((p) => p.managerId === managerId);
  }

  const search = sp.get("search");
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }

  const visibleToClient = sp.get("visibleToClient");
  if (visibleToClient === "true") {
    result = result.filter(
      (p) => p.isVisibleToClient && p.visibilitySettings.showProject
    );
  }

  return NextResponse.json({
    success: true,
    data: result,
    meta: {
      total: result.length,
    },
  });
}

/**
 * POST /api/v1/projects
 * Create a new project (mock — accepts and echoes back)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.name || !body.organizationId) {
    return NextResponse.json(
      { success: false, error: "Missing required fields: name, organizationId" },
      { status: 400 }
    );
  }

  const newProject = {
    id: `prj_${Date.now()}`,
    code: body.code || `PRJ-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
    ...body,
    progressPercent: 0,
    consumedHours: 0,
    consumedAmount: 0,
    phaseCount: 0,
    milestoneCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    linkedTicketCount: 0,
    memberCount: 0,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(
    {
      success: true,
      data: newProject,
    },
    { status: 201 }
  );
}
