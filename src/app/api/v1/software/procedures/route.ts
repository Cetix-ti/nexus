import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, SoftwareProcedureKind } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const KINDS: SoftwareProcedureKind[] = ["INSTALL", "CONFIG", "UNINSTALL", "TROUBLESHOOT", "UPGRADE", "OTHER"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get("templateId");
  const instanceId = searchParams.get("instanceId");
  const where: Record<string, unknown> = {};
  if (templateId) where.softwareTemplateId = templateId;
  if (instanceId) where.softwareInstanceId = instanceId;
  const items = await prisma.softwareProcedure.findMany({
    where,
    orderBy: [{ kind: "asc" }, { title: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title requis" }, { status: 400 });
  if (!body?.softwareTemplateId && !body?.softwareInstanceId) {
    return NextResponse.json({ error: "templateId ou instanceId requis" }, { status: 400 });
  }
  const created = await prisma.softwareProcedure.create({
    data: {
      title,
      kind: KINDS.includes(body?.kind) ? body.kind : "INSTALL",
      body: body?.body || "",
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      softwareTemplateId: body?.softwareTemplateId || null,
      softwareInstanceId: body?.softwareInstanceId || null,
      createdByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
