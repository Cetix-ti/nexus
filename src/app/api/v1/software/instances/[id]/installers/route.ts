// Upload d'un installeur pour une instance (scope=ORG).
// multipart/form-data : file + title + notes?
// Taille max : 2 GB (configurable via env).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { saveUploadedBuffer } from "@/lib/software/storage";

const MAX_SIZE = Number(process.env.NEXUS_SOFTWARE_MAX_SIZE ?? 2_147_483_648);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const inst = await prisma.softwareInstance.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!inst) return NextResponse.json({ error: "Instance introuvable" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim() || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "file requis" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "title requis" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Fichier trop volumineux" }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const { storagePath, sha256, sizeBytes } = await saveUploadedBuffer(buf, {
    scope: "ORG",
    organizationId: inst.organizationId,
    instanceId: inst.id,
    filename: file.name,
  });

  const installer = await prisma.softwareInstaller.create({
    data: {
      title,
      filename: file.name,
      sizeBytes,
      sha256,
      storagePath,
      scope: "ORG",
      softwareInstanceId: inst.id,
      organizationId: inst.organizationId,
      notes,
      uploadedByUserId: me.id,
    },
  });
  return NextResponse.json(installer, { status: 201 });
}
