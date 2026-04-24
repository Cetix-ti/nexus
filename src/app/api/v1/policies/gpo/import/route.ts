// Upload d'un fichier GPO exporté (XML/backup/zip). L'IA analyse et propose
// titre/description/procédure/variables/dépendances. Rien n'est créé
// automatiquement — l'agent valide ensuite via POST /api/v1/policies/gpo
// (ou un endpoint dérivé "from-import").

import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { analyzeGpoSource } from "@/lib/ai/gpo-analyze";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

/** Extrait les fichiers XML/INF d'un ZIP et les concatène en texte lisible. */
function extractZipText(buf: Buffer): string {
  const texts: string[] = [];
  let i = 0;
  while (i < buf.length - 30) {
    // Local file header signature: PK\x03\x04
    if (buf[i] !== 0x50 || buf[i + 1] !== 0x4B || buf[i + 2] !== 0x03 || buf[i + 3] !== 0x04) {
      i++; continue;
    }
    const flags = buf.readUInt16LE(i + 6);
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const fnLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const fn = buf.toString("utf8", i + 30, i + 30 + fnLen);
    const dataStart = i + 30 + fnLen + extraLen;
    // Skip entries with data descriptor (size unknown in local header)
    if ((flags & 0x08) && compSize === 0) { i = dataStart; continue; }
    // Directory entries
    if (compSize === 0) { i = dataStart + 1; continue; }
    const lower = fn.toLowerCase();
    if ((lower.endsWith(".xml") || lower.endsWith(".inf")) && compSize < 4_000_000) {
      try {
        const slice = buf.subarray(dataStart, dataStart + compSize);
        const raw = method === 0 ? slice : method === 8 ? inflateRawSync(slice) : null;
        if (raw) {
          const txt = raw.toString("utf8").trim();
          if (txt) texts.push(`<!-- ${fn} -->\n${txt}`);
        }
      } catch { /* entrée corrompue, on ignore */ }
    }
    i = dataStart + compSize;
  }
  return texts.join("\n\n---\n\n");
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const organizationId = (form.get("organizationId") as string | null) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "file requis" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Fichier trop volumineux (max 8 MB)" }, { status: 413 });
  const buf = await file.arrayBuffer();
  const buffer = Buffer.from(buf);
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
  const rawContent = isZip
    ? extractZipText(buffer)
    : new TextDecoder("utf-8", { fatal: false }).decode(buf).replace(/\0/g, "");
  if (!rawContent.trim()) {
    return NextResponse.json({ error: "Aucun contenu XML/INF lisible trouvé dans le fichier ZIP" }, { status: 422 });
  }

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
