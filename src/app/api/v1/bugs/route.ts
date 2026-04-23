// Bug reports — liste + création.
// Création : ouvert à tout user authentifié (agent). Le reporter est auto.
// Liste : tous les bugs visibles aux agents. Les clients portail n'ont pas
// accès à cette route.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import { sendNewBugEmail } from "@/lib/bugs/notifications";
import type { BugSeverity, BugStatus } from "@prisma/client";

const SEVERITIES: BugSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: BugStatus[] = ["NEW", "TRIAGED", "APPROVED_FOR_FIX", "FIX_IN_PROGRESS", "FIX_PROPOSED", "FIXED", "REJECTED", "DUPLICATE"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const where: Record<string, unknown> = {};
  if (status && STATUSES.includes(status as BugStatus)) where.status = status;
  if (severity && SEVERITIES.includes(severity as BugSeverity)) where.severity = severity;

  const items = await prisma.bugReport.findMany({
    where,
    include: {
      reporter: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { comments: true, fixAttempts: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  if (!title || !description) {
    return NextResponse.json({ error: "title et description requis" }, { status: 400 });
  }
  const severity: BugSeverity = SEVERITIES.includes(body?.severity) ? body.severity : "MEDIUM";

  const created = await prisma.bugReport.create({
    data: {
      title: title.slice(0, 200),
      description: description.slice(0, 10_000),
      stepsToReproduce: body?.stepsToReproduce ? String(body.stepsToReproduce).slice(0, 5000) : null,
      severity,
      status: "NEW",
      reporterUserId: me.id,
      reporterEmail: me.email,
      contextUrl: body?.contextUrl ? String(body.contextUrl).slice(0, 500) : null,
      contextMeta: body?.contextMeta ?? null,
      screenshots: Array.isArray(body?.screenshots) ? body.screenshots.slice(0, 5) : null,
      linkedTicketId: body?.linkedTicketId || null,
    },
  });
  // Email non-bloquant pour triage.
  void sendNewBugEmail(created.id).catch((e) => console.error("[bugs] sendNewBugEmail failed", e));
  return NextResponse.json(created, { status: 201 });
}
