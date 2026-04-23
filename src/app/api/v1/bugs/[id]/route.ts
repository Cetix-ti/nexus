// GET/PATCH d'un bug report.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import type { BugStatus, BugSeverity } from "@prisma/client";

const SEVERITIES: BugSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: BugStatus[] = ["NEW", "TRIAGED", "APPROVED_FOR_FIX", "FIX_IN_PROGRESS", "FIX_PROPOSED", "FIXED", "REJECTED", "DUPLICATE"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const bug = await prisma.bugReport.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { firstName: true, lastName: true } },
      rejectedBy: { select: { firstName: true, lastName: true } },
      fixAttempts: { orderBy: { startedAt: "desc" } },
      comments: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { firstName: true, lastName: true } } },
      },
      duplicateOf: { select: { id: true, title: true } },
    },
  });
  if (!bug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bug);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 200);
  if (typeof body.description === "string") data.description = body.description.slice(0, 10_000);
  if ("stepsToReproduce" in body) data.stepsToReproduce = body.stepsToReproduce ? String(body.stepsToReproduce).slice(0, 5000) : null;
  if (SEVERITIES.includes(body?.severity)) data.severity = body.severity;
  if (STATUSES.includes(body?.status)) data.status = body.status;
  if ("assignedToUserId" in body) data.assignedToUserId = body.assignedToUserId || null;
  if ("duplicateOfId" in body) data.duplicateOfId = body.duplicateOfId || null;

  const updated = await prisma.bugReport.update({ where: { id }, data });
  return NextResponse.json(updated);
}
