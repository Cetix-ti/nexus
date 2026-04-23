import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import type { ContentVisibility, ScriptLanguage } from "@prisma/client";

const VIS: ContentVisibility[] = ["INTERNAL", "CLIENT_ADMIN", "CLIENT_ALL"];
const LANGS: ScriptLanguage[] = ["POWERSHELL", "BASH", "PYTHON", "BATCH", "OTHER"];

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const where: Record<string, unknown> = {};
  if (orgId) where.organizationId = orgId;
  const items = await prisma.scriptInstance.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      template: { select: { id: true, title: true, schemaVersion: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const organizationId = String(body?.organizationId ?? "");
  const title = String(body?.title ?? "").trim();
  const language = body?.language as ScriptLanguage;
  if (!organizationId || !title || !LANGS.includes(language)) {
    return NextResponse.json({ error: "organizationId, title et language requis" }, { status: 400 });
  }
  let templateSchemaVersion: number | null = null;
  if (body?.templateId) {
    const tpl = await prisma.scriptTemplate.findUnique({ where: { id: body.templateId }, select: { schemaVersion: true } });
    templateSchemaVersion = tpl?.schemaVersion ?? null;
  }
  const created = await prisma.scriptInstance.create({
    data: {
      organizationId,
      templateId: body?.templateId || null,
      templateSchemaVersion,
      title,
      language,
      bodyCode: body?.bodyCode || "",
      bodyDocMarkdown: body?.bodyDocMarkdown || null,
      resolvedVariables: body?.resolvedVariables ?? null,
      runAs: body?.runAs || null,
      schedule: body?.schedule || null,
      visibility: VIS.includes(body?.visibility) ? body.visibility : "INTERNAL",
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
