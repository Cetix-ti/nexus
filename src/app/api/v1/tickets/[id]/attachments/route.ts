import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { deleteFile, extractKeyFromUrl } from "@/lib/storage/minio";

/**
 * GET /api/v1/tickets/[id]/attachments
 * Liste les attachments directement rattachés au ticket (pas ceux des
 * commentaires — ceux-là sont fetchés avec le commentaire).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const rows = await prisma.attachment.findMany({
    where: { ticketId: id, commentId: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    rows.map((a) => ({
      id: a.id,
      name: a.fileName,
      size: a.fileSize,
      mimeType: a.mimeType,
      url: a.url,
      createdAt: a.createdAt.toISOString(),
    })),
  );
}

/**
 * DELETE /api/v1/tickets/[id]/attachments?attachmentId=...
 * Supprime la row + l'objet S3.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const attachmentId = new URL(req.url).searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId requis" }, { status: 400 });
  }

  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att || att.ticketId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete S3 object best-effort (la row est supprimée même si S3 rate —
  // on ne veut pas bloquer la suppression côté UI pour un nettoyage).
  const key = extractKeyFromUrl(att.url);
  if (key) {
    deleteFile(key).catch(() => {});
  }
  await prisma.attachment.delete({ where: { id: attachmentId } });
  return NextResponse.json({ ok: true });
}
