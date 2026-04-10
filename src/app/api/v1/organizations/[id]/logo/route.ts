import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { uploadOrgLogo, deleteFile, extractKeyFromUrl } from "@/lib/storage/minio";

// Logos sous ce seuil sont stockés en data URI base64 directement dans la
// colonne `logo` (text) — évite la dépendance MinIO et les problèmes
// d'URLs internes (`http://localhost:9000/...`) injoignables depuis le
// navigateur du client.
const INLINE_LOGO_MAX_BYTES = 500 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

/**
 * POST /api/v1/organizations/[id]/logo
 *
 * Multipart form upload — field "file". Stores the logo in MinIO and updates
 * the organization's logo URL. Sets logoOverridden=true so future
 * enrichments don't replace it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Form data attendu" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Fichier manquant (champ 'file')" }, { status: 400 });
  }

  const mime = (file.type || "image/png").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Type non supporté : ${mime}` },
      { status: 415 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier > 5 Mo" }, { status: 413 });
  }

  // Delete the previous MinIO-hosted logo if any (no-op for inline data URIs).
  if (org.logo) {
    const oldKey = extractKeyFromUrl(org.logo);
    if (oldKey) {
      try {
        await deleteFile(oldKey);
      } catch {
        /* MinIO peut être down — on ignore */
      }
    }
  }

  let logoUrl: string;
  if (buf.length <= INLINE_LOGO_MAX_BYTES) {
    // Stockage inline base64 — toujours visible depuis n'importe quel navigateur.
    logoUrl = `data:${mime};base64,${buf.toString("base64")}`;
  } else {
    // Gros fichier : on tente MinIO. Si ça échoue on renvoie une erreur claire.
    try {
      const upload = await uploadOrgLogo(id, file.name, buf, mime);
      logoUrl = upload.url;
    } catch (e) {
      return NextResponse.json(
        {
          error:
            "Stockage objet indisponible et fichier trop volumineux pour stockage inline (>500 Ko). Compressez votre logo.",
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 503 }
      );
    }
  }

  await prisma.organization.update({
    where: { id },
    data: { logo: logoUrl, logoOverridden: true },
  });

  return NextResponse.json({ success: true, url: logoUrl });
}

/**
 * DELETE /api/v1/organizations/[id]/logo
 *
 * Removes the logo (sets it to null and clears the override flag so future
 * enrichments can re-populate it).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }
  if (org.logo) {
    const key = extractKeyFromUrl(org.logo);
    if (key) await deleteFile(key);
  }
  await prisma.organization.update({
    where: { id },
    data: { logo: null, logoOverridden: false },
  });
  return NextResponse.json({ ok: true });
}
