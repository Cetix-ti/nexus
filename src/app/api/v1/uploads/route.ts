import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { uploadFile } from "@/lib/storage/minio";

/**
 * POST /api/v1/uploads
 *
 * Upload multipart :
 *   - file       : le fichier (obligatoire)
 *   - ticketId   : optionnel — si fourni, crée aussi une row Attachment
 *                  reliée au ticket
 *   - commentId  : optionnel — idem, relie au commentaire
 *   - prefix     : optionnel — dossier S3 (défaut : "uploads")
 *
 * Retourne `{ id, url, name, size, mimeType }`. `id` est l'id de la
 * row Attachment si un ticketId/commentId a été fourni, sinon null.
 *
 * Utilisé :
 *   - Par l'éditeur rich-text pour insérer une image inline (upload →
 *     url → <img src>).
 *   - Pour les pièces jointes d'un ticket (attach multiple files).
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    // Les contacts clients n'uploadent pas via cette route — ils ont
    // le portail qui a son propre upload (permissions scoped par org).
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file requis" }, { status: 400 });
  }

  // Limite dure côté serveur : 25 MB (protège contre les envois massifs).
  const MAX_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
      { status: 413 },
    );
  }

  const prefixRaw = (form.get("prefix") as string | null) || "uploads";
  // Sanitize : empêche "../", chemins absolus, etc.
  const prefix = prefixRaw.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "") || "uploads";

  const ticketId = form.get("ticketId") as string | null;
  const commentId = form.get("commentId") as string | null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";

  const uploaded = await uploadFile(prefix, file.name, buffer, mime);

  let attachmentId: string | null = null;
  if (ticketId || commentId) {
    // Vérifie que le ticket/comment existe (évite orphans).
    if (ticketId) {
      const exists = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
      }
    }
    const att = await prisma.attachment.create({
      data: {
        ticketId: ticketId || null,
        commentId: commentId || null,
        fileName: file.name,
        fileSize: file.size,
        mimeType: mime,
        url: uploaded.url,
      },
    });
    attachmentId = att.id;
  }

  return NextResponse.json(
    {
      id: attachmentId,
      url: uploaded.url,
      name: file.name,
      size: file.size,
      mimeType: mime,
    },
    { status: 201 },
  );
}
