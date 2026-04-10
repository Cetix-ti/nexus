// ============================================================================
// MinIO / S3 storage helper
// ============================================================================
// Wraps the AWS SDK to point at our local MinIO instance and provides
// high-level helpers for uploading files (logos, attachments, KB images).
// ============================================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
const ACCESS_KEY = process.env.S3_ACCESS_KEY || "nexus";
const SECRET_KEY = process.env.S3_SECRET_KEY || "nexus-dev-secret";
const BUCKET = process.env.S3_BUCKET || "nexus";
const REGION = process.env.S3_REGION || "us-east-1";
const PUBLIC_BASE_URL =
  process.env.S3_PUBLIC_URL || ENDPOINT.replace(/\/$/, "");

export const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
  forcePathStyle: true, // required for MinIO
});

let bucketEnsured = false;

async function ensureBucket() {
  if (bucketEnsured) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch (e) {
      // Race or already exists — ignore
    }
  }
  bucketEnsured = true;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

/**
 * Upload an arbitrary file to MinIO.
 *
 * @param prefix    Folder/prefix inside the bucket (e.g. "logos/orgs")
 * @param fileName  Original filename — used to derive the extension
 * @param body      Buffer to upload
 * @param mimeType  MIME type
 * @returns         The S3 key, public URL, size, and mime type
 */
export async function uploadFile(
  prefix: string,
  fileName: string,
  body: Buffer,
  mimeType: string
): Promise<UploadResult> {
  await ensureBucket();
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const key = `${prefix.replace(/^\/|\/$/g, "")}/${randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType,
      // Public-read so the browser can fetch directly without presigning
      ACL: "public-read",
    })
  );

  return {
    key,
    url: `${PUBLIC_BASE_URL}/${BUCKET}/${key}`,
    size: body.length,
    mimeType,
  };
}

/**
 * Upload an organization logo. Returns the public URL.
 */
export async function uploadOrgLogo(
  orgId: string,
  fileName: string,
  body: Buffer,
  mimeType: string
): Promise<UploadResult> {
  return uploadFile(`logos/orgs/${orgId}`, fileName, body, mimeType);
}

/**
 * Delete an object by its key (the path inside the bucket).
 */
export async function deleteFile(key: string): Promise<void> {
  await ensureBucket();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    /* ignore */
  }
}

/**
 * Generate a presigned download URL valid for `expiresInSeconds` seconds.
 * Use this for private files; for public files, use the URL returned by uploadFile.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

/**
 * Extract the S3 key from a full public URL produced by `uploadFile`.
 * Returns null if the URL is not a MinIO/S3 URL we manage.
 */
export function extractKeyFromUrl(url: string): string | null {
  const prefix = `${PUBLIC_BASE_URL}/${BUCKET}/`;
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length);
  }
  return null;
}
