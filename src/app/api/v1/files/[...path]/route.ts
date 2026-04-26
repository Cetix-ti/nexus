// ============================================================================
// GET /api/v1/files/[...path]
//
// Proxy read-only vers les fichiers stockés dans MinIO. Pourquoi :
// MinIO tourne en interne sur http://localhost:9000 — inaccessible depuis
// le navigateur. On sert les objets via le même domaine que l'app
// (https://nexus.cetix.ca/api/v1/files/...).
//
// SÉCURITÉ (Phase 10B) :
//   - Tous les uploads sont en ACL "public-read" côté MinIO. Si quelqu'un
//     connaît l'URL UUID, il peut bypass le proxy et taper MinIO direct
//     (le port reste interne en prod, mais le ferait depuis l'intérieur
//     du réseau de l'infra).
//   - Le proxy AUTHENTIFIE désormais l'appelant pour les préfixes privés
//     (uploads/, attachments/, ...). Les préfixes "publics nécessaires"
//     (logos/, email-images/) restent accessibles sans cookie pour ne
//     pas casser l'affichage des logos dans les emails sortants ni les
//     images inline d'un ticket transféré par email externe.
//
// Pour fichiers strictement privés (rapports, exports paie...), utiliser
// getPresignedDownloadUrl à la place et ne pas passer par ce proxy.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/storage/minio";
import { getCurrentUser } from "@/lib/auth-utils";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";

const BUCKET = process.env.S3_BUCKET || "nexus";

/** Préfixes accessibles sans authentification — nécessaires pour
 *  l'affichage dans des contextes hors-session (emails sortants, images
 *  inline reçues par email, signatures email, logos affichés sur la
 *  page de connexion / login). Toute clé hors de cette liste exige
 *  une session valide (agent OU portail client). */
const PUBLIC_PREFIXES = ["logos/", "email-images/", "public/"];

function isPublicKey(key: string): boolean {
  return PUBLIC_PREFIXES.some((p) => key.startsWith(p));
}

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

  // Auth gate (Phase 10B). Préfixes publics whitelistés (logos, images
  // emails). Tout le reste exige une session — accepte agent OU portail
  // client (les contacts ont besoin de leurs pièces jointes ticket).
  if (!isPublicKey(key)) {
    const agent = await getCurrentUser();
    const portal = agent ? null : await getCurrentPortalUser();
    if (!agent && !portal) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
