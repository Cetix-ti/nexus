// Upload d'un fichier GPO exporté (XML/backup). L'IA analyse et propose
// titre/description/procédure/variables/dépendances. Rien n'est créé
// automatiquement — l'agent valide ensuite via POST /api/v1/policies/gpo
// (ou un endpoint dérivé "from-import").

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { analyzeGpoSource } from "@/lib/ai/gpo-analyze";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const organizationId = (form.get("organizationId") as string | null) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "file requis" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Fichier trop volumineux (max 8 MB)" }, { status: 413 });
  const buf = await file.arrayBuffer();
  const rawContent = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  let organizationName: string | null = null;
  if (organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    organizationName = org?.name ?? null;
  }

  const imp = await prisma.gpoImport.create({
    data: {
      organizationId,
      uploadedByUserId: me.id,
      filename: file.name,
      rawContent,
      status: "PENDING",
    },
  });

  const analysis = await analyzeGpoSource({
    rawContent,
    filename: file.name,
    organizationName,
    userId: me.id,
  });

  const updated = await prisma.gpoImport.update({
    where: { id: imp.id },
    data: {
      status: analysis.ok ? "ANALYZED" : "PENDING",
      aiAnalysis: analysis as never,
    },
  });

  return NextResponse.json({ import: updated, analysis }, { status: 201 });
}
