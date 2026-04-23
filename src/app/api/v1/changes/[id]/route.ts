// Sensitive categories that must stay INTERNAL (règle dure).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, ChangeStatus, ChangeCategory, ChangeImpact } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const STATUSES: ChangeStatus[] = ["AI_SUGGESTED", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"];
const CATEGORIES: ChangeCategory[] = [
  "INFRASTRUCTURE", "NETWORK_SECURITY", "IDENTITY_ACCESS", "M365_CLOUD",
  "SOFTWARE", "BACKUPS", "WORKSTATIONS", "TELECOM_PRINT", "CONTRACTS",
  "ORGANIZATIONAL", "OTHER",
];
const IMPACTS: ChangeImpact[] = ["MINOR", "MODERATE", "MAJOR", "STRUCTURAL"];

// Catégories techniques sensibles : jamais exposables au client.
const CLIENT_SAFE_CATEGORIES: ChangeCategory[] = [
  "SOFTWARE", "M365_CLOUD", "BACKUPS", "WORKSTATIONS", "TELECOM_PRINT", "CONTRACTS", "ORGANIZATIONAL", "OTHER",
];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const item = await prisma.change.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      author: { select: { firstName: true, lastName: true } },
      reviewer: { select: { firstName: true, lastName: true } },
      approver: { select: { firstName: true, lastName: true } },
      mergedInto: { select: { id: true, title: true } },
      mergedFrom: { select: { id: true, title: true, changeDate: true } },
      aiSignals: true,
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = await prisma.change.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if ("summary" in body) data.summary = body.summary || null;
  if (typeof body.body === "string") data.body = body.body;
  if (body.category && CATEGORIES.includes(body.category)) data.category = body.category;
  if (body.impact && IMPACTS.includes(body.impact)) data.impact = body.impact;
  if (body.status && STATUSES.includes(body.status)) data.status = body.status;
  if (body.changeDate) data.changeDate = new Date(body.changeDate);
  if (Array.isArray(body.linkedTicketIds)) data.linkedTicketIds = body.linkedTicketIds.map(String);
  if (Array.isArray(body.linkedAssetIds)) data.linkedAssetIds = body.linkedAssetIds.map(String);
  if (Array.isArray(body.linkedSoftwareIds)) data.linkedSoftwareIds = body.linkedSoftwareIds.map(String);
  if (Array.isArray(body.linkedPolicyIds)) data.linkedPolicyIds = body.linkedPolicyIds.map(String);
  if (Array.isArray(body.linkedParticularityIds)) data.linkedParticularityIds = body.linkedParticularityIds.map(String);

  if ("exposeToClientAdmin" in body) {
    const expose = Boolean(body.exposeToClientAdmin);
    const effectiveCategory = (data.category as ChangeCategory | undefined) ?? existing.category;
    if (expose && !CLIENT_SAFE_CATEGORIES.includes(effectiveCategory)) {
      return NextResponse.json({ error: "Cette catégorie technique ne peut pas être exposée au client." }, { status: 400 });
    }
    data.exposeToClientAdmin = expose;
  }

  if (body.visibility && VIS.includes(body.visibility)) {
    // Règle dure : toute visibility CLIENT_* nécessite exposeToClientAdmin + catégorie safe
    const effectiveExpose = ("exposeToClientAdmin" in body) ? Boolean(body.exposeToClientAdmin) : existing.exposeToClientAdmin;
    const effectiveCategory = (data.category as ChangeCategory | undefined) ?? existing.category;
    if (body.visibility !== "INTERNAL" && (!effectiveExpose || !CLIENT_SAFE_CATEGORIES.includes(effectiveCategory))) {
      return NextResponse.json({ error: "Visibilité client refusée : catégorie ou flag d'exposition incompatible." }, { status: 400 });
    }
    data.visibility = body.visibility;
  }

  if (body.publish === true && existing.status !== "PUBLISHED") {
    data.status = "PUBLISHED";
    data.publishedAt = new Date();
    data.approverId = me.id;
  }
  if (body.approve === true && existing.status === "AI_SUGGESTED") {
    data.status = "APPROVED";
    data.approverId = me.id;
    data.manualEntry = false;
  }
  if (body.reject === true) {
    data.status = "REJECTED";
  }

  const updated = await prisma.change.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await prisma.change.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
