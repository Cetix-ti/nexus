// ============================================================================
// GET /api/v1/files/[...path]
//
// Proxy public read-only vers les fichiers stockés dans MinIO. Pourquoi :
// MinIO tourne en interne sur http://localhost:9000 — inaccessible depuis
// le navigateur des agents/clients. On résout ça en servant les objets via
// le même domaine que l'app (https://nexus.cetix.ca/api/v1/files/...).
//
// Utilisé par :
//   - les descriptions de tickets (images inline email)
//   - les logos d'organisation
//   - les pièces jointes KB
//
// Pas d'authentification : les objets MinIO sont stockés avec ACL "public-read"
// via `uploadFile` (lib/storage/minio.ts). Le proxy se contente de relayer
// — l'ACL côté MinIO reste la source de vérité. Pour les fichiers privés,
// utiliser getPresignedDownloadUrl à la place.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/storage/minio";

const BUCKET = process.env.S3_BUCKET || "nexus";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Le premier segment peut être le nom du bucket (pattern MinIO path-style
   // `${endpoint}/${bucket}/${key}`). On le strippe s'il matche pour accepter
   // les URLs héritées stockées avec le bucket dans le chemin.
  const segments = path.map((p) => decodeURIComponent(p));
  const keySegments = segments[0] === BUCKET ? segments.slice(1) : segments;
  if (keySegments.length === 0) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  const key = keySegments.join("/");

  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const body = result.Body;
    if (!body) {
      return NextResponse.json({ error: "Empty object" }, { status: 404 });
    }

    // Stream vers la réponse. @aws-sdk/client-s3 renvoie un ReadableStream
    // (web) dans les runtimes modernes — compatible avec NextResponse.
    const headers = new Headers();
    if (result.ContentType) headers.set("content-type", result.ContentType);
    if (result.ContentLength)
      headers.set("content-length", String(result.ContentLength));
    if (result.ETag) headers.set("etag", result.ETag);
    // Cache long : les objets sont immutables (UUID dans le nom).
    headers.set("cache-control", "public, max-age=31536000, immutable");

    return new NextResponse(body as ReadableStream, { status: 200, headers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NoSuchKey") || msg.includes("NotFound")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.warn("[files proxy]", key, msg);
    return NextResponse.json({ error: "Storage error" }, { status: 502 });
  }
}
