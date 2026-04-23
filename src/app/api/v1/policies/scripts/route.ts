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
  const categoryId = searchParams.get("categoryId");
  const language = searchParams.get("language") as ScriptLanguage | null;
  const search = searchParams.get("search")?.trim();
  const where: Record<string, unknown> = { archivedAt: null };
  if (categoryId) where.categoryId = categoryId;
  if (language && LANGS.includes(language)) where.language = language;
  if (search) where.OR = [
    { title: { contains: search, mode: "insensitive" } },
    { bodyDocMarkdown: { contains: search, mode: "insensitive" } },
  ];
  const items = await prisma.scriptTemplate.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      _count: { select: { instances: true, publications: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const title = String(body?.title ?? "").trim();
  const language = body?.language as ScriptLanguage;
  if (!title || !LANGS.includes(language)) {
    return NextResponse.json({ error: "title et language requis" }, { status: 400 });
  }
  const created = await prisma.scriptTemplate.create({
    data: {
      title,
      language,
      categoryId: body?.categoryId || null,
      bodyCode: body?.bodyCode || "",
      bodyDocMarkdown: body?.bodyDocMarkdown || null,
      variables: body?.variables ?? null,
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      runAs: body?.runAs || null,
      schedule: body?.schedule || null,
      visibilityDefault: VIS.includes(body?.visibilityDefault) ? body.visibilityDefault : "INTERNAL",
      createdByUserId: me.id,
      updatedByUserId: me.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
