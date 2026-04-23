// Transforme un GpoImport analysé en GpoTemplate (global).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const imp = await prisma.gpoImport.findUnique({ where: { id } });
  if (!imp) return NextResponse.json({ error: "Import introuvable" }, { status: 404 });
  if (imp.status !== "ANALYZED" || !imp.aiAnalysis) {
    return NextResponse.json({ error: "Analyse IA indisponible" }, { status: 400 });
  }
  const a = imp.aiAnalysis as {
    nameSuggested?: string;
    scopeSuggested?: "COMPUTER" | "USER" | "MIXED";
    description?: string;
    procedure?: string;
    variables?: unknown;
    dependencies?: unknown;
  };
  const tpl = await prisma.gpoTemplate.create({
    data: {
      nameStem: a.nameSuggested ?? imp.filename.replace(/\.[^.]+$/, ""),
      scope: a.scopeSuggested ?? "COMPUTER",
      description: a.description ?? null,
      body: "",
      deploymentProcedure: a.procedure ?? null,
      variables: (a.variables as never) ?? null,
      dependencies: (a.dependencies as never) ?? null,
      createdByUserId: me.id,
      updatedByUserId: me.id,
    },
  });
  await prisma.gpoImport.update({
    where: { id },
    data: { status: "APPLIED", resultingTemplateId: tpl.id },
  });
  return NextResponse.json({ template: tpl });
}
